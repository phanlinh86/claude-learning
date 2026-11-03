/* Pip's Camp Hide & Seek — FC.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new FC.Bot(world, { skill: 0.8, seed: 1, think: [1.0, 2.4], critter: 0.6, poke: 0.03 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { taps, right, wrong, misses (taps that hit nothing), locked, empty, talks, talkRight, pokes, critter }
 *   bot.finger           // { x, y, down } virtual finger in SCREEN logical px (debug overlay)
 *
 * Plays ONLY through the public input API, like a finger, at the screen point of world.placeHit(id) (± a little):
 * after each `ask` it thinks U(think) s, then taps the right place with p = skill (a glowing hint: p = max(skill, 0.9)),
 * else a random other still-hidden place it has not tried for this ask. After a miss it waits for the tap lock and thinks
 * again (0.6–1.4 s). Now and then (p = poke per ask) it taps Pip first (the prompt is repeated). The squirrel (surprise) is
 * tapped with p = critter after 0.4–1.2 s. Talk: answers after 1.0–2.2 s, right with p = skill.
 */
(function (FC) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined ? +opts.skill : 0.8, 0, 1);
    this.rng = new FC.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.think = opts.think || [1.0, 2.4];
    this.retry = opts.retry || [0.6, 1.4];
    this.critterP = opts.critter !== undefined ? opts.critter : 0.6;
    this.pokeP = opts.poke !== undefined ? opts.poke : 0.03;
    this.enabled = true;
    this.stats = { taps: 0, right: 0, wrong: 0, misses: 0, locked: 0, empty: 0, talks: 0, talkRight: 0, pokes: 0, critter: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._key = null; this._t = -1; this._tried = []; this._talkT = -1; this._critT = -1; this._critSeen = null; this._poke = false;
  }

  Bot.prototype._askKey = function () { var w = this.world; return w.sessions + ':' + w.level + ':' + w.round + ':' + w.ask; };

  Bot.prototype._choose = function () {
    var w = this.world, ans = w.answerId(), self = this;
    if (!ans) return null;
    var hidden = w.places.filter(function (p) {
      var f = w.friendById(p.friendId);
      return !p.found && !p.leaving && f && f.state === 'hidden';
    });
    var right = w.placeById(ans);
    var p = right.glow > 0.3 ? Math.max(this.skill, 0.9) : this.skill;
    if (this.rng.chance(p)) return right;
    var wrong = hidden.filter(function (q) { return q.id !== ans && self._tried.indexOf(q.id) < 0; });
    return wrong.length ? this.rng.pick(wrong) : right;
  };

  Bot.prototype._spot = function (pl) {
    var h = this.world.placeHit(pl), r = this.rng;
    return { x: h.x + r.float(-0.2, 0.2) * h.w * 0.5, y: h.y + r.float(-0.15, 0.15) * h.h * 0.5 };
  };

  Bot.prototype._tap = function (x, y) {
    var w = this.world;
    this.finger.x = x; this.finger.y = y;
    var id = w.pointerDown(x, y), up = w.pointerUp(x, y);
    return up || id;
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
    if (w.state !== 'round') return;

    // the squirrel surprise
    var C = w.critter;
    if (C && (C.state === 'in' || C.state === 'up')) {
      if (this._critSeen !== C) { this._critSeen = C; this._critT = r.chance(this.critterP) ? r.float(0.4, 1.2) : -1; }
      if (this._critT > 0) {
        this._critT -= dt;
        if (this._critT <= 0) { this._critT = -1; if (this._tap(C.x, C.y - C.size * 0.5) === 'critter') this.stats.critter++; return; }
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
      var ph = w.pipHit();
      if (this._tap(ph.x, ph.y) === 'pokePip') this.stats.pokes++;
      this._t = r.float(1.0, 1.8);
      return;
    }
    var pl = this._choose();
    if (!pl) { this._t = 0.2; return; }
    var s = this._spot(pl);
    this.stats.taps++;
    var res = this._tap(s.x, s.y);
    this._after(res, pl.id);
  };

  Bot.prototype._after = function (res, id) {
    var w = this.world;
    if (res === 'locked') { this.stats.locked++; this._t = Math.max(0.1, w._lockUntil - w.time + 0.1); return; }   // tap lock after a wrong peek
    if (res === 'empty') { this.stats.empty++; this._t = 0.5; return; }
    if (!res || res === 'pip' || res === 'pokePip' || res === 'critter') { this.stats.misses++; this._t = 0.3; return; }
    var right = w.friendById(w.placeById(res).friendId);
    if (right && right.id === (w._answerF() || {}).id) this.stats.right++;
    else { this.stats.wrong++; this._tried.push(id); }
    this._t = this.rng.float(this.retry[0], this.retry[1]) + w.cfg.popDelay + w.cfg.popTime;
  };

  FC.Bot = Bot;
})(window.FC = window.FC || {});
