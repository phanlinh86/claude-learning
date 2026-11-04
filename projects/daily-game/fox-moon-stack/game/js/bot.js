/* Juno's Moon Stack — MS.Bot: a player model for autoplay, playtests and pacing sims (DESIGN §5.3)
 *
 *   var bot = new MS.Bot(world, { skill: 0.5, seed: 3 });
 *   each frame: bot.step(dt); world.update(dt);
 *
 * In phase 'swing' the bot first "looks" for a think time (0.3–0.8 s, shorter with skill). Then it
 * watches world.predictLanding() every frame like a child watching the drop guide: it estimates when
 * the predicted dx will cross its aim point (from the rate of change) and taps then, shifted by a
 * timing error τ ~ N(0, (1 − skill)·0.12 s) drawn once per crate (negative = taps early, positive = late).
 * Its aim point is the top crate's centre plus a small aim error (sd (1 − skill)·0.12·w) and it lets a chance pass with probability 0.55·(1 − skill) (halving each time); skilled bots
 * (≥ 0.6) also aim a little back against the tower's lean. skill 1 ≈ always perfect, 0.5 ≈ casual player.
 */
(function (MS) {
  'use strict';
  var M = Math;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 0.8 : +opts.skill, 0, 1);
    this.rng = new MS.RNG(opts.seed === undefined ? 99 : opts.seed);
    this.stats = { drops: 0, thinks: 0, passes: 0, giveUps: 0 };
    this._crate = null;
  }

  Bot.prototype.setSkill = function (s) { this.skill = clamp(+s, 0, 1); };

  Bot.prototype._plan = function (c) {
    var s = this.skill, w = this.world;
    this._crate = c;
    this._think = (0.8 - 0.5 * s) * this.rng.range(0.85, 1.15);
    this._tau = clamp(this.rng.gauss() * (1 - s) * 0.12, -0.25, 0.25);
    var aim = this.rng.gauss() * (1 - s) * 0.12 * c.w;
    if (s >= 0.6) {                                 // lean back against the tower's drift
      var l = w.tower.list, n = l.length;
      if (n >= 2) {
        var m = 0, sx = 0;
        for (var i = 0; i < n; i++) { var mi = l[i].w * l[i].h; m += mi; sx += mi * l[i].x; }
        aim += clamp(-(l[n - 1].x - sx / m) * 0.8 * (s - 0.4), -0.25 * c.w, 0.25 * c.w);
      }
    }
    this._aim = aim;
    this._hesitate = 0.55 * (1 - s);
    this._last = null;
    this._watch = 0;
    this.stats.thinks++;
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    if (w.phase !== 'swing' || !w.held) { this._crate = null; return; }
    if (this._crate !== w.held) this._plan(w.held);
    if (this._think > 0) { this._think -= dt; this._last = null; return; }
    var p = w.predictLanding();
    if (!p) return;
    this._watch += dt;
    var e = p.dx - this._aim;
    if (this._last !== null && dt > 0) {
      var rate = (e - this._last) / dt;
      if (M.abs(rate) > 1) {
        var tz = -e / rate;                         // time until the aim point is crossed (negative: just passed)
        var fire = tz + this._tau;
        if (fire < dt * 0.5 && tz > -(M.abs(this._tau) + 0.06)) {
          // a casual player often lets a chance pass and waits for the next swing (pacing realism)
          if (this._hesitate && this.rng.chance(this._hesitate)) { this._hesitate *= 0.5; this.stats.passes++; this._last = null; return; }
          this._fire(); return;
        }
      }
    }
    this._last = e;
    if (this._watch > 7) { this.stats.giveUps++; this._fire(); }   // never stall the game
  };

  Bot.prototype._fire = function () {
    if (this.world.drop()) this.stats.drops++;
    this._crate = null; this._last = null;
  };

  MS.Bot = Bot;
})(window.MS = window.MS || {});
