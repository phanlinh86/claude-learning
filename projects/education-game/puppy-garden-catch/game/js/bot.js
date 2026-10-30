/* Puppy Garden Catch — PG.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new PG.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { steers, correct, wrong, misses, talks, talkRight }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through the public input API, like a finger on the grass below Pip:
 *   pointerDown near Pip → eased moves at 700–1100 px/s to where the chosen bubble will reach the rim →
 *   holds there (re-plans every reaction time 0.8 → 0.25 s as skill 0 → 1, ±20 %) → sometimes lifts after a catch.
 *   Target: the lowest right bubble; a wrong one with p = (1 − skill)·0.35 per new target; at low skill it
 *   sometimes stops short (p = (1 − skill)·0.4) and predicts only from the current position.
 *   Dodging: a falling wrong bubble about to reach the rim over the basket is noticed with p = skill and avoided.
 *   A finger is always held ≥ 0.4 s, so the bot never produces a tap. Talk: answers after 1.0–2.2 s, right with
 *   p = 0.5 + skill/2.
 */
(function (PG) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined ? +opts.skill : 0.8, 0, 1);
    this.rng = new PG.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { steers: 0, correct: 0, wrong: 0, misses: 0, talks: 0, talkRight: 0 };
    this._c0 = { correct: world.counters.correct, wrong: world.counters.wrong, misses: world.counters.misses };
    this.finger = { x: world.pup.x, y: world.layout.H / 2, down: false };
    this._t = this._reaction(); this._downT = 0; this._path = null;
    this._target = null; this._wantWrong = false; this._lastCatches = world.counters.catches; this._talkT = -1;
  }

  Bot.prototype._reaction = function () { return (0.8 - 0.55 * this.skill) * this.rng.float(0.8, 1.2); };
  Bot.prototype._fingerY = function () { var L = this.world.layout; return Math.min(L.groundY + 24, L.H - L.ins.bottom - 6); };

  Bot.prototype._syncStats = function () {
    var c = this.world.counters;
    this.stats.correct = c.correct - this._c0.correct;
    this.stats.wrong = c.wrong - this._c0.wrong;
    this.stats.misses = c.misses - this._c0.misses;
  };

  /** Where the bubble's centre will be when it reaches the rim (s, x). */
  Bot.prototype._predict = function (it) {
    var w = this.world, b = w.basket, A = w.cfg.swayAmp;
    var vy = Math.max(it.vy, 0.6 * w._fallV(w.age) * (it.glow > 0.5 ? w.cfg.hintSlow : 1));
    var tR = Math.max(0, (b.y - it.y) / vy);
    if (this.skill < 0.35) return { t: tR, x: it.x };
    var x = it.xb + it.ub * tR + A * Math.sin(it.phase + 2 * Math.PI / it._swP * tR);
    return { t: tR, x: x };
  };

  Bot.prototype._choose = function () {
    var w = this.world, rights = [], wrongs = [], i;
    for (i = 0; i < w.items.length; i++) {
      var it = w.items[i];
      if (!(it.state === 'fall' || it.state === 'appear')) continue;
      if (it.y > w.basket.y + w.cfg.catchBelow) continue;          // already past the rim
      (it.right ? rights : wrongs).push(it);
    }
    var low = function (arr) { var best = null; for (var k = 0; k < arr.length; k++) if (!best || arr[k].y > best.y) best = arr[k]; return best; };
    var keep = this._target && (this._target.state === 'fall' || this._target.state === 'appear') && this._target.y <= w.basket.y + w.cfg.catchBelow;
    if (!keep) {
      this._wantWrong = wrongs.length > 0 && this.rng.chance((1 - this.skill) * 0.35);
      this._target = this._wantWrong ? low(wrongs) : low(rights);
    } else if (!this._wantWrong) {
      var lr = low(rights);                // a lower right bubble appeared below the current one → switch
      if (lr && lr !== this._target && this._predict(lr).t + 0.3 < this._predict(this._target).t) this._target = lr;
    }
    return { target: this._target, wrongs: wrongs };
  };

  Bot.prototype._plan = function () {
    var w = this.world, p = w.pup, b = w.basket, r = this.rng, s = this.skill;
    var c = this._choose(), it = c.target;
    if (!it) return null;
    var pr = this._predict(it), goal = pr.x;
    if (r.chance((1 - s) * 0.4)) goal = p.x + (goal - p.x) * r.float(0.45, 0.85);   // stops short
    // dodge a wrong bubble that will reach the rim first over the goal
    if (!this._wantWrong && r.chance(s)) {
      for (var i = 0; i < c.wrongs.length; i++) {
        var o = c.wrongs[i], po = this._predict(o), half = 0.5 * b.w + w.cfg.catchSideK * o.size + 24;
        if (po.t < pr.t && po.t < 1.6 && Math.abs(po.x - goal) < half) {
          var sideX = po.x + (goal >= po.x ? 1 : -1) * half;
          if (sideX < w.layout.pup.minX || sideX > w.layout.pup.maxX) sideX = po.x - (goal >= po.x ? 1 : -1) * half;
          goal = sideX;
        }
      }
    }
    return clamp(goal, w.layout.pup.minX, w.layout.pup.maxX);
  };

  Bot.prototype._startPath = function (tx) {
    var f = this.finger, d = Math.abs(tx - f.x), sp = this.rng.float(700, 1100);
    this._path = { x0: f.x, x1: tx, T: Math.max(0.08, d / sp), t: 0 };
  };

  Bot.prototype._release = function () {
    if (!this.finger.down) return;
    this.world.pointerUp(this.finger.x, this.finger.y);
    this.finger.down = false;
  };

  Bot.prototype.step = function (dt) {
    if (!this.enabled || !(dt > 0)) return;
    var w = this.world, r = this.rng;
    this._syncStats();

    if (w.state === 'talk') {
      if (this.finger.down && this._downT >= 0.4) this._release();
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
    if (this.finger.down) this._downT += dt;

    if (w.state !== 'round' || w._roundEnded) {
      if (this.finger.down && this._downT >= 0.4) this._release();
      this._target = null; this._t = Math.max(this._t, 0.15);
      return;
    }

    // after a catch a child often lifts the finger
    if (w.counters.catches !== this._lastCatches) {
      this._lastCatches = w.counters.catches;
      if (this.finger.down && this._downT >= 0.4 && r.chance(0.4)) { this._release(); this._t = this._reaction(); }
    }

    this._t -= dt;
    if (this._t <= 0) {
      this._t = this._reaction();
      var goal = this._plan();
      if (goal !== null) {
        if (!this.finger.down) {
          this.finger.x = clamp(w.pup.x + r.float(-20, 20), 0, w.layout.W); this.finger.y = this._fingerY();
          this.finger.down = true; this._downT = 0;
          w.pointerDown(this.finger.x, this.finger.y);
          this.stats.steers++;
        }
        this._startPath(goal);
      }
    }
    if (this.finger.down) {
      var p = this._path;
      if (p) {
        p.t = Math.min(p.T, p.t + dt);
        var u = p.t / p.T, e = u * u * (3 - 2 * u);
        this.finger.x = p.x0 + (p.x1 - p.x0) * e;
        if (p.t >= p.T) this._path = null;
      }
      this.finger.y = this._fingerY();
      w.pointerMove(this.finger.x, this.finger.y);
    }
  };

  PG.Bot = Bot;
})(window.PG = window.PG || {});
