/* Pip's Candy Dash — CD.Bot (autoplay / tests / demo)
 *
 *   const bot = new CD.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);      // call every frame BEFORE world.update(dt)
 *   bot.stats          // { decisions, gems, bumps, pops, dashes, levels, deaths, maxLevel }
 *
 * Plays only through the public input API (setMove / setTarget / action).
 * Strategy (docs/MECHANICS.md):
 *  1. Target: the open gate when the jar is full; else the gem with the lowest
 *     cost = travel time + danger (bears predicted near the gem when Pip arrives,
 *     bears near the straight path). Sticky: switches only for a clearly better gem.
 *  2. Steering: unit vector to the target + repulsion from each active bear
 *     (predicted 0.3 s ahead, falloff over `avoidR`, with a sideways component so
 *     Pip curves around instead of backing off) + a soft push away from walls.
 *  3. Dash to escape when a bear is about to touch and the dash is ready.
 *  4. Pop! at max size when a bear is close (or ≥ 2 bears in Pop range).
 * skill < 1: decisions refresh more slowly (reaction delay), heading noise,
 * bears are noticed later (smaller avoid radius), escapes are sometimes missed.
 */
(function (CD) {
  'use strict';

  function hyp(x, y) { return Math.sqrt(x * x + y * y); }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = opts.skill !== undefined ? Math.max(0, Math.min(1, opts.skill)) : 0.8;
    this.rng = new CD.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { decisions: 0, gems: 0, bumps: 0, pops: 0, dashes: 0, levels: 0, deaths: 0, maxLevel: 0 };
    this._wait = 0;
    this._target = null;     // { kind:'gem'|'gate'|'roam', id, x, y }
    this._mx = 0; this._my = 0;
    this._noise = 0;
    this._last = null;
  }

  Bot.prototype._sync = function () {
    var w = this.world, l = this._last;
    if (l && l.world === w && w.time >= l.time) {
      this.stats.gems += Math.max(0, w.gemsTotal - l.gems);
      this.stats.bumps += Math.max(0, w.bumps - l.bumps);
      this.stats.pops += Math.max(0, w.pops - l.pops);
      this.stats.dashes += Math.max(0, w.dashes - l.dashes);
      this.stats.levels += Math.max(0, w.levelsCleared - l.cleared);
      if (w.state === 'dead' && l.state !== 'dead') this.stats.deaths++;
    }
    this.stats.maxLevel = Math.max(this.stats.maxLevel, w.level);
    this._last = { world: w, time: w.time, gems: w.gemsTotal, bumps: w.bumps, pops: w.pops, dashes: w.dashes, cleared: w.levelsCleared, state: w.state };
  };

  Bot.prototype._active = function (b) { return b.spawnT >= 1 && b.stun <= 0.25; };

  Bot.prototype._danger = function (x, y, t) {
    var w = this.world, s = 0;
    for (var i = 0; i < w.bears.length; i++) {
      var b = w.bears[i];
      if (b.spawnT < 0.5) continue;
      var tt = Math.min(t, 1.2), bx = b.x + b.vx * tt * 0.6, by = b.y + b.vy * tt * 0.6;
      if (b.stun > t) continue;
      var d = hyp(x - bx, y - by);
      s += Math.exp(-d / 85) * (b.kind === 'orange' ? 1.3 : 1);
    }
    return s;
  };

  // distance from point (bx,by) to segment (ax,ay)-(cx,cy)
  function segDist(ax, ay, cx, cy, bx, by) {
    var dx = cx - ax, dy = cy - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? ((bx - ax) * dx + (by - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return hyp(ax + dx * t - bx, ay + dy * t - by);
  }

  Bot.prototype._choose = function () {
    var w = this.world, p = w.pip, sp = w.pipMaxSpeed(), i, j;
    if (w.gate.open) return { kind: 'gate', id: 0, x: w.gate.x, y: w.gate.y };
    var best = null, bestCost = 1e9, curCost = 1e9;
    for (i = 0; i < w.gems.length; i++) {
      var g = w.gems[i];
      if (g.appear < 0.4) continue;
      var d = hyp(g.x - p.x, g.y - p.y), t = d / sp + (1 - g.appear) * 0.6;
      if (g.loose && g.life < t + 0.3) continue;
      var cost = t + 1.6 * this._danger(g.x, g.y, t);
      for (j = 0; j < w.bears.length; j++) {
        var b = w.bears[j];
        if (!this._active(b)) continue;
        var sd = segDist(p.x, p.y, g.x, g.y, b.x, b.y);
        if (sd < 70) cost += (70 - sd) / 70 * 0.9;
      }
      if (g.loose) cost -= 0.25;   // grab drops before they vanish
      if (this._target && this._target.id === g.id) curCost = cost;
      if (cost < bestCost) { bestCost = cost; best = g; }
    }
    if (!best) return { kind: 'roam', id: -1, x: 480, y: 300 };
    if (curCost < 1e9 && curCost <= bestCost + 0.35) {
      for (i = 0; i < w.gems.length; i++) if (w.gems[i].id === this._target.id) return { kind: 'gem', id: this._target.id, x: w.gems[i].x, y: w.gems[i].y };
    }
    return { kind: 'gem', id: best.id, x: best.x, y: best.y };
  };

  Bot.prototype._decide = function () {
    var w = this.world, p = w.pip, sk = this.skill, i, a = w.arena;
    this.stats.decisions++;
    this._target = this._choose();
    var tx = this._target.x - p.x, ty = this._target.y - p.y, td = hyp(tx, ty) || 1;
    var mx = tx / td, my = ty / td;
    if (this._target.kind === 'roam' && td < 40) { mx = 0; my = 0; }
    var avoidR = 120 * (0.55 + 0.45 * sk), nearGap = 1e9, nearB = null, ax = 0, ay = 0;
    var careless = p.invuln > 0.5;
    for (i = 0; i < w.bears.length; i++) {
      var b = w.bears[i];
      if (!this._active(b)) continue;
      var bx = b.x + b.vx * 0.3, by = b.y + b.vy * 0.3;
      var rx = p.x - bx, ry = p.y - by, d = hyp(rx, ry) || 1;
      var gap = d - p.radius - b.radius;
      if (gap < nearGap) { nearGap = gap; nearB = b; }
      if (careless || gap > avoidR) continue;
      var k = Math.pow((avoidR - gap) / avoidR, 2) * 2.6;
      var ux = rx / d, uy = ry / d;
      // sideways component: go around on the side the target lies
      var side = (mx * -uy + my * ux) >= 0 ? 1 : -1;
      ax += (ux + -uy * side * 0.8) * k;
      ay += (uy + ux * side * 0.8) * k;
    }
    // walls (avoid being cornered) — not when heading for the gate
    if (this._target.kind !== 'gate') {
      var m = 50;
      if (p.x < a.x + m) ax += (a.x + m - p.x) / m * 0.8;
      if (p.x > a.x + a.w - m) ax -= (p.x - (a.x + a.w - m)) / m * 0.8;
      if (p.y < a.y + m) ay += (a.y + m - p.y) / m * 0.8;
      if (p.y > a.y + a.h - m) ay -= (p.y - (a.y + a.h - m)) / m * 0.8;
    }
    mx += ax; my += ay;
    var l = hyp(mx, my);
    if (l > 1e-6) { mx /= l; my /= l; }
    // noise
    if (sk < 1) {
      this._noise += (this.rng.gauss() * 0.9 - this._noise) * 0.3;
      var ang = Math.atan2(my, mx) + this._noise * (1 - sk) * 0.9;
      if (l > 1e-6) { mx = Math.cos(ang); my = Math.sin(ang); }
    }
    this._mx = mx; this._my = my;
    this._nearGap = nearGap; this._nearB = nearB;
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    this._sync();
    if (!this.enabled) return;
    if (w.state !== 'playing') { w.setTarget(null); w.setMove(0, 0); this._target = null; this._wait = 0; return; }
    this._wait -= dt;
    if (this._wait <= 0) {
      this._decide();
      this._wait = (1 - this.skill) * 0.3 + this.rng.range(0, 0.04 + (1 - this.skill) * 0.15);
    }
    w.setTarget(null);
    w.setMove(this._mx, this._my);
    var p = w.pip, sk = this.skill, i, b, close = 0, inPop = 0;
    for (i = 0; i < w.bears.length; i++) {
      b = w.bears[i];
      if (!this._active(b)) continue;
      var d = hyp(b.x - p.x, b.y - p.y);
      if (d < 115) close++;
      if (d < w.cfg.popRadius - 15) inPop++;
    }
    if (w.size >= w.sizeMax) {
      if ((close >= 1 || inPop >= 2) && p.invuln <= 0.2 && this.rng.chance(0.25 + 0.75 * sk)) w.action();
    } else if (p.dashCd <= 0 && p.invuln <= 0.1 && this._nearB && this._nearGap < 26 && this.rng.chance(0.05 + 0.25 * sk)) {
      w.action();   // escape dash along the steering direction
    }
  };

  CD.Bot = Bot;
})(window.CD = window.CD || {});
