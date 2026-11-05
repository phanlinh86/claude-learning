/* Bolt's Rooftop Flip — RF.Bot: a player model for autoplay, playtests and pacing sims (DESIGN §5.3)
 *
 *   var bot = new RF.Bot(world, { skill: 0.5, seed: 3 });
 *   each frame: bot.step(dt); world.update(dt);
 *
 * While Bolt stands on a surface the bot looks ahead on THAT surface (world.hazardAhead) and flips when the
 * next gap/vent/sign is within flightDist + lead, where lead = (0.4 + 0.5·(1 − skill)) unit (a beginner flips
 * early "to be safe"). Its timing error τ ~ N(0, (1 − skill)·0.15 s) is drawn once per hazard (positive = late)
 * and shifts the trigger by speed·τ; with chance 0.3·(1 − skill) it also has an attention lapse (notices the
 * hazard 0.1–0.4 s + 0.5·(1 − skill) s late), which is what makes casual players bump now and then. It never flips into trouble: the landing stretch on the other surface
 * (from half a flight to a flight + 0.8 unit ahead) must be solid and obstacle-free, otherwise it waits.
 * Skilled bots (skill ≥ 0.6) also make optional flips to catch a group of matching fireflies (or dodge wrong
 * ones) on the other surface when that surface stays safe for a while. If Bolt runs off an edge it uses the
 * coyote time to flip. skill 1 ≈ never hit; 0.5 ≈ a casual player.
 */
(function (RF) {
  'use strict';
  var M = Math;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function opp(s) { return s === 'floor' ? 'ceil' : 'floor'; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 0.8 : +opts.skill, 0, 1);
    this.rng = new RF.RNG(opts.seed === undefined ? 99 : opts.seed);
    this.stats = { flips: 0, forced: 0, optional: 0, saves: 0, waits: 0, lapses: 0 };
    this._key = null; this._tau = 0; this._cool = 0; this._grounded = false;
  }

  Bot.prototype.setSkill = function (s) { this.skill = clamp(+s, 0, 1); };

  Bot.prototype._flip = function (why) {
    if (this.world.flip()) { this.stats.flips++; this.stats[why]++; this._cool = 0.12; return true; }
    return false;
  };

  /** Matching minus wrong fireflies on `side` in [a, b] (near its standing line). */
  Bot.prototype._value = function (side, a, b) {
    var w = this.world, u = w.layout.unit, sy = w.standY(side), v = 0, c = w.hero.color;
    for (var i = 0; i < w.fireflies.length; i++) {
      var f = w.fireflies[i];
      if (f.state !== 'fly' || f.x < a || f.x > b || M.abs(f.y - sy) > 0.5 * u) continue;
      v += f.color === c ? 1 : (w.D.wrongBreaks ? -1.5 : -0.2);
    }
    return v;
  };

  Bot.prototype.step = function (dt) {
    var w = this.world, h = w.hero;
    if (w.phase !== 'run' || h.state === 'rescue') { this._grounded = false; return; }
    var u = w.layout.unit, s = this.skill;
    if (this._cool > 0) this._cool -= dt;
    // ran off an edge (only after a late reaction): coyote save
    if (!h.grounded) {
      if (h.coyote > 0 && !h.turn) this._flip('saves');
      this._grounded = false;
      return;
    }
    if (!this._grounded) { this._grounded = true; this._cool = M.max(this._cool, 0.1 + 0.25 * (1 - s)); }   // a beat after landing
    if (this._cool > 0) return;
    var side = h.side, other = opp(side), F = w.flightDist(), S = w.speed;
    var lead = (0.4 + 0.5 * (1 - s)) * u;
    var otherOk = w.clearRange(other, h.x + 0.5 * F, h.x + F + 0.8 * u);
    var hz = w.hazardAhead(side, h.x - CONFIG_FOOT * u, F + lead + 4 * u);
    if (hz) {
      if (this._key !== hz) {
        this._key = hz;
        this._tau = this.rng.gauss() * (1 - s) * 0.15;
        // attention lapse: now and then a casual player notices the hazard late
        if (this.rng.chance(LAPSE_P * (1 - s))) { this._tau += this.rng.range(0.1, 0.4) + 0.5 * (1 - s); this.stats.lapses++; }
      }
      if (hz.x0 - h.x <= F + lead - S * this._tau) {
        if (otherOk) { this._flip('forced'); return; }
        this.stats.waits++;
        return;
      }
    }
    // optional flips for fireflies (skilled players only)
    if (s < 0.6 || !otherOk) return;
    var a = h.x + F, b = h.x + F + 2.5 * u;
    var gain = this._value(other, a, b) - this._value(side, h.x, b);
    if (gain < 2) return;
    // the other surface must stay safe long enough to read and flip back (no hazard soon after landing there)
    if (w.hazardAhead(other, h.x + 0.5 * F, F + 3.5 * u)) return;
    if (hz && hz.x0 - h.x < F + 1.0 * u) return;
    this._flip('optional');
  };

  var LAPSE_P = 0.3;        // × (1 − skill): chance per hazard of a late reaction (+0.1..0.4 s + 0.5·(1 − skill) s)
  var CONFIG_FOOT = 0.18;   // = World.CONFIG.foot: a gap only matters once the back paw is past its edge

  RF.Bot = Bot;
})(window.RF = window.RF || {});
