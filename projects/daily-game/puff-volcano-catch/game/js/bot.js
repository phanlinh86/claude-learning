/* Puff's Volcano Catch — VC.Bot (autoplay / tests / demo / high-speed playtest)
 *
 *   const bot = new VC.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);      // call every frame BEFORE world.update(dt)
 *   bot.stats          // { decisions, catches, misses, ouches, rains, steamed, levels, deaths, maxLevel }
 *
 * Plays only through the public input API (setTarget / setMove / action).
 * Strategy (docs/MECHANICS.md §6):
 *  1. Predict where every flying item crosses the catch line (y = rimY): solve
 *     y + vy·t + ½g·t² = rimY → (t, x). Items are "noticed" only after
 *     (1 − skill) × 0.4 s of flight (a slower eye).
 *  2. Plan: best chain of reachable coins in time order (DP, value + combo bonus),
 *     reachability |Δx| ≤ v·Δt + slack with v = maxSpeed × (0.8 + 0.15·skill)
 *     after a reaction delay. Target = first coin of the best chain.
 *  3. Rocks: if a rock will cross the line where Puff will be, use Cool Rain when
 *     charged and the rock is still above Puff for the rain's duration; else dodge
 *     sideways (to the side of the plan), unless blinking (invulnerable).
 *  4. Idle: drift toward the middle of the shore (the best spot to reach anything).
 * skill < 1: slower decisions, later noticing, aim noise, sometimes forgets the rain.
 */
(function (VC) {
  'use strict';

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = opts.skill !== undefined ? Math.max(0, Math.min(1, opts.skill)) : 0.8;
    this.rng = new VC.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { decisions: 0, catches: 0, misses: 0, ouches: 0, rains: 0, steamed: 0, levels: 0, deaths: 0, maxLevel: 0 };
    this._wait = 0;
    this._tx = null;
    this._noise = 0;
    this._last = null;
    this.plan = [];          // debug: [{id, x, t}] chosen chain
  }

  Bot.prototype._sync = function () {
    var w = this.world, l = this._last, s = this.stats;
    if (l && l.world === w && w.time >= l.time) {
      s.catches += Math.max(0, w.coinsTotal - l.c);
      s.misses += Math.max(0, w.missed - l.m);
      s.ouches += Math.max(0, w.rocksCaught - l.o);
      s.rains += Math.max(0, w.rains - l.r);
      s.steamed += Math.max(0, w.steamed - l.s);
      s.levels += Math.max(0, w.levelsCleared - l.lv);
      if (w.state === 'dead' && l.state !== 'dead') s.deaths++;
    }
    s.maxLevel = Math.max(s.maxLevel, w.level);
    this._last = { world: w, time: w.time, c: w.coinsTotal, m: w.missed, o: w.rocksCaught, r: w.rains, s: w.steamed, lv: w.levelsCleared, state: w.state };
  };

  /** Time (s from now) and x where a flying item crosses y = Y while moving down, or null. */
  Bot.cross = function (it, Y, g) {
    var a = 0.5 * g, b = it.vy, c = it.y - Y, disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    var t = (-b + Math.sqrt(disc)) / (2 * a);
    if (!(t >= 0)) return null;
    return { t: t, x: it.x + it.vx * t };
  };

  // a less skilled player overlooks some rocks (decided once per rock)
  Bot.prototype._sees = function (it) {
    if (!this._seen) this._seen = {};
    if (this._seen[it.id] === undefined) {
      this._seen[it.id] = !this.rng.chance((1 - this.skill) * 0.35);
      if (it.id % 64 === 0) { var keep = {}; keep[it.id] = this._seen[it.id]; this._seen = keep; }
    }
    return this._seen[it.id];
  };

  Bot.prototype._decide = function () {
    var w = this.world, c = w.cfg, p = w.puff, sk = this.skill, g = w.gEff, i, j, it, k;
    this.stats.decisions++;
    var notice = (1 - sk) * 0.4, react = 0.05 + (1 - sk) * 0.25;
    var v = c.maxSpeed * (0.8 + 0.15 * sk), slack = c.catchHalfW * (0.5 + 0.3 * sk);
    var coins = [], rocks = [];
    for (i = 0; i < w.items.length; i++) {
      it = w.items[i];
      if (it.state !== 'fly' || it.t < notice) continue;
      var cr = Bot.cross(it, c.rimY, g);
      if (!cr) continue;
      if (it.kind === 'coin') coins.push({ id: it.id, x: cr.x, t: cr.t, val: it.value + 2 });
      else if (this._sees(it)) rocks.push({ id: it.id, x: cr.x, t: cr.t, r: it.r, t392: Bot.cross(it, p.y, g) });
    }
    coins.sort(function (a, b) { return a.t - b.t; });
    // DP: best[i] = best chain value starting at coin i
    var n = coins.length, best = new Array(n), next = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      best[i] = coins[i].val; next[i] = -1;
      for (j = i + 1; j < n; j++) {
        if (Math.abs(coins[j].x - coins[i].x) <= v * (coins[j].t - coins[i].t) + slack && coins[i].val + best[j] > best[i]) {
          best[i] = coins[i].val + best[j]; next[i] = j;
        }
      }
    }
    var first = -1, bv = -1;
    for (i = 0; i < n; i++) {
      var tt = Math.max(0, coins[i].t - react);
      if (Math.abs(coins[i].x - p.rimX) <= v * tt + slack && (best[i] > bv || (best[i] === bv && first >= 0 && coins[i].t < coins[first].t))) { bv = best[i]; first = i; }
    }
    this.plan = [];
    for (k = first; k >= 0; k = next[k]) this.plan.push({ id: coins[k].id, x: coins[k].x, t: coins[k].t });
    var tx = first >= 0 ? coins[first].x : (c.xMin + c.xMax) / 2 + (p.x - (c.xMin + c.xMax) / 2) * 0.5;
    if (first >= 0 && next[first] >= 0) {
      // lean toward the next coin of the chain while staying inside this coin's catch window
      var nx = coins[next[first]], win = (c.catchHalfW + 7) * 0.75 * sk;
      if (nx.t - coins[first].t < 1.2) tx = Math.max(tx - win, Math.min(tx + win, nx.x));
    }
    // aim noise (refreshed slowly)
    if (sk < 1) { this._noise += (this.rng.gauss() * 26 * (1 - sk) - this._noise) * 0.4; tx += this._noise; }
    // the target is a RIM position; Puff x = rim − swing offset (≈ 0 at rest)
    tx -= (p.rimX - p.x);
    // rocks: rain or dodge
    var danger = null;
    for (i = 0; i < rocks.length; i++) {
      var rk = rocks[i];
      if (rk.t > 1.1 || p.invuln > rk.t + 0.05) continue;
      // where the rim will be at that time if we head for tx
      var dx = tx - p.x, reach = v * Math.max(0, rk.t - react * 0.5);
      var at = p.x + (Math.abs(dx) <= reach ? dx : (dx > 0 ? reach : -reach));
      var lim = c.catchHalfW + rk.r * c.catchRFrac + 14;
      if (Math.abs(rk.x - at) < lim || Math.abs(rk.x - p.rimX) < lim && rk.t < 0.35) { if (!danger || rk.t < danger.t) danger = rk; }
    }
    this._rainWish = false;
    if (danger) {
      var canRain = w.rain.charge >= 1 && w.rain.active <= 0 && danger.t392 && danger.t392.t > 0.05 && danger.t392.t < c.rainTime - 0.1;
      if (canRain && this.rng.chance(0.5 + 0.5 * sk)) this._rainWish = true;
      else {
        var lim2 = c.catchHalfW + danger.r * c.catchRFrac + 26;
        var left = danger.x - lim2, right = danger.x + lim2;
        tx = (Math.abs(left - tx) < Math.abs(right - tx) && left > c.xMin + 5) || right > c.xMax - 5 ? left : right;
      }
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
      this._wait = 0.02 + (1 - this.skill) * 0.25 + this.rng.range(0, 0.03 + (1 - this.skill) * 0.1);
      if (this._rainWish && w.state === 'playing') { w.action(); this._rainWish = false; }
    }
    w.setMove(0);
    w.setTarget(this._tx);
  };

  VC.Bot = Bot;
})(window.VC = window.VC || {});
