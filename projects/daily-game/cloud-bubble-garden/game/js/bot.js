/* Nimbus's Bubble Garden — NB.Bot: a player model for autoplay, playtests and pacing sims (DESIGN §5.3)
 *
 *   var bot = new NB.Bot(world, { skill: 0.5, seed: 3 });
 *   each frame: bot.step(dt); world.update(dt);
 *
 * Every ~0.15 s (+ a reaction delay of (1 − skill)·0.35 s on what it sees) the bot:
 *  1. looks for falling burrs (skill ≥ 0.4; a burr is only "seen" after it has fallen for the reaction delay;
 *     skill ≥ 0.7 also watches burrs about to drop). It predicts each burr's gravity arc for 0.8 s and, if it
 *     will cross Nimbus, steps sideways (away from the burr, toward the open side) and holds the dodge until
 *     the burr is below her;
 *  2. otherwise picks a bubble: for each rising bubble it solves the intercept (where the bubble will be when
 *     Nimbus gets there), drops ones that escape the box first or sit under a burr, and scores
 *     (1 + 0.5·neighbours) / (time + 0.25) — near bubbles and clusters first, with a little stickiness;
 *  3. aims at the intercept plus noise N(0, (1 − skill)·0.5 u), fixed per chosen bubble.
 * Burrs are checked every frame (skill ≥ 0.6 also watches burrs within 1.2·skill s of dropping); bubbles are
 * re-picked every ~0.17 s, planning with a speed of (0.35 + 0.4·skill)·heroMax. A casual player also "looks
 * away" now and then: with chance 0.9·(1 − skill)² per decision it keeps its old target for 0.4–1.2 s (and
 * notices burrs 0.25 s later meanwhile). skill 1 ≈ never hit; 0.5 ≈ a casual player.
 */
(function (NB) {
  'use strict';
  var M = Math;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill === undefined ? 0.8 : +opts.skill, 0, 1);
    this.rng = new NB.RNG(opts.seed === undefined ? 99 : opts.seed);
    this.stats = { decisions: 0, targets: 0, dodges: 0, lapses: 0 };
    this._t = 0; this._idle = 0; this._goal = null; this._noise = { x: 0, y: 0 }; this._dodge = null;
  }

  Bot.prototype.setSkill = function (s) { this.skill = clamp(+s, 0, 1); };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    if (w.phase !== 'play' || !(dt > 0)) return;
    var s = this.skill;
    // burrs are watched every frame (a looking-away player notices them later)
    if (this._threat(this._idle > 0 ? 0.25 : 0)) { this._t = 0; return; }
    if (this._idle > 0) { this._idle -= dt; return; }
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.15 + this.rng.range(0, 0.05);
    this.stats.decisions++;
    if (this.rng.chance(LAPSE * (1 - s) * (1 - s))) { this._idle = this.rng.range(0.4, 1.2); this.stats.lapses++; return; }
    this._chase();
  };

  /** Falling-burr check + dodge. Returns true while dodging. */
  Bot.prototype._threat = function (extraDelay) {
    var w = this.world, s = this.skill;
    if (s < 0.4) return false;
    var H = w.hero, L = w.layout, u = L.unit, g = w.constructor.CONFIG.g * u;
    var react = (1 - s) * 0.35 + (extraDelay || 0), look = s >= 0.6 ? 1.2 * s : 0, hang = w.D.hangTime, rest = L.groundY - w.constructor.CONFIG.burrRest * u;
    var margin = (0.25 + 0.25 * s) * u;
    var worst = null, wt = 1e9;
    for (var i = 0; i < w.burrs.length; i++) {
      var c = w.burrs[i];
      if (c.hit) continue;
      var x = c.x, y = c.y, vx = c.vx, vy = c.vy, t0 = 0;
      if (c.state === 'fall') { if (c.t < react) continue; }
      else if (c.state === 'hang' && hang - c.t < look) { t0 = hang - c.t; vx = w.wind.x * 0.5; vy = 0; }
      else continue;
      if (y > H.y + H.r + c.r) continue;               // already below her
      var rr = H.r * 0.9 + c.r + margin;
      for (var tau = 0; tau <= 0.8 + t0; tau += 0.04) {
        var tf = M.max(0, tau - t0);
        var bx = x + vx * tf, by = M.min(rest, y + vy * tf + 0.5 * g * tf * tf);
        var dx = bx - H.x, dy = by - H.y;
        if (dx * dx + dy * dy < rr * rr) { if (tau < wt) { wt = tau; worst = c; } break; }
      }
    }
    if (!worst) {
      if (this._dodge && this._dodge.state === 'fall' && this._dodge.y < H.y + H.r) return true;  // hold the dodge
      this._dodge = null;
      return false;
    }
    if (this._dodge !== worst) this.stats.dodges++;
    this._dodge = worst;
    var side = H.x >= worst.x ? 1 : -1;
    var gap = H.r + worst.r + 0.7 * u;
    var nx = worst.x + side * gap;
    if (nx < H.r || nx > L.width - H.r) { side = -side; nx = worst.x + side * gap; }
    // keep her height but never move up into the burr's path
    w.setTarget(nx, M.max(H.y, H.ty));
    return true;
  };

  Bot.prototype._chase = function () {
    var w = this.world, s = this.skill, H = w.hero, L = w.layout, u = L.unit;
    var C = w.constructor.CONFIG, v = C.heroMax * u * (0.35 + 0.4 * s);   // a casual player plans (and drags) slower
    var best = null, bs = -1, bp = null;
    for (var i = 0; i < w.bubbles.length; i++) {
      var b = w.bubbles[i];
      if (b.state !== 'rise') continue;
      var T = M.sqrt((b.x - H.x) * (b.x - H.x) + (b.y - H.y) * (b.y - H.y)) / v, px = b.x, py = b.y;
      for (var k = 0; k < 3; k++) {
        px = b.x + b.vx * T; py = b.y + b.vy * T;
        T = M.sqrt((px - H.x) * (px - H.x) + (py - H.y) * (py - H.y)) / v + 0.1;
      }
      if (py < L.minY - 0.3 * b.r) continue;           // it leaves the box before she gets there
      if (s >= 0.4 && this._underBurr(px, py)) continue;
      var nb = 0;
      for (var j = 0; j < w.bubbles.length; j++) {
        var o = w.bubbles[j];
        if (o === b || o.state !== 'rise') continue;
        var ox = o.x - b.x, oy = o.y - b.y;
        if (ox * ox + oy * oy < 1.44 * u * u) nb++;
      }
      var sc = (1 + 0.5 * nb) / (T + 0.25);
      if (b === this._goal) sc *= 1.25;
      if (sc > bs) { bs = sc; best = b; bp = { x: px, y: py }; }
    }
    if (!best) {             // nothing to chase: drift to the lower middle, where the bubbles come from
      w.setTarget(H.tx, L.minY + (L.maxY - L.minY) * 0.65);
      return;
    }
    if (best !== this._goal) {
      this._goal = best; this.stats.targets++;
      var n = (1 - s) * 0.5 * u;
      this._noise.x = this.rng.gauss() * n; this._noise.y = this.rng.gauss() * n;
    }
    w.setTarget(bp.x + this._noise.x, bp.y + this._noise.y);
  };

  /** Is (x, y) under a burr that is falling or about to drop? */
  Bot.prototype._underBurr = function (x, y) {
    var w = this.world, H = w.hero, u = w.layout.unit;
    for (var i = 0; i < w.burrs.length; i++) {
      var c = w.burrs[i];
      if (c.hit) continue;
      if (c.state === 'fall' || (c.state === 'hang' && w.D.hangTime - c.t < 0.7)) {
        if (M.abs(x - c.x) < H.r + c.r + 0.3 * u && y > c.y) return true;
      }
    }
    return false;
  };

  var LAPSE = 0.9;           // × (1 − skill)²: chance per decision to look away for 0.4–1.2 s (0.5 → 22 %, 0.9 → 1 %)

  NB.Bot = Bot;
})(window.NB = window.NB || {});
