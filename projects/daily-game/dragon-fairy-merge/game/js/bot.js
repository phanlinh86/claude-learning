/* Mossy's Egg Grove — MEG.Bot: a simple player for the title demo, ?bot=1 and the headless sims (DESIGN §5)
 *
 *   var bot = new MEG.Bot(world, { skill: 0..1, seed: 3, pace: 0 });
 *   bot.step(dt);          // call before world.update(dt) with the same dt
 *
 * Per egg: think 0.35–0.8 s → sample 12–24 x positions → world.predictDrop(x) (the same physics as the real drop)
 * → score each landing → moveTo(best + error) → wait until Mossy is there (and calm in his flight) → drop().
 * Landing score: touching an egg of the same kind (big +, more for big kinds), a twin just below/beside the landing
 * that it will likely roll into (+, fading over 1.5 u), next to kind ± 1 (small +),
 * low landing (+), burying smaller eggs under a bigger one (−), landing high near the vine (− −).
 * Error ∝ (1 − skill): gaussian aim noise (σ = 2.2·(1 − skill) u) and, with probability 0.6·(1 − skill), a random
 * spot instead of the best one. skill 0 = drops anywhere (a toddler), 0.5 ≈ a casual kid, 1 = careful adult.
 * Spots where world.dropBlocked(x) (the pile reaches Mossy's claws) are never chosen; a refused drop makes the bot
 * think again after 0.35–0.8 s (if every spot is blocked it simply waits for the fairy / game over).
 * opts.pace (s) = least time between two drops (the sims use ≈ 2 s to model a human's tempo).
 */
(function (MEG) {
  'use strict';
  var M = Math;

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = M.max(0, M.min(1, opts.skill == null ? 1 : +opts.skill));
    this.rng = new MEG.RNG(opts.seed === undefined ? 1 : opts.seed);
    this.pace = +opts.pace || 0;
    this.think = -1; this.target = null; this.waitT = 0; this.sinceDrop = 99;
    this.lastPlan = null;   // { x, score, landX, landY } (debug / tests)
  }

  /** score of dropping the held egg at x (higher is better) */
  Bot.prototype.evaluate = function (x) {
    var w = this.world, C = MEG.World.CONFIG, p = w.predictDrop(x, 0), k = p.kind, r = p.r;
    if (w.dropBlocked && w.dropBlocked(x)) return { x: x, score: -1e9, landX: p.landX, landY: p.landY };
    var s = -0.7 * p.landY, eggs = w.eggs, i;
    for (i = 0; i < eggs.length; i++) {
      var e = eggs[i], dx = e.x - p.landX, dy = e.y - p.landY, gap = M.sqrt(dx * dx + dy * dy) - e.r - r;
      if (e.kind === k) {
        if (gap < 0.25) s += 9 + k;                                                  // lands right on a twin
        else if (gap < 1.5 && e.y < p.landY + 0.3) s += (6 + k) * (1 - gap / 1.5);  // will likely roll into it
      } else if (gap < 0.25 && M.abs(e.kind - k) === 1) s += 1.5;
      if (gap < 0.25 && e.y < p.landY && e.kind < k - 1) s -= 1.5 * (k - e.kind - 1);
    }
    var top = p.landY + r;
    if (top > C.DANGER_Y - 0.6) s -= 25 + 10 * (top - C.DANGER_Y + 0.6);
    return { x: x, score: s, landX: p.landX, landY: p.landY };
  };

  Bot.prototype._choose = function () {
    var w = this.world, C = MEG.World.CONFIG, k = w.held || w.next, r = MEG.World.KINDS[k - 1].r;
    var lo = r, hi = C.NEST_W - r, n = M.round(12 + 12 * this.skill), best = null, i;
    for (i = 0; i < n; i++) {
      var x = lo + (hi - lo) * (i + this.rng.next()) / n;
      var ev = this.evaluate(x);
      if (!best || ev.score > best.score) best = ev;
    }
    var miss = 1 - this.skill, x0 = best.x;
    if (this.rng.chance(0.6 * miss)) x0 = this.rng.range(lo, hi);
    x0 += this.rng.gauss() * 2.2 * miss;
    x0 = M.max(lo, M.min(hi, x0));
    this.lastPlan = best;
    return x0;
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    this.sinceDrop += dt;
    if (w.phase !== 'play') return;
    if (!w.canDrop) { this.target = null; this.think = -1; return; }
    if (this.target === null) {
      if (this.think < 0) this.think = this.rng.range(0.35, 0.8);
      this.think -= dt;
      if (this.think > 0) return;
      this.target = this._choose(); this.waitT = 0;
      w.moveTo(this.target);
      return;
    }
    this.waitT += dt;
    var m = w.mossy, there = M.abs(m.x - m.tx) < 0.06 && M.abs(m.vx) < 0.6;
    if ((there || this.waitT > 2) && this.sinceDrop >= this.pace) {
      if (w.drop()) { this.sinceDrop = 0; this.target = null; this.think = -1; }
      else { this.target = null; this.think = -1; }   // refused ('blocked'): think again (another spot, or wait)
    }
  };

  MEG.Bot = Bot;
})(window.MEG = window.MEG || {});
