/* Kit's Toybox Beat — KB.Bot (autoplay / tests / demo / high-speed playtest)
 *
 *   const bot = new KB.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);      // call every frame BEFORE world.update(dt), with the same dt
 *   bot.stats          // { taps, planned, skipped, wrongLane, perfect, good, miss, bounced, poofed, levels, maxLevel }
 *
 * Plays only through the public input API: w.tap(lane, offset). It reads w.notes and the song clock
 * (w.songTime + w._acc) like a player reads the screen. For every live note within the look-ahead it
 * makes a plan once: tap time = note.time + error, lane = note.lane (or −1 with oneButton). When a
 * planned time falls inside the coming frame it taps with offset = plannedTime − now, so the tap lands
 * at exactly the planned time whatever the frame rate (skill 1 → error 0 → always 'perfect').
 *  skill < 1:  error ~ N(0, σ), σ = 0.10·(1 − skill) s;  skip a note with p = 0.3·(1 − skill)²;
 *              tap the wrong lane with p = 0.12·(1 − skill) (not in one-button mode).
 */
(function (KB) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = opts.skill !== undefined ? clamp(opts.skill, 0, 1) : 0.8;
    this.rng = new KB.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.lookAhead = 0.6;              // s: plans are made this long before a note's time
    this.stats = { taps: 0, planned: 0, skipped: 0, wrongLane: 0, perfect: 0, good: 0, miss: 0, bounced: 0, poofed: 0, levels: 0, maxLevel: 0 };
    this._plans = [];                  // [{ id, t, lane }] sorted by t
    this._seen = {};                   // note id → true (planned or skipped)
    this._level = -1;
  }

  Bot.prototype.setSkill = function (s) { this.skill = clamp(s, 0, 1); };

  Bot.prototype._sync = function () {
    var w = this.world, s = this.stats, ws = w.stats;
    s.perfect = ws.perfect; s.good = ws.good; s.miss = ws.miss; s.bounced = ws.bounced; s.poofed = ws.poofed;
    s.levels = w.levelsCleared; s.maxLevel = Math.max(s.maxLevel, w.level);
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    this._sync();
    if (!this.enabled) return;
    if (w.level !== this._level) { this._level = w.level; this._plans = []; this._seen = {}; }
    if (w.state !== 'ready' && w.state !== 'playing') return;
    dt = Math.max(0, +dt || 0);
    var now = w.songTime + (w._acc || 0), sk = this.skill, r = this.rng, oneB = !!w.cfg.oneButton;
    // 1. plan new notes
    var notes = w.notes;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.time > now + dt + this.lookAhead) break;
      if (n.state !== 'live' || this._seen[n.id]) continue;
      this._seen[n.id] = true;
      if (sk < 1 && r.chance(0.3 * (1 - sk) * (1 - sk))) { this.stats.skipped++; continue; }
      var err = sk < 1 ? r.gauss() * 0.10 * (1 - sk) : 0;
      var lane = oneB ? -1 : n.lane;
      if (!oneB && sk < 1 && r.chance(0.12 * (1 - sk))) { lane = 1 - n.lane; this.stats.wrongLane++; }
      this._plans.push({ id: n.id, t: n.time + err, lane: lane });
      this.stats.planned++;
    }
    this._plans.sort(function (a, b) { return a.t - b.t; });
    // 2. fire the plans that fall inside this frame (or are overdue)
    while (this._plans.length && this._plans[0].t < now + dt) {
      var p = this._plans.shift();
      if (w.state !== 'ready' && w.state !== 'playing') break;
      w.tap(p.lane, p.t - now);
      this.stats.taps++;
    }
    this._sync();
  };

  KB.Bot = Bot;
})(window.KB = window.KB || {});
