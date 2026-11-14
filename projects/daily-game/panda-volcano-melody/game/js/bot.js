/* Tofu's Volcano Melody — PVM.Bot (a human-like player for the title demo, autoplay and tests). No DOM.
 *
 *   const bot = new PVM.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);    // call every frame BEFORE world.update(dt); it calls world.setTarget()/clearTarget()
 *   bot.stats        // { plans, levels, overs, goals }                                         (added)
 *
 * Model (skill 0..1):
 *  - Re-plans every `react` s = 0.05 (skill 1) … 0.6 s (skill 0), ±20 %. Between plans it acts on what it
 *    saw at the last plan (crab positions are a stale snapshot) — that is the reaction delay.
 *  - Goal = the best note: short walk, far from crabs, not about to expire; flying volcano notes count at
 *    their landing spot (a player reads the shadow). A mango wins when a heart is missing.
 *  - Danger: every harmful crab (chase/wander, and entering ones a little) within dangerR pushes the
 *    steering direction away. dangerR 60 → 130 px and weight 0.15 → 2.4 with skill.
 *  - Aim noise up to 24 px at skill 0 (a sloppy finger).
 */
(function (PVM) {
  'use strict';

  function hyp(x, y) { return Math.sqrt(x * x + y * y); }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = opts.skill !== undefined ? Math.max(0, Math.min(1, +opts.skill)) : 0.8;
    this.rng = PVM.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    var s = this.skill;
    this.react = 0.05 + (1 - s) * 0.55;
    this.dangerR = 60 + 70 * s;
    this.avoidW = 0.15 + 2.25 * s;
    this.noise = (1 - s) * 24;
    this.stats = { plans: 0, levels: 0, overs: 0, goals: 0 };
    this._think = 0;
    this._goal = null;           // { x, y, id }
    this._snap = [];             // crab snapshot at plan time
    this._phase = null;
    this._ox = 0; this._oy = 0;  // aim noise for this plan
  }

  Bot.prototype._harm = function (k) {
    if (k.state === 'chase' || k.state === 'wander') return 1;
    if (k.state === 'enter') return 0.5;
    return 0;
  };

  Bot.prototype._plan = function () {
    var w = this.world, T = w.tofu, i, j, s = this.skill;
    this.stats.plans++;
    this._snap = [];
    for (i = 0; i < w.crabs.length; i++) {
      var k = w.crabs[i], h = this._harm(k);
      if (h > 0) this._snap.push({ x: k.x, y: k.y, vx: k.vx, vy: k.vy, h: h });
    }
    var best = null, bestC = Infinity;
    for (i = 0; i < w.notes.length; i++) {
      var n = w.notes[i];
      var px = n.state === 'fly' && n.landX !== undefined ? n.landX : n.x;
      var py = n.state === 'fly' && n.landY !== undefined ? n.landY : n.y;
      var d = hyp(px - T.x, py - T.y), cost = d;
      // crabs near the note make it less attractive (better players weigh this more)
      for (j = 0; j < this._snap.length; j++) {
        var cd = hyp(px - this._snap[j].x, py - this._snap[j].y);
        if (cd < 110) cost += (110 - cd) * 3 * s * this._snap[j].h;
      }
      var left = n.life - n.age;
      if (left < d / w.diff.speed + 0.3) cost += 400;          // will fade before we get there
      if (this._goal && this._goal.id === n.id) cost -= 30;     // commitment: do not dither
      if (cost < bestC) { bestC = cost; best = { x: px, y: py, id: n.id }; }
    }
    if (w.mango && w.hearts < w.maxHearts) {
      var md = hyp(w.mango.x - T.x, w.mango.y - T.y) - 120;
      if (md < bestC) best = { x: w.mango.x, y: w.mango.y, id: -1 };
    }
    if (!best) {
      // nothing to grab: drift to the open meadow below the volcano, away from crabs
      best = { x: 480 + (T.x < 480 ? -120 : 120), y: 460, id: 0 };
    }
    if (!this._goal || this._goal.id !== best.id) {
      this.stats.goals++;
      this._ox = this.rng.range(-1, 1) * this.noise; this._oy = this.rng.range(-1, 1) * this.noise;
    }
    this._goal = best;
  };

  Bot.prototype.step = function (dt) {
    var w = this.world;
    if (!this.enabled || !(dt > 0)) return;
    if (w.phase !== this._phase) {
      if (w.phase === 'clear') this.stats.levels++;
      if (w.phase === 'over') this.stats.overs++;
      this._phase = w.phase;
    }
    if (w.phase !== 'playing' && w.phase !== 'intro') { w.clearTarget(); this._goal = null; return; }
    if (w.phase === 'intro') { w.clearTarget(); return; }
    this._think -= dt;
    if (this._think <= 0) { this._think = this.react * this.rng.range(0.8, 1.2); this._plan(); }
    var g = this._goal;
    if (!g) { w.clearTarget(); return; }
    var T = w.tofu, gx = g.x + this._ox, gy = g.y + this._oy;
    var dx = gx - T.x, dy = gy - T.y, d = hyp(dx, dy);
    // danger push from the (stale) crab snapshot; brave while blinking safe
    var rx = 0, ry = 0, any = false;
    if (w.invulnT < 0.4) {
      for (var i = 0; i < this._snap.length; i++) {
        var c = this._snap[i], cx = T.x - c.x, cy = T.y - c.y, cd = hyp(cx, cy);
        if (cd < this.dangerR && cd > 1e-6) {
          var f = (1 - cd / this.dangerR) * this.avoidW * c.h;
          rx += cx / cd * f; ry += cy / cd * f; any = true;
        }
      }
    }
    if (!any || d < 1e-6) { w.setTarget(gx, gy); return; }
    var ux = dx / d + rx, uy = dy / d + ry, ul = hyp(ux, uy) || 1;
    var look = Math.min(80, Math.max(30, d));
    w.setTarget(T.x + ux / ul * look, T.y + uy / ul * look);
  };

  PVM.Bot = Bot;
})(window.PVM = window.PVM || {});
