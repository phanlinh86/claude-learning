/* Pip's Oasis Glow — POG.Bot: a human-like auto-player (DESIGN §5, docs/MECHANICS.md)
 *
 *   var bot = new POG.Bot(world, { skill: 0.3, seed: 2 });
 *   each frame: bot.step(dt); world.update(dt);
 *
 * Model of a player (skill 0 = a toddler, 1 = a sharp adult):
 *  - notices a friend once it is tappable (h ≥ HIT_MIN_H) and reacts after delay = lerp(1.1, 0.25, skill) × U(0.8, 1.3) s
 *    (a golden firefly catches the eye: its delay × 0.8)
 *  - firefly holder: taps it with P(focus) = 0.75 + 0.25·skill, else looks again after another delay
 *  - napping friend: taps it by mistake with P = 0.18·(1−skill)^1.5 + 0.004, decided once per friend
 *  - several ready at once: a gold first, then the one noticed earliest
 *  - one finger: at least gap = 0.5 − 0.38·skill s between taps; a 'busy' answer is retried 0.05 s later
 */
(function (POG) {
  'use strict';
  var M = Math;

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = M.max(0, M.min(1, opts.skill === undefined ? 0.8 : opts.skill));
    this.rng = new POG.RNG(opts.seed === undefined ? 99 : opts.seed);
    this.t = 0; this.nextTapT = 0;
    this.seen = {};                 // friend id → { at, plan: 'wait'|'tap'|'skip'|'done' }
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
    var min = w.constructor.CONFIG ? w.constructor.CONFIG.HIT_MIN_H : 0.25;
    var live = {}, best = -1, bestKey = Infinity;
    for (var i = 0; i < w.holes.length; i++) {
      var c = w.holes[i].critter;
      if (!c || !(c.state === 'rise' || c.state === 'up') || c.h < min) continue;
      live[c.id] = true;
      var m = this.seen[c.id];
      if (!m) m = this.seen[c.id] = { at: this.t + this.reaction() * (c.type === 'gold' ? 0.8 : 1), plan: 'wait' };
      if (m.plan === 'wait' && this.t >= m.at) {        // decide once
        if (c.type !== 'sleepy') {
          if (this.rng.chance(this.focus())) m.plan = 'tap';
          else m.at = this.t + this.reaction();          // looked away; look again later
        } else m.plan = this.rng.chance(this.mistakeRate()) ? 'tap' : 'skip';
      }
      if (m.plan === 'tap') {
        var key = m.at - (c.type === 'gold' ? 1000 : 0);  // gold first
        if (key < bestKey) { bestKey = key; best = i; }
      }
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

  POG.Bot = Bot;
})(window.POG = window.POG || {});
