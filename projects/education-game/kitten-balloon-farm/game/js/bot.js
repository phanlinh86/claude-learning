/* Kitten's Balloon Farm — KB.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new KB.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { taps, grabs (= taps), correct, wrong, misses, talks, talkRight }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through the public input API, like a finger:
 *   wait (reaction (0.9 − 0.5·skill) s ×0.8–1.25; the first tap of a round waits for the prompt, +0.6 s)
 *   → choose a balloon (right with p = skill, else a wrong one if any) → reach it (eased path, 900–1300 px/s,
 *   slight arc, TRACKING the balloon as it bobs) → pointerDown at the balloon's current position (+ a few px of
 *   finger error) → pointerUp 0.06–0.12 s later.
 *   Right = any answer balloon (find), the current target w.target (ask), any balloon (count).
 * Talk: answers after 1.0–2.2 s, correct with p = skill.
 */
(function (KB) {
  'use strict';

  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined ? +opts.skill : 0.8, 0, 1);
    this.rng = new KB.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { taps: 0, grabs: 0, correct: 0, wrong: 0, misses: 0, talks: 0, talkRight: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this.phase = 'wait'; this._t = this._reaction(); this._first = true;
    this._path = null; this._target = null; this._talkT = -1; this._ox = 0; this._oy = 0;
  }

  Bot.prototype._reaction = function () { return (0.9 - 0.5 * this.skill) * this.rng.float(0.8, 1.25); };

  Bot.prototype._startPath = function (tx, ty) {
    var f = this.finger, d = hyp(tx - f.x, ty - f.y), sp = this.rng.float(900, 1300);
    this._path = { x0: f.x, y0: f.y, x1: tx, y1: ty, T: Math.max(0.1, d / sp), t: 0, bend: this.rng.float(-0.08, 0.08) * d };
  };
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

  /** Is balloon b a right tap now? */
  Bot.prototype._isRight = function (b) {
    var w = this.world, m = w.cur && w.cur.mode;
    return m === 'count' ? true : m === 'ask' ? b.id === w.target : !!b.answer;
  };

  Bot.prototype._choose = function () {
    var w = this.world, right = [], wrong = [], i;
    for (i = 0; i < w.balloons.length; i++) {
      var b = w.balloons[i];
      if (!w.canTap(b)) continue;
      (this._isRight(b) ? right : wrong).push(b);
    }
    if (!right.length && !wrong.length) return null;
    if (right.length && (this.rng.chance(this.skill) || !wrong.length)) return this.rng.pick(right);
    return wrong.length ? this.rng.pick(wrong) : this.rng.pick(right);
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
        if (!r.chance(this.skill)) {
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
      if (this.phase !== 'wait' || w.state !== 'round') { this.phase = 'wait'; this._first = true; }
      this._t = this._reaction() + (this._first ? 0.6 : 0);
      return;
    }

    switch (this.phase) {
      case 'wait':
        this._t -= dt;
        if (this._t <= 0) {
          var b = this._choose();
          if (!b) { this._t = 0.1; break; }
          this._target = b; this.phase = 'reach'; this._first = false;
          this._ox = r.float(-0.25, 0.25) * b.size; this._oy = r.float(-0.25, 0.25) * b.size;
          this._startPath(b.x + this._ox, b.y + this._oy);
        }
        break;
      case 'reach': {
        var tb = this._target;
        if (!tb || !w.canTap(tb)) { this.phase = 'wait'; this._t = 0.15; break; }
        if (this._move(dt, tb.x + this._ox, tb.y + this._oy)) {
          this.finger.down = true;
          var n0 = w.events.length;
          var id = w.pointerDown(this.finger.x, this.finger.y);
          this.stats.taps++; this.stats.grabs++;
          if (!id) this.stats.misses++;
          for (var i = n0; i < w.events.length; i++) {
            var e = w.events[i];
            if (e.type === 'correct') this.stats.correct++;
            else if (e.type === 'wrong') this.stats.wrong++;
          }
          this.phase = 'up'; this._t = r.float(0.06, 0.12);
        }
        w.pointerMove(this.finger.x, this.finger.y);
        break;
      }
      case 'up':
        this._t -= dt;
        if (this._t <= 0) { w.pointerUp(this.finger.x, this.finger.y); this.finger.down = false; this.phase = 'wait'; this._t = this._reaction(); }
        break;
    }
  };

  KB.Bot = Bot;
})(window.KB = window.KB || {});
