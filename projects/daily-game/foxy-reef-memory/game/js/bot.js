/* Foxy's Reef Memory — RF.Bot (human-like memory player, for autoplay / tests / demo)
 *
 *   const bot = new RF.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);      // call every frame BEFORE world.update(dt)
 *   bot.stats          // { picks, moves, matches, mistakes, forgotten, lostTrack, levels, deaths }
 *
 * Memory model (skill 0..1):
 *  - The bot only learns a face when the card is actually face-up on screen
 *    (flip ≥ 0.5: its own flips, the open pair, or the Easy-mode peek).
 *  - Each sighting is stored for good with probability `skill`; otherwise it is
 *    "fuzzy" and forgotten after 1–3 further moves.
 *  - It follows remembered cards by their position. When a remembered card slides
 *    to another cell (gravity twist) it loses track of it with probability
 *    (1 − skill) × 0.5.
 *  - Think delay before each pick: uniform 0.3–0.9 s scaled by 1 / (0.5 + skill).
 * Strategy (optimal for perfect memory, see docs/MECHANICS.md):
 *  1. known pair on the board → take it;
 *  2. otherwise flip an unknown card; if its partner is known, take the partner,
 *     else flip another unknown card (never a known card — that wastes a move).
 * skill 1 → perfect memory, never loses track, only "necessary exploration" mistakes.
 */
(function (RF) {
  'use strict';

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = opts.skill !== undefined ? Math.max(0, Math.min(1, opts.skill)) : 0.8;
    this.rng = new RF.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.thinkMin = opts.thinkMin !== undefined ? opts.thinkMin : 0.3;
    this.thinkMax = opts.thinkMax !== undefined ? opts.thinkMax : 0.9;
    this.enabled = true;
    this.stats = { picks: 0, moves: 0, matches: 0, mistakes: 0, forgotten: 0, lostTrack: 0, levels: 0, deaths: 0 };
    this._resetMemory();
    this._level = -1;
    this._state = null;
    this._wait = 0;
  }

  Bot.prototype._resetMemory = function () {
    this.mem = {};          // id -> { face, col, row, until }   (until = move count when it is forgotten)
    this._seen = {};        // id -> true while the card is face-up (one roll per sighting)
    this._moves = 0;
  };

  Bot.prototype._think = function () {
    return this.rng.range(this.thinkMin, this.thinkMax) / (0.5 + this.skill);
  };

  Bot.prototype._observe = function () {
    var w = this.world, cards = w.cards, i, k, m;
    for (i = 0; i < cards.length; i++) {
      k = cards[i];
      if (k.state === 'gone') { delete this.mem[k.id]; delete this._seen[k.id]; continue; }
      m = this.mem[k.id];
      // slid to another cell? maybe lose track of it
      if (m && (m.col !== k.col || m.row !== k.row)) {
        if (this.rng.chance((1 - this.skill) * 0.5)) { delete this.mem[k.id]; this.stats.lostTrack++; m = null; }
        else { m.col = k.col; m.row = k.row; }
      }
      var faceUp = k.flip >= 0.5 && k.alpha > 0.5;
      if (faceUp && !this._seen[k.id]) {
        this._seen[k.id] = true;
        if (!m || m.until !== Infinity) {
          var keep = this.rng.chance(this.skill);
          this.mem[k.id] = { face: k.face, col: k.col, row: k.row,
            until: keep ? Infinity : this._moves + this.rng.int(1, 3) };
        }
      } else if (!faceUp) this._seen[k.id] = false;
    }
    // forget fuzzy memories
    for (var id in this.mem) {
      if (this.mem[id].until < this._moves) { delete this.mem[id]; this.stats.forgotten++; }
    }
  };

  Bot.prototype._choose = function () {
    var w = this.world, cards = w.cards, i, k;
    var open = [], down = [];
    for (i = 0; i < cards.length; i++) {
      k = cards[i];
      if (k.state === 'up') open.push(k);
      else if (k.state === 'down') down.push(k);
    }
    // the open pair is a resolved mismatch → our next pick closes it (3rd-tap rule)
    if (open.length === 2) open = [];
    var known = {}, unknown = [];
    for (i = 0; i < down.length; i++) {
      k = down[i];
      var m = this.mem[k.id];
      if (m) (known[m.face] = known[m.face] || []).push(k); else unknown.push(k);
    }
    if (open.length === 1) {
      var f = open[0].face;                       // visible right now
      if (known[f] && known[f].length) return known[f][0];
      if (unknown.length) return this.rng.pick(unknown);
      return down.length ? this.rng.pick(down) : null;
    }
    for (var face in known) if (known[face].length >= 2) return known[face][0];
    if (unknown.length) return this.rng.pick(unknown);
    return down.length ? this.rng.pick(down) : null;
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    if (!this.enabled || !(dt > 0)) return;
    if (w.level !== this._level) { this._level = w.level; this._resetMemory(); this._wait = this._think(); }
    if (w.state !== this._state) {
      if (w.state === 'cleared') this.stats.levels++;
      if (w.state === 'dead') this.stats.deaths++;
      this._state = w.state;
    }
    this._observe();
    if (w.state !== 'playing') return;
    if (this._wait > 0) { this._wait -= dt; return; }
    // the open pair still flipping / being judged: wait a moment
    var openN = 0;
    for (var i = 0; i < w.cards.length; i++) if (w.cards[i].state === 'up') openN++;
    if (openN === 2 && !w._mismatch) { this._wait = 0.03; return; }
    var pick = this._choose();
    if (!pick) { this._wait = 0.1; return; }
    if (!w.isSelectable(pick) && !(openN === 2 && pick.state === 'down' && !pick.moving)) { this._wait = 0.05; return; }
    var wasOpen = openN === 1;
    if (w.select(pick.id)) {
      this.stats.picks++;
      if (wasOpen) {
        this._moves++; this.stats.moves++;
        var other = null;
        for (var j = 0; j < w.cards.length; j++) if (w.cards[j].state === 'up' && w.cards[j].id !== pick.id) other = w.cards[j];
        if (other && other.face === pick.face) this.stats.matches++; else this.stats.mistakes++;
      }
      this._wait = this._think();
    } else this._wait = 0.05;
  };

  RF.Bot = Bot;
})(window.RF = window.RF || {});
