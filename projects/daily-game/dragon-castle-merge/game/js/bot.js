/* Ember's Glow Castle — EG.Bot: a player model for autoplay, playtests and pacing sims (DESIGN §5.3)
 *
 *   var bot = new EG.Bot(world, { skill: 0.8, seed: 3 });
 *   each frame: bot.step(dt); world.update(dt);
 *
 * When the board is ready (phase 'aim') the bot "looks" for a reaction time (0.25–0.7 s, faster with
 * skill). It decides at the start of that time and aims Ember there (so she flies over first, like a
 * child moving a finger), then drops when the time is up. Each column is scored with world.simulate():
 * + points, + merges × 30, + same-tier neighbours of the landing cell, − height, − holes, − a lot for
 * game over; at skill ≥ 0.8 it adds half of the best follow-up with the `next` light (one-step
 * lookahead). The choice is a soft-max whose temperature grows as skill drops (sloppier play).
 */
(function (EG) {
  'use strict';
  var M = Math;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 0.8 : +opts.skill, 0, 1);
    this.rng = new EG.RNG(opts.seed === undefined ? 99 : opts.seed);
    this._think = -1;
    this._col = -1;
    this.stats = { drops: 0, thinks: 0, lookaheads: 0, refused: 0, bestPicks: 0 };
  }

  Bot.prototype.setSkill = function (s) { this.skill = clamp(+s, 0, 1); };

  // skill → model parameters
  Bot.prototype._react = function () { return 0.25 + 0.45 * (1 - this.skill); };          // s
  Bot.prototype._temp = function () { return 3 + 160 * M.pow(1 - this.skill, 2); };       // soft-max temperature (score units)
  Bot.prototype._lookahead = function () { return this.skill >= 0.8; };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    if (w.phase !== 'aim') { this._think = -1; return; }
    if (this._think < 0) {
      this._think = this._react() * this.rng.range(0.8, 1.25);
      this._col = this.choose();
      this.stats.thinks++;
      if (this._col >= 0) w.aim(this._col);
    }
    this._think -= dt;
    if (this._think > 0) return;
    this._think = -1;
    var c = this._col >= 0 ? this._col : w.ember.targetCol;
    var ok = w.drop(c);
    if (ok) this.stats.drops++; else if (w.phase === 'aim') this.stats.refused++;
  };

  /** Score one simulated outcome (higher is better). */
  Bot.prototype._score = function (res, board, col, held) {
    var rows = this.world.rows, s = res.points + res.merges * 30;
    var h = board[col].length, adj = 0;
    if (held && held.kind === 'light') {
      var nb = [[col - 1, h], [col + 1, h], [col, h - 1]];
      for (var k = 0; k < 3; k++) {
        var c = nb[k][0], r = nb[k][1];
        if (c < 0 || c >= board.length || r < 0 || r >= board[c].length) continue;
        var t = board[c][r];
        if (t === held.tier) adj += 1;
        else if (k === 2 && t === held.tier + 1) adj += 0.35;   // small on top of the next tier: tidy staircase
      }
    }
    s += adj * 12;
    var hs = res.heights, sq = 0, mx = 0;
    for (var i = 0; i < hs.length; i++) { sq += hs[i] * hs[i]; if (hs[i] > mx) mx = hs[i]; }
    s -= sq * 0.9;
    if (mx >= rows - 1) s -= 25;
    s -= res.holes * 7;
    // night creeps: a good player wakes pumpkins (merge next to them) and fears a full board before a rise
    s += res.woken * 45 * this.skill;
    s -= res.pumpkins * 10 * this.skill;
    if (res.rise) s -= sq * 0.6 * this.skill;
    if (res.goal) s += 250;
    if (res.gameOver) s -= 5000;
    return s;
  };

  /** Pick a column (or -1 if nothing fits). */
  Bot.prototype.choose = function () {
    var w = this.world, board = w._tiers(), held = w.held, ctx = w._simCtx();
    var scores = [], cols = [], best = -1e18, bestCol = -1, c;
    for (c = 0; c < w.cols; c++) {
      var res = w.simulate(c);
      if (!res.ok) continue;
      var s = this._score(res, board, c, held);
      if (this._lookahead() && !res.gameOver && w.next) {
        this.stats.lookaheads++;
        var ctx2 = { combo: res.combo, helperMark: res.merges ? ctx.helperMark : 0, level: ctx.level + (res.goal ? 1 : 0),
          goalTier: res.goal ? EG.World.goalFor(ctx.level + 1) : ctx.goalTier, goalDone: false, next: null };
        var b2 = -1e18;
        for (var c2 = 0; c2 < w.cols; c2++) {
          var r2 = w.simBoard(res.board, w.next, c2, ctx2);
          if (!r2.ok) continue;
          var s2 = this._score(r2, res.board, c2, w.next);
          if (s2 > b2) b2 = s2;
        }
        s += b2 > -1e17 ? 0.5 * b2 : -3000;
      }
      scores.push(s); cols.push(c);
      if (s > best) { best = s; bestCol = c; }
    }
    if (!cols.length) return -1;
    // soft-max pick
    var T = this._temp(), sum = 0, p = [];
    for (var i = 0; i < scores.length; i++) { var e = M.exp((scores[i] - best) / T); p.push(e); sum += e; }
    var x = this.rng.next() * sum;
    for (i = 0; i < p.length; i++) {
      x -= p[i];
      if (x < 0) { if (cols[i] === bestCol) this.stats.bestPicks++; return cols[i]; }
    }
    return bestCol;
  };

  EG.Bot = Bot;
})(window.EG = window.EG || {});
