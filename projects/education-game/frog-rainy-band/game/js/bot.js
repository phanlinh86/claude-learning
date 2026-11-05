/* Bop's Rainy Band — RB.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new RB.Bot(world, { skill: 0.8, seed: 1, think: [1.0, 2.4], drumGap: [0.35, 0.6], snail: 0.6, poke: 0.03 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { taps, right, wrong, locked, drums, booms, talks, talkRight, pokes, snail }
 *   bot.finger           // { x, y, down } virtual finger in SCREEN logical px (debug overlay)
 *
 * Plays ONLY through the public input API, like a finger: a tap = pointerDown + pointerUp at one point inside the target's
 * hit box. After each `ask` (a listen ask: after the beats) it thinks U(think) s, then taps a member: the right one with
 * p = skill (a glowing hint: p = max(skill, 0.9)), else a random other member it has not tried for this ask. After a wrong
 * tap it waits for the tap lock and thinks again U(retry). Mode drum: taps the big drum n times, U(drumGap) s apart.
 * With p = poke per ask it taps Bop first (the prompt is repeated). The snail is tapped with p = snail after 0.5–1.5 s.
 * Talk: answers after 1.0–2.2 s, right with p = skill (a glowing answer: p = max(skill, 0.95)).
 */
(function (RB) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined ? +opts.skill : 0.8, 0, 1);
    this.rng = new RB.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.think = opts.think || [1.0, 2.4];
    this.retry = opts.retry || [0.6, 1.4];
    this.drumGap = opts.drumGap || [0.35, 0.6];
    this.snailP = opts.snail !== undefined ? opts.snail : 0.6;
    this.pokeP = opts.poke !== undefined ? opts.poke : 0.03;
    this.enabled = true;
    this.stats = { taps: 0, right: 0, wrong: 0, locked: 0, drums: 0, booms: 0, talks: 0, talkRight: 0, pokes: 0, snail: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._key = null; this._t = -1; this._tried = []; this._talkT = -1; this._snT = -1; this._snSeen = null; this._poke = false;
  }

  Bot.prototype._askKey = function () { var w = this.world; return w.sessions + ':' + w.level + ':' + w.round + ':' + w.ask; };

  /** One tap at a point inside a {x, y, w, h} centre box (± 30 % of its half size). */
  Bot.prototype._tapBox = function (b) {
    var r = this.rng, x = b.x + r.float(-0.3, 0.3) * b.w / 2, y = b.y + r.float(-0.3, 0.3) * b.h / 2;
    return this._tap(x, y);
  };
  Bot.prototype._tap = function (x, y) {
    var w = this.world;
    this.finger.x = x; this.finger.y = y;
    this.stats.taps++;
    var id = w.pointerDown(x, y), up = w.pointerUp(x, y);
    return up || id;
  };

  Bot.prototype._choose = function () {
    var w = this.world, ans = w.answerId(), self = this;
    if (!ans) return null;
    var right = w.memberById(ans);
    if (!right || right.state !== 'rest') return null;
    var p = right.glow > 0.3 ? Math.max(this.skill, 0.9) : this.skill;
    if (this.rng.chance(p)) return right;
    var wrong = w.members.filter(function (q) { return q.id !== ans && q.state === 'rest' && self._tried.indexOf(q.id) < 0; });
    return wrong.length ? this.rng.pick(wrong) : right;
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

    // the snail surprise
    var S = w.snail;
    if (S && S.state !== 'out') {
      if (this._snSeen !== S) { this._snSeen = S; this._snT = r.chance(this.snailP) ? r.float(0.5, 1.5) : -1; }
      if (this._snT > 0) {
        this._snT -= dt;
        if (this._snT <= 0) { this._snT = -1; if (this._tapBox(w.snailHit()) === 'snail') this.stats.snail++; return; }
      }
    }

    if (w.phase !== 'ask') return;
    var key = this._askKey(), pr = w.prompt();
    if (key !== this._key) {
      this._key = key; this._tried = []; this._t = r.float(this.think[0], this.think[1]);
      this._poke = r.chance(this.pokeP);
    }
    this._t -= dt;
    if (this._t > 0) return;
    if (this._poke) {
      this._poke = false;
      if (this._tapBox(w.bopHit()) === 'pokeBop') this.stats.pokes++;
      this._t = r.float(1.0, 1.8) + (pr && pr.mode === 'listen' ? 0 : 0);
      return;
    }
    if (pr && pr.mode === 'drum') {
      var res0 = this._tapBox(w.bigDrumHit());
      if (res0 === 'drum') this.stats.drums++; else if (res0 === 'boom') this.stats.booms++;
      this._t = r.float(this.drumGap[0], this.drumGap[1]);
      return;
    }
    var m = this._choose();
    if (!m) { this._t = 0.2; return; }
    var res = this._tapBox(w.memberHit(m));
    if (res === 'locked') { this.stats.locked++; this._t = Math.max(0.1, w._lockUntil - w.time + 0.1); return; }
    if (res === 'play') this.stats.right++;
    else if (res === 'wrong') { this.stats.wrong++; this._tried.push(m.id); this._t = r.float(this.retry[0], this.retry[1]) + w.cfg.wrongLock; }
    else this._t = 0.3;
  };

  RB.Bot = Bot;
})(window.RB = window.RB || {});
