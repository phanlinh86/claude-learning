/* Finn's Island Fling — FIF.Bot: an autopilot that flings like a person (DESIGN §5)
 *
 *   var bot = new FIF.Bot(world, { skill: 0.85, seed: 3 });
 *   bot.step(dt);          // call once per frame BEFORE world.update(dt); it only uses aim / release / flutter
 *   bot.stats              // {shots, planned, noPlan, flutters}
 *
 * Plan (phase 'aim', after a think time of 0.4–0.9 s): for every candidate launch angle 30°–70° (step 4°) it solves
 * the launch speed analytically (World.solveSpeed: exact parabola, launch point = sling + pull) for the raft
 * position PREDICTED at landing time (World.raftX at release + flight time, iterated 3×: the flight time depends
 * on where it lands). Every solved candidate is verified with world.predictShot (the very same step code, so
 * gulls and leaf pickups are exact) and scored: landing (+100), bullseye (+8), leaves (+6 each, moon +12),
 * gull bumps (−40), and a small preference for medium angles. The best is the plan.
 * Error ∝ (1 − skill): angle σ = (1 − s)·ANG_ERR°, power σ = (1 − s)·POW_ERR (fraction), fixed per shot.
 * The pull is animated (ease-out) from rest to the target over AIM_T ≈ 0.5 s, then released.
 * In flight it re-predicts every 0.1 s and uses the one flutter if the fox would come down SHORT of the raft and
 * a flutter now would land it (skill ≥ 0.3 only; low skill flutters at random sometimes).
 */
(function (FIF) {
  'use strict';
  var M = Math, DEG = M.PI / 180;
  var THINK = [0.4, 0.9], AIM_T = 0.5, ANG_ERR = 25, POW_ERR = 0.36, ANGLES = [30, 70, 4], CHECK = 0.1;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 1 : +opts.skill, 0, 1);
    this.rng = new FIF.RNG(opts.seed === undefined ? 1 : opts.seed);
    this.state = 'idle'; this.t = 0; this.think = 0;
    this.plan = null; this.target = null; this._checkT = 0;
    this.stats = { shots: 0, planned: 0, noPlan: 0, flutters: 0 };
  }
  Bot.THINK = THINK; Bot.AIM_T = AIM_T;

  /** best plan for a release `wait` seconds from now (no error); null if nothing lands */
  Bot.prototype.solve = function (wait) {
    var w = this.world, C = FIF.World.CONFIG, raft = w.raft, yc = raft.top + C.FOOT, best = null;
    for (var a = ANGLES[0]; a <= ANGLES[1] + 1e-9; a += ANGLES[2]) {
      var ang = a * DEG, T = 1.6, sol = null;
      for (var it = 0; it < 3; it++) {
        var X = FIF.World.raftX(raft, raft.t + wait + T);
        sol = FIF.World.solveSpeed(ang, X, yc);
        if (!sol || !sol.pull) { sol = null; break; }
        T = sol.T;
      }
      if (!sol) continue;
      var pr = w.predictShot(sol.pull, wait);
      var score = (pr.type === 'land' ? 100 : 0) + (pr.bull ? 8 : 0) + pr.leaves * 6 + (pr.value - pr.leaves) * 6
        - pr.bumps * 40 - M.abs(a - 48) * 0.05 - (pr.type === 'land' ? M.abs(pr.off) * 2 : 0);
      if (!best || score > best.score) best = { score: score, pull: sol.pull, angle: ang, v: sol.v, pred: pr };
    }
    return best;
  };

  Bot.prototype.step = function (dt) {
    var w = this.world, C = FIF.World.CONFIG;
    dt = M.max(0, +dt || 0);
    if (w.phase === 'aim') {
      if (this.state !== 'think' && this.state !== 'aim') { this.state = 'think'; this.t = 0; this.think = this.rng.range(THINK[0], THINK[1]); }
      this.t += dt;
      if (this.state === 'think' && this.t >= this.think) {
        var plan = this.solve(AIM_T);
        this.stats.planned++;
        if (!plan || plan.pred.type !== 'land') this.stats.noPlan++;
        if (!plan) {                                                     // fall back: a medium fling at the raft
          var s = FIF.World.solveSpeed(48 * DEG, w.raft.x, w.raft.top + C.FOOT);
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
      if (!w.fluttered && this._checkT <= 0) {
        this._checkT = CHECK;
        if (this.skill >= 0.3) {
          var now = w.predictShot(null, 0);
          if (now.type !== 'land' && now.off < 0 && w.fox.vy < 0.5) {     // coming down short of the raft
            var fl = w.predictShot(null, 0, 0);
            if (fl.type === 'land' && w.flutter()) this.stats.flutters++;
          }
        } else if (this.rng.chance(0.03) && w.flutter()) this.stats.flutters++;
      }
    } else this.state = 'idle';
  };

  FIF.Bot = Bot;
})(window.FIF = window.FIF || {});
