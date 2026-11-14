/* Koko's Cake Tower — CK.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new CK.Bot(world, { skill: 0.8, seed: 1, think: [1.0, 2.4], bee: 0.6, poke: 0.03 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { drags, right, wrong, drops, misses, locked, taps, talks, talkRight, pokes, bee }
 *   bot.finger           // { x, y, down } virtual finger in SCREEN logical px (debug overlay)
 *
 * Plays ONLY through the public input API, like a finger: after each `ask` it thinks U(think) s, then presses a resting
 * layer (the right one with p = skill — a glowing hint: p = max(skill, 0.9) — else a random other piece it has not tried
 * for this ask), drags it in 6–10 moves (40–70 ms each) to a point near world.dropPoint() (± 0.15·LW, ± 0.2·LH), holds 0.1–0.25 s and lets go.
 * After a wrong bounce it waits for the tap lock and thinks again (0.6–1.4 s). With p = poke per ask it taps Koko first
 * (the prompt is repeated). The bee (surprise) is tapped with p = bee after 0.4–1.2 s. Talk: answers after
 * 1.0–2.2 s, right with p = skill (a glowing answer: p = max(skill, 0.95)).
 */
(function (CK) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined ? +opts.skill : 0.8, 0, 1);
    this.rng = new CK.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.think = opts.think || [1.0, 2.4];
    this.retry = opts.retry || [0.6, 1.4];
    this.steps = opts.steps || [6, 10];
    this.stepDt = opts.stepDt || [0.04, 0.07];
    this.hold = opts.hold || [0.1, 0.25];
    this.beeP = opts.bee !== undefined ? opts.bee : opts.butterfly !== undefined ? opts.butterfly : 0.6;
    this.pokeP = opts.poke !== undefined ? opts.poke : 0.03;
    this.enabled = true;
    this.stats = { drags: 0, right: 0, wrong: 0, drops: 0, misses: 0, locked: 0, taps: 0, talks: 0, talkRight: 0, pokes: 0, bee: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._key = null; this._t = -1; this._tried = []; this._talkT = -1; this._beeT = -1; this._beeSeen = null; this._poke = false;
    this._drag = null;
  }

  Bot.prototype._askKey = function () { var w = this.world; return w.sessions + ':' + w.level + ':' + w.round + ':' + w.ask; };

  Bot.prototype._choose = function () {
    var w = this.world, ans = w.answerId(), self = this;
    if (!ans) return null;
    var right = w.pieceById(ans);
    if (!right || right.state !== 'rest') return null;
    var p = right.glow > 0.3 ? Math.max(this.skill, 0.9) : this.skill;
    if (this.rng.chance(p)) return right;
    var wrong = w.pieces.filter(function (q) { return q.id !== ans && q.state === 'rest' && self._tried.indexOf(q.id) < 0; });
    return wrong.length ? this.rng.pick(wrong) : right;
  };

  Bot.prototype._tap = function (x, y) {
    var w = this.world;
    this.finger.x = x; this.finger.y = y;
    var id = w.pointerDown(x, y), up = w.pointerUp(x, y);
    return up || id;
  };

  /** Advances a running drag (one finger move per stepDt, then a short hold, then lift). */
  Bot.prototype._stepDrag = function (dt) {
    var d = this._drag, w = this.world, r = this.rng;
    d.t -= dt;
    if (d.t > 0) return;
    if (d.i < d.n) {
      d.i++;
      var u = d.i / d.n, e = u * u * (3 - 2 * u);
      var x = d.x0 + (d.x1 - d.x0) * e, y = d.y0 + (d.y1 - d.y0) * e - Math.sin(Math.PI * u) * d.arc;
      this.finger.x = x; this.finger.y = y;
      w.pointerMove(x, y);
      d.t += d.i < d.n ? r.float(this.stepDt[0], this.stepDt[1]) : r.float(this.hold[0], this.hold[1]);
      return;
    }
    var res = w.pointerUp(this.finger.x, this.finger.y);
    this.finger.down = false;
    this._drag = null;
    if (res === 'drop') { this.stats.drops++; if (d.right) this.stats.right++; else { this.stats.wrong++; this._tried.push(d.id); } }
    else if (res === 'miss') this.stats.misses++;
    this._t = r.float(this.retry[0], this.retry[1]) + (res === 'drop' && !d.right ? w.cfg.wrongLock : 0);
  };

  Bot.prototype.step = function (dt) {
    if (!this.enabled || !(dt > 0)) return;
    var w = this.world, r = this.rng;

    if (w.state === 'talk') {
      this._drag = null;
      if (w.talkAnswered) return;
      if (this._talkT < 0) this._talkT = r.float(1.0, 2.2);
      this._talkT -= dt;
      if (this._talkT <= 0) {
        this._talkT = -1;
        var t = w.talk, pick = t.answerId;
        if (!r.chance(t.glowAnswer ? Math.max(this.skill, 0.95) : this.skill)) {
          var wr = t.choices.filter(function (c) { return c.id !== t.answerId; });
          if (wr.length) pick = r.pick(wr).id;
        }
        this.stats.talks++;
        if (w.talkAnswer(pick)) this.stats.talkRight++;
      }
      return;
    }
    this._talkT = -1;
    if (w.state !== 'round') { this._drag = null; this.finger.down = false; return; }

    if (this._drag) {
      if (!w._press || w._press.id !== this._drag.id) { this._drag = null; this.finger.down = false; return; }   // re-layout cancelled it
      this._stepDrag(dt);
      return;
    }

    // the bee surprise
    var B = w.bee;
    if (B && (B.state === 'in' || B.state === 'sit')) {
      if (this._beeSeen !== B) { this._beeSeen = B; this._beeT = r.chance(this.beeP) ? r.float(0.4, 1.2) : -1; }
      if (this._beeT > 0) {
        this._beeT -= dt;
        if (this._beeT <= 0) { this._beeT = -1; if (this._tap(B.x, B.y) === 'bee') this.stats.bee++; return; }
      }
    }

    if (w.phase !== 'ask') return;
    var key = this._askKey();
    if (key !== this._key) {
      this._key = key; this._tried = []; this._t = r.float(this.think[0], this.think[1]);
      this._poke = r.chance(this.pokeP);
    }
    this._t -= dt;
    if (this._t > 0) return;
    if (this._poke) {
      this._poke = false;
      var kh = w.kokoHit();
      if (this._tap(kh.x, kh.y) === 'pokeKoko') this.stats.pokes++;
      this._t = r.float(1.0, 1.8);
      return;
    }
    var pc = this._choose();
    if (!pc) { this._t = 0.2; return; }
    var LW = w.layout.LW, LH = w.layout.LH, x0 = pc.x + r.float(-0.2, 0.2) * LW, y0 = pc.y + r.float(-0.2, 0.2) * LH;
    this.finger.x = x0; this.finger.y = y0;
    var res = w.pointerDown(x0, y0);
    if (res === 'locked') { this.stats.locked++; this._t = Math.max(0.1, w._lockUntil - w.time + 0.1); return; }
    if (res !== pc.id) { this.stats.misses++; w.pointerUp(x0, y0); this._t = 0.3; return; }
    this.stats.drags++;
    this.finger.down = true;
    var dp = w.dropPoint(), ox = x0 - pc.x, oy = y0 - pc.y;
    this._drag = { id: pc.id, right: pc.right, x0: x0, y0: y0, x1: dp.x + ox + r.float(-0.15, 0.15) * LW, y1: dp.y + oy + r.float(-0.2, 0.2) * LH,
      n: r.int(this.steps[0], this.steps[1]), i: 0, t: r.float(this.stepDt[0], this.stepDt[1]), arc: r.float(0, 60) };
  };

  CK.Bot = Bot;
})(window.CK = window.CK || {});
