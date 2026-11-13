/* Comet's Gem Factory — CGF.Bot (a human-like memory player for the title demo, autoplay and tests)
 *
 *   const bot = new CGF.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);     // call every frame BEFORE world.update(dt); it calls world.tap(i)
 *   bot.stats         // { taps, attempts, matches, misses, forgotten, levels, overs }   (added)
 *
 * Memory model (skill 0..1):
 *  - The bot only learns a gem when the card is visibly face up (flip ≥ 0.5): its own flips, a wrong
 *    pair, or the peek.
 *  - Each sighting is kept "for good" with probability `skill`; otherwise it is fuzzy and fades after
 *    1–4 s. Even good memories slip away at (1 − skill) × 3 % per second.
 *  - Delay between taps: 0.25 s (skill 1) … 1.4 s (skill 0), ±20 % jitter.
 * Strategy (optimal with perfect memory):
 *  1. a known pair among the face-down cards → take it;
 *  2. otherwise flip an unknown card; if its twin is known take the twin, else another unknown card.
 */
(function (CGF) {
  'use strict';

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = opts.skill !== undefined ? Math.max(0, Math.min(1, opts.skill)) : 0.8;
    this.rng = CGF.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { taps: 0, attempts: 0, matches: 0, misses: 0, forgotten: 0, levels: 0, overs: 0 };
    this._level = -1;
    this._phase = null;
    this._wait = 0;
    this._t = 0;
    this.mem = {};
    this._up = {};
  }

  Bot.prototype.delay = function () {
    return (0.25 + (1 - this.skill) * 1.15) * this.rng.range(0.8, 1.2);
  };

  Bot.prototype._observe = function (dt) {
    var w = this.world, cards = w.cards, s = this.skill, i, k, m;
    for (i = 0; i < cards.length; i++) {
      k = cards[i];
      m = this.mem[k.id];
      if (k.state === 'matched' || k.state === 'gone') { if (m) delete this.mem[k.id]; continue; }
      var up = k.flip >= 0.5;
      if (up && !this._up[k.id]) {
        this._up[k.id] = true;
        if (!m || m.until !== Infinity) {
          this.mem[k.id] = { kind: k.kind, until: this.rng.chance(s) ? Infinity : this._t + this.rng.range(1, 4) };
        }
      } else if (!up) this._up[k.id] = false;
    }
    var slip = (1 - s) * 0.03 * dt;
    for (var id in this.mem) {
      m = this.mem[id];
      if (m.until < this._t || (slip > 0 && this.rng.chance(slip))) { delete this.mem[id]; this.stats.forgotten++; }
    }
  };

  Bot.prototype._choose = function () {
    var w = this.world, cards = w.cards, i, k;
    var down = [], known = {}, unknown = [];
    for (i = 0; i < cards.length; i++) {
      k = cards[i];
      if (k.state !== 'down') continue;
      down.push(k);
      var m = this.mem[k.id];
      if (m) (known[m.kind] = known[m.kind] || []).push(k); else unknown.push(k);
    }
    if (!down.length) return null;
    if (w._open.length === 1) {
      var kind = cards[w._open[0]].kind;              // visible right now
      if (known[kind] && known[kind].length) return known[kind][0];
      return unknown.length ? this.rng.pick(unknown) : this.rng.pick(down);
    }
    var keys = Object.keys(known).sort();               // sorted: deterministic order
    for (i = 0; i < keys.length; i++) if (known[keys[i]].length >= 2) return known[keys[i]][0];
    return unknown.length ? this.rng.pick(unknown) : this.rng.pick(down);
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    if (!this.enabled || !(dt > 0)) return;
    this._t += dt;
    if (w.level !== this._level) { this._level = w.level; this.mem = {}; this._up = {}; this._wait = this.delay(); }
    if (w.phase !== this._phase) {
      if (w.phase === 'clear') this.stats.levels++;
      if (w.phase === 'over') this.stats.overs++;
      if (w.phase === 'playing') this._wait = this.delay();
      this._phase = w.phase;
    }
    this._observe(dt);
    if (w.phase !== 'playing') return;
    if (this._wait > 0) { this._wait -= dt; return; }
    if (w._open.length >= 2) { this._wait = 0.02; return; }     // pair being judged
    var pick = this._choose();
    if (!pick) { this._wait = 0.1; return; }
    var second = w._open.length === 1, firstKind = second ? w.cards[w._open[0]].kind : null;
    if (w.tap(pick.id)) {
      this.stats.taps++;
      if (second) { this.stats.attempts++; if (pick.kind === firstKind) this.stats.matches++; else this.stats.misses++; }
      this._wait = this.delay();
    } else this._wait = 0.03;                                    // card still flipping back: try again soon
  };

  CGF.Bot = Bot;
})(window.CGF = window.CGF || {});
