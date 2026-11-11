/* Zippy's Jungle Boop — ZJB.Bot: a human-like auto-player (DESIGN §5, docs/MECHANICS.md)
 *
 *   var bot = new ZJB.Bot(world, { skill: 0.3, seed: 2 });
 *   each frame: bot.step(dt); world.update(dt);
 *
 * Model of a player (skill 0 = a toddler, 1 = a sharp adult):
 *  - notices a critter once it is tappable (h ≥ HIT_MIN_H) and reacts after delay = lerp(1.1, 0.25, skill) × U(0.8, 1.3) s
 *  - believes Zippy's colour with a lag: a colour change is "seen" one reaction delay later (the world's grace
 *    window forgives most of this; slow players sometimes tap the old colour → a real wrong tap)
 *  - matching critter: taps it with P(focus) = 0.75 + 0.25·skill, else looks again after another delay
 *  - decoy: taps it by mistake with P = 0.18·(1−skill)^1.5 + 0.004, decided once per critter per colour
 *  - one finger: at least gap = 0.5 − 0.38·skill s between taps; a 'busy' answer is retried 0.05 s later
 */
(function (ZJB) {
  'use strict';
  var M = Math;

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = M.max(0, M.min(1, opts.skill === undefined ? 0.8 : opts.skill));
    this.rng = new ZJB.RNG(opts.seed === undefined ? 99 : opts.seed);
    this.t = 0; this.nextTapT = 0;
    this.seen = {};                 // critter id → { at, colour (belief when decided), done }
    this.belief = world.colour; this.seenColour = world.colour; this.switchAt = -1;
    this.taps = { match: 0, wrong: 0, empty: 0, busy: 0, none: 0 };
  }

  Bot.prototype.reaction = function () {
    var s = this.skill;
    return (1.1 + (0.25 - 1.1) * s) * this.rng.range(0.8, 1.3);
  };
  Bot.prototype.mistakeRate = function () { return 0.18 * M.pow(1 - this.skill, 1.5) + 0.004; };
  Bot.prototype.focus = function () { return 0.75 + 0.25 * this.skill; };
  Bot.prototype.gap = function () { return 0.5 - 0.38 * this.skill; };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    this.t += dt;
    if (w.phase !== 'play') return;
    // colour belief (lagged)
    if (w.colour !== this.seenColour) { this.seenColour = w.colour; this.switchAt = this.t + this.reaction(); }
    if (this.switchAt >= 0 && this.t >= this.switchAt) { this.belief = this.seenColour; this.switchAt = -1; }

    var min = w.constructor.CONFIG ? w.constructor.CONFIG.HIT_MIN_H : 0.25;
    var live = {}, best = -1, bestAt = Infinity;
    for (var i = 0; i < w.holes.length; i++) {
      var c = w.holes[i].critter;
      if (!c || !(c.state === 'rise' || c.state === 'up') || c.h < min) continue;
      live[c.id] = true;
      var m = this.seen[c.id];
      if (!m) m = this.seen[c.id] = { at: this.t + this.reaction(), colour: this.belief, plan: 'wait' };
      if (m.colour !== this.belief) { m.colour = this.belief; m.plan = 'wait'; m.at = this.t + this.reaction() * 0.6; }
      if (m.plan === 'wait' && this.t >= m.at) {        // decide once
        if (c.colour === this.belief) {
          if (this.rng.chance(this.focus())) m.plan = 'tap';
          else m.at = this.t + this.reaction();          // looked away; look again later
        } else m.plan = this.rng.chance(this.mistakeRate()) ? 'tap' : 'skip';
      }
      if (m.plan === 'tap' && m.at < bestAt) { bestAt = m.at; best = i; }
    }
    for (var id in this.seen) if (!live[id]) delete this.seen[id];

    if (best >= 0 && this.t >= this.nextTapT) {
      var cr = w.holes[best].critter, r = w.tapHole(best);
      this.taps[r] = (this.taps[r] || 0) + 1;
      if (r === 'busy') { this.nextTapT = this.t + 0.05; return; }
      this.seen[cr.id].plan = 'done';
      this.nextTapT = this.t + this.gap() * this.rng.range(0.85, 1.2);
    }
  };

  ZJB.Bot = Bot;
})(window.ZJB = window.ZJB || {});
