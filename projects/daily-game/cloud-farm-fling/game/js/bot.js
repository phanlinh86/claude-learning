/* Nubi's Farm Fling — CFF.Bot: an autopilot that flings like a person (DESIGN §5)
 *
 *   var bot = new CFF.Bot(world, { skill: 0.85, seed: 3 });
 *   bot.step(dt);          // call once per frame BEFORE world.update(dt); it only uses aim / release / puff
 *   bot.stats              // {shots, planned, noPlan, puffs}
 *
 * Plan (phase 'aim', after a think time of 0.4–0.9 s): Nubi's size at the release moment comes from
 * world.sizeAfter(AIM_T). For every candidate launch angle 30°–70° (step 5°) it solves the launch speed with
 * World.solveSpeed (the world's own size-aware step: buoyancy + drag + growth in flight) for the wagon position
 * PREDICTED at landing time (World.wagonX, iterated: the flight time depends on where it lands). Each candidate is
 * then replayed with world.predictShot (the very same step code, so firefly pickups — which make Nubi bigger and
 * the flight shorter — and crow bumps are exact) and re-aimed once by the landing error. Score: landing (+100),
 * bullseye (+8), fireflies (+6 per point), crow bumps (−40), a small preference for medium angles and the centre.
 * Error ∝ (1 − skill): angle σ = (1 − s)·ANG_ERR°, power σ = (1 − s)·POW_ERR (fraction), fixed per shot.
 * The pull is animated (ease-out) from rest to the target over AIM_T ≈ 0.5 s, then released.
 * In flight it re-predicts every 0.1 s and uses the one puff if Nubi would come down SHORT of the wagon and a puff
 * now would land him (skill ≥ 0.3 only; low skill puffs at random sometimes).
 */
(function (CFF) {
  'use strict';
  var M = Math, DEG = M.PI / 180;
  var THINK = [0.4, 0.9], AIM_T = 0.5, ANG_ERR = 35, POW_ERR = 0.58, ANGLES = [30, 70, 5], CHECK = 0.1;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 1 : +opts.skill, 0, 1);
    this.rng = new CFF.RNG(opts.seed === undefined ? 1 : opts.seed);
    this.state = 'idle'; this.t = 0; this.think = 0;
    this.plan = null; this.target = null; this._checkT = 0;
    this.stats = { shots: 0, planned: 0, noPlan: 0, puffs: 0 };
  }
  Bot.THINK = THINK; Bot.AIM_T = AIM_T;

  /** best plan for a release `wait` seconds from now (no error); null if nothing lands */
  Bot.prototype.solve = function (wait) {
    var w = this.world, W = CFF.World, wg = w.wagon, sz = w.sizeAfter(wait), best = null;
    var iters = wg.amp > 0 || wg.t + wait < W.CONFIG.WAGON_GLIDE ? 3 : 1;
    for (var a = ANGLES[0]; a <= ANGLES[1] + 1e-9; a += ANGLES[2]) {
      var ang = a * DEG, T = 1.6, sol = null, X = wg.baseX;
      for (var it = 0; it < iters; it++) {
        X = W.wagonX(wg, wg.t + wait + T);
        sol = W.solveSpeed(ang, X, wg.top, sz.size, sz.goal);
        if (!sol || !sol.pull) { sol = null; break; }
        T = sol.T;
      }
      if (!sol) continue;
      var pull = sol.pull, pr = w.predictShot(pull, wait);
      if (pr.type === 'land' ? M.abs(pr.off) > 0.15 : pr.flies > 0) {        // fireflies changed the flight: re-aim once
        var s2 = W.solveSpeed(ang, X - pr.off, wg.top, sz.size, sz.goal);
        if (s2 && s2.pull) { var p2 = w.predictShot(s2.pull, wait); if (p2.type === 'land' || pr.type !== 'land') { pull = s2.pull; pr = p2; } }
      }
      var score = (pr.type === 'land' ? 100 : 0) + (pr.bull ? 8 : 0) + pr.value * 6
        - pr.bumps * 40 - M.abs(a - 48) * 0.05 - (pr.type === 'land' ? M.abs(pr.off) * 2 : 0);
      if (!best || score > best.score) best = { score: score, pull: pull, angle: ang, pred: pr };
    }
    return best;
  };

  Bot.prototype.step = function (dt) {
    var w = this.world, C = CFF.World.CONFIG;
    dt = M.max(0, +dt || 0);
    if (w.phase === 'aim') {
      if (this.state !== 'think' && this.state !== 'aim') { this.state = 'think'; this.t = 0; this.think = this.rng.range(THINK[0], THINK[1]); }
      this.t += dt;
      if (this.state === 'think' && this.t >= this.think) {
        var plan = this.solve(AIM_T);
        this.stats.planned++;
        if (!plan || plan.pred.type !== 'land') this.stats.noPlan++;
        if (!plan) {                                                     // fall back: a medium fling at the wagon
          var s = CFF.World.solveSpeed(48 * DEG, w.wagon.x, w.wagon.top, w.nubi.size, w.nubi.goal);
          plan = { pull: s && s.pull ? s.pull : { x: -1.0, y: -0.9 }, angle: 48 * DEG };
        }
        var e = 1 - this.skill, ang = M.atan2(-plan.pull.y, -plan.pull.x) + this.rng.gauss() * e * ANG_ERR * DEG;
        var L = M.sqrt(plan.pull.x * plan.pull.x + plan.pull.y * plan.pull.y) * (1 + this.rng.gauss() * e * POW_ERR);
        L = clamp(L, C.PULL_MIN + 0.01, C.PULL_MAX);
        this.target = { x: -M.cos(ang) * L, y: -M.sin(ang) * L };
        this.plan = plan; this.state = 'aim'; this.t = 0;
      }
      if (this.state === 'aim') {
        var k = clamp(this.t / AIM_T, 0, 1), ek = 1 - (1 - k) * (1 - k);   // ease-out: a quick stretch that settles
        w.aim(this.target.x * ek, this.target.y * ek);
        if (this.t >= AIM_T - 1e-9) {
          w.aim(this.target.x, this.target.y);
          if (w.release()) this.stats.shots++;
          this.state = 'fly'; this.t = 0; this._checkT = 0;
        }
      }
    } else if (w.phase === 'fly') {
      if (this.state !== 'fly') { this.state = 'fly'; this._checkT = 0; }
      this._checkT -= dt;
      if (!w.puffed && this._checkT <= 0) {
        this._checkT = CHECK;
        if (this.skill >= 0.3) {
          var now = w.nubi.vy < 0.5 ? w.predictShot(null, 0) : null;
          if (now && now.type !== 'land' && now.off < 0) {                 // coming down short of the wagon
            var fl = w.predictShot(null, 0, 0);
            if (fl.type === 'land' && w.puff()) this.stats.puffs++;
          }
        } else if (this.rng.chance(0.03) && w.puff()) this.stats.puffs++;
      }
    } else this.state = 'idle';
  };

  CFF.Bot = Bot;
})(window.CFF = window.CFF || {});
