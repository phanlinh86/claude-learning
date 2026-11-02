/* Bim's Rainbow Rocket — RR.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new RR.Bot(world, { skill: 0.8, seed: 1, drag: 0.3, think: [1.0, 2.4] });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { taps, drags, right, wrong, misses (taps that hit nothing), boosts, talks, talkRight, pokes }
 *   bot.finger           // { x, y, down } virtual finger in SCREEN logical px (debug overlay)
 *
 * Plays ONLY through the public input API, like a finger: after each `ask` it thinks U(think) s, then picks the right island
 * with p = skill (a glowing hint island with p = max(skill, 0.9)), else a wrong one it has not tried yet. 30 % of the answers
 * are DRAGS: press on the rocket, move along an eased path to the island (pointerMove every frame), release on it. Taps land
 * inside the island's hit area (± 25 % of its size). After a miss it thinks again (0.6–1.4 s). boostReady: taps the rocket
 * after 0.6–2 s. Talk: answers after 1.0–2.2 s, right with p = skill.
 */
(function (RR) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined ? +opts.skill : 0.8, 0, 1);
    this.rng = new RR.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.dragP = opts.drag !== undefined ? opts.drag : 0.3;
    this.think = opts.think || [1.0, 2.4];
    this.boostDelay = opts.boostDelay || [0.6, 2.0];
    this.enabled = true;
    this.stats = { taps: 0, drags: 0, right: 0, wrong: 0, misses: 0, boosts: 0, talks: 0, talkRight: 0, pokes: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._key = null; this._t = -1; this._tried = []; this._drag = null; this._talkT = -1; this._boostT = -1;
  }

  Bot.prototype._hopKey = function () { var w = this.world; return w.level + ':' + w.round + ':' + w.hop + ':' + w.sessions; };

  Bot.prototype._choose = function () {
    var w = this.world, ans = w.answerId(), self = this;
    var row = w.islands.filter(function (i) { return i.state === 'idle' && i.token; });
    if (!row.length || !ans) return null;
    var right = w.islandById(ans);
    var p = right.glow > 0.3 ? Math.max(this.skill, 0.9) : this.skill;
    if (this.rng.chance(p)) return right;
    var wrong = row.filter(function (i) { return i.id !== ans && self._tried.indexOf(i.id) < 0; });
    return wrong.length ? this.rng.pick(wrong) : right;
  };

  Bot.prototype._spot = function (isl) {
    var h = this.world.islandHit(isl), r = this.rng;
    return { x: h.x + r.float(-0.25, 0.25) * h.w * 0.6, y: h.y + r.float(-0.2, 0.2) * h.h * 0.6 };
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
          var wr = t.choices.filter(function (c) { return c.id !== t.answerId; });
          if (wr.length) pick = r.pick(wr).id;
        }
        this.stats.talks++;
        if (w.talkAnswer(pick)) this.stats.talkRight++;
      }
      return;
    }
    this._talkT = -1;

    if (w.state === 'roundDone' && w.phase === 'boostReady') {
      if (this._boostT < 0) this._boostT = r.float(this.boostDelay[0], this.boostDelay[1]);
      this._boostT -= dt;
      if (this._boostT <= 0) {
        var rh = w.rocketHit();
        this.finger.x = rh.x; this.finger.y = rh.y;
        if (w.pointerDown(rh.x, rh.y) === 'boost') this.stats.boosts++;
        w.pointerUp(rh.x, rh.y);
        this._boostT = -1;
      }
      return;
    }
    this._boostT = -1;

    if (w.state !== 'round' || w.phase !== 'ask') {
      if (this._drag) { w.cancelDrag(); this._drag = null; this.finger.down = false; }
      return;
    }
    var key = this._hopKey();
    if (key !== this._key) { this._key = key; this._tried = []; this._t = r.float(this.think[0], this.think[1]); }

    if (this._drag) {   // dragging a flight line from the rocket to the island
      var D = this._drag;
      D.t += dt;
      var u = clamp(D.t / D.T, 0, 1), s = u * u * (3 - 2 * u);
      this.finger.x = D.x0 + (D.x1 - D.x0) * s; this.finger.y = D.y0 + (D.y1 - D.y0) * s;
      w.pointerMove(this.finger.x, this.finger.y);
      if (u >= 1) {
        var res = w.pointerUp(this.finger.x, this.finger.y);
        this.finger.down = false; this._drag = null;
        this._after(res, D.target);
      }
      return;
    }

    this._t -= dt;
    if (this._t > 0) return;
    var isl = this._choose();
    if (!isl) { this._t = 0.2; return; }
    var spot = this._spot(isl);
    if (r.chance(this.dragP)) {
      var rk = w.rocketHit();
      var x0 = rk.x + r.float(-0.2, 0.2) * rk.w, y0 = rk.y + r.float(-0.2, 0.2) * rk.h;
      if (w.pointerDown(x0, y0) === 'rocket') {
        this.stats.drags++;
        this.finger.x = x0; this.finger.y = y0; this.finger.down = true;
        this._drag = { x0: x0, y0: y0, x1: spot.x, y1: spot.y, t: 0, T: r.float(0.35, 0.7), target: isl.id };
        return;
      }
      w.pointerUp(x0, y0);
    }
    this.stats.taps++;
    this.finger.x = spot.x; this.finger.y = spot.y;
    var id = w.pointerDown(spot.x, spot.y);
    w.pointerUp(spot.x, spot.y);
    this._after(id, isl.id);
  };

  Bot.prototype._after = function (id, want) {
    var w = this.world;
    if (id === 'locked') { this.stats.locked = (this.stats.locked || 0) + 1; this._t = Math.max(0.1, w._lockUntil - w.time + 0.1); return; }   // tap lock after a wrong island
    if (!id || id === 'rocket' || id === 'pad' || id === 'pokeBim') { this.stats.misses++; this._t = 0.3; return; }
    if (w.phase === 'ask') {   // still asking → that was a wrong island
      this.stats.wrong++; this._tried.push(id); this._t = this.rng.float(0.6, 1.4);
    } else this.stats.right++;
    void want;
  };

  RR.Bot = Bot;
})(window.RR = window.RR || {});
