/* Owlet's Snow Garden — SG.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new SG.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { grabs, correct, wrong, misses, talks, talkRight }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through the public input API, like a finger:
 *   wait (reaction 0.8 → 0.25 s as skill 0 → 1, ±20 %) → reach the item (eased path,
 *   700–1100 px/s, slight arc) → pointerDown on it → carry to the target point →
 *   settle 0.08–0.15 s → pointerUp.
 * Target: the right pot (ask mode: the current target w.target, any seed); a wrong pot with
 * p = (1 − skill)·0.35 (sort / ask mode, ≥ 2 pots);
 * an empty spot (miss) with p = (1 − skill)·0.12. Talk: answers after 1.0–2.2 s,
 * correct with p = 0.5 + skill/2.
 */
(function (SG) {
  'use strict';

  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined ? +opts.skill : 0.8, 0, 1);
    this.rng = new SG.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { grabs: 0, correct: 0, wrong: 0, misses: 0, talks: 0, talkRight: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this.phase = 'wait'; this._t = this._reaction();
    this._path = null; this._item = null; this._goal = null; this._talkT = -1;
  }

  Bot.prototype._reaction = function () {
    return (0.8 - 0.55 * this.skill) * this.rng.float(0.8, 1.2);
  };

  Bot.prototype._startPath = function (tx, ty) {
    var f = this.finger, d = hyp(tx - f.x, ty - f.y), sp = this.rng.float(700, 1100);
    this._path = { x0: f.x, y0: f.y, x1: tx, y1: ty, T: Math.max(0.12, d / sp), t: 0, bend: this.rng.float(-0.08, 0.08) * d };
  };
  /** Advances the eased path; target can be updated (tracking a bobbing item). Returns true at the end. */
  Bot.prototype._move = function (dt, tx, ty) {
    var p = this._path;
    if (tx !== undefined) { p.x1 = tx; p.y1 = ty; }
    p.t = Math.min(p.T, p.t + dt);
    var u = p.t / p.T, s = u * u * (3 - 2 * u);
    var dx = p.x1 - p.x0, dy = p.y1 - p.y0, L = hyp(dx, dy) || 1, arcK = Math.sin(Math.PI * u) * p.bend;
    this.finger.x = p.x0 + dx * s - dy / L * arcK;
    this.finger.y = p.y0 + dy * s + dx / L * arcK;
    return p.t >= p.T;
  };

  Bot.prototype._choose = function () {
    var w = this.world, c = [], i;
    for (i = 0; i < w.items.length; i++) if (w.items[i].state === 'idle') c.push(w.items[i]);
    if (!c.length) return null;
    return this.rng.pick(c);
  };

  Bot.prototype._plan = function (it) {
    var w = this.world, r = this.rng, s = this.skill, L = w.layout, i;
    var goalId = w.goalOf(it), right = w.basketById(goalId), goal = { kind: 'right', b: right };
    var roll = r.next(), pMiss = (1 - s) * 0.12, pWrong = (1 - s) * 0.35;
    if (roll < pMiss || !right) goal = { kind: 'miss' };
    else if (roll < pMiss + pWrong && w.cur.mode !== 'count' && w.baskets.length > 1) {
      var others = [];
      for (i = 0; i < w.baskets.length; i++) if (w.baskets[i].id !== goalId) others.push(w.baskets[i]);
      goal = { kind: 'wrong', b: r.pick(others) };
    }
    if (goal.kind === 'miss') {
      // the middle of the play band: far above every pot drop zone
      goal.x = L.play.x + L.play.w * r.float(0.3, 0.7);
      goal.y = L.play.y + Math.min(60, L.play.h * 0.3);
      // a real miss travels: stay clear of the world's tap guard (< tapMovePx counts as a tap)
      if (hyp(goal.x - it.x, goal.y - it.y) < 4 * w.cfg.tapMovePx) goal.x = it.x + (it.x < L.play.x + L.play.w / 2 ? 1 : -1) * 4 * w.cfg.tapMovePx;
    } else {
      var b = goal.b;
      goal.x = b.x + r.float(-0.25, 0.25) * Math.min(b.w, 240);
      goal.y = b.top - r.float(-10, 40);
    }
    // the item hangs (grabKeep·offset − liftPx) from the finger: aim the finger so the ITEM lands on goal
    goal.fx = goal.x - it._offX; goal.fy = goal.y - it._offY + w.cfg.liftPx;
    return goal;
  };

  Bot.prototype._release = function () {
    var w = this.world, n0 = w.events.length;
    w.pointerUp(this.finger.x, this.finger.y);
    this.finger.down = false;
    for (var i = n0; i < w.events.length; i++) {
      var e = w.events[i];
      if (e.type === 'correct') this.stats.correct++;
      else if (e.type === 'wrong') this.stats.wrong++;
      else if (e.type === 'miss') this.stats.misses++;
    }
  };

  Bot.prototype.step = function (dt) {
    if (!this.enabled || !(dt > 0)) return;
    var w = this.world, r = this.rng;

    if (w.state === 'talk') {
      if (w.talkAnswered) return;
      if (this._talkT < 0) this._talkT = r.float(1.0, 2.2);
      this._talkT -= dt;
      if (this._talkT <= 0) {
        this._talkT = -1;
        var t = w.talk, pick = t.answerId;
        if (!r.chance(0.5 + this.skill / 2)) {
          var wrong = t.choices.filter(function (c) { return c.id !== t.answerId; });
          if (wrong.length) pick = r.pick(wrong).id;
        }
        this.stats.talks++;
        if (w.talkAnswer(pick)) this.stats.talkRight++;
      }
      return;
    }
    this._talkT = -1;

    if (w.state !== 'round' || !w.interactive) {
      if (this.finger.down) { w.pointerUp(this.finger.x, this.finger.y); this.finger.down = false; }
      this.phase = 'wait'; this._t = Math.max(this._t, 0.2);
      if (w.state === 'round') this._t = this._reaction();
      return;
    }

    switch (this.phase) {
      case 'wait':
        this._t -= dt;
        if (this._t <= 0) {
          var it = this._choose();
          if (!it) { this._t = 0.1; break; }
          this._item = it; this.phase = 'reach'; this._startPath(it.x, it.y);
        }
        break;
      case 'reach': {
        var item = this._item;
        if (!item || item.state !== 'idle') { this.phase = 'wait'; this._t = 0.1; break; }
        if (this._move(dt, item.x, item.y)) {
          this.finger.down = true;
          var id = w.pointerDown(this.finger.x, this.finger.y);
          if (id !== item.id) {
            if (id) { this._release(); }
            this.finger.down = false; this.phase = 'wait'; this._t = 0.15; break;
          }
          this.stats.grabs++;
          this._goal = this._plan(item);
          this.phase = 'carry';
          this._startPath(this._goal.fx, this._goal.fy);
          this._path.T *= 1.1;
        }
        w.pointerMove(this.finger.x, this.finger.y);
        break;
      }
      case 'carry':
        if (w.held !== (this._item && this._item.id)) { this.finger.down = false; this.phase = 'wait'; this._t = this._reaction(); break; }
        if (this._move(dt)) { this.phase = 'settle'; this._t = r.float(0.08, 0.15); }
        w.pointerMove(this.finger.x, this.finger.y);
        break;
      case 'settle':
        this._t -= dt;
        if (this._t <= 0) { this._release(); this.phase = 'wait'; this._t = this._reaction(); }
        break;
    }
  };

  SG.Bot = Bot;
})(window.SG = window.SG || {});
