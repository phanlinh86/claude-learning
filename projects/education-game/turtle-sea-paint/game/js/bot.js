/* Nini's Sea Painting — SP.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new SP.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { taps, pick, paint, wrong, needPaint, notThis, already, talks, talkRight, fishy, clam, poke }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerUp (a tap at real logical coordinates) and world.talkAnswer:
 *   waits 1.0–2.4 s × (1.3 − 0.5·skill) after an `ask` and between taps, then taps world.answer() (the right shell, then the
 *   right part: world.shellHit / world.partTap) with p = skill, else a random other shell / part of the asked kind.
 *   A glowing hint is followed. Talk: answers after 1.0–2.4 s, right with p = skill (always when the answer glows).
 *   Surprises: taps the fishy / the clam once with p = 0.6.
 */
(function (SP) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new SP.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { taps: 0, pick: 0, paint: 0, wrong: 0, needPaint: 0, notThis: 0, already: 0, talks: 0, talkRight: 0, fishy: 0, clam: 0, poke: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = {}; this._ask = -1;
  }
  var P = Bot.prototype;

  P._delay = function () { return this.rng.float(1.0, 2.4) * (1.3 - 0.5 * this.skill); };
  /** A tap through the real input API at (x, y). → the world's answer string */
  P.tapAt = function (x, y) {
    var w = this.world;
    this.finger.x = x; this.finger.y = y;
    var d = w.pointerDown(x, y), r = w.pointerUp(x, y);
    var res = r || (d === 'fishy' || d === 'clam' ? d : null);
    this.stats.taps++;
    if (res && this.stats[res] !== undefined) this.stats[res]++;
    if (res === 'pokeNini') this.stats.poke++;
    return res;
  };
  /** The point to tap now: the right target with p = skill (always when it glows), else a plausible wrong one. */
  P._target = function () {
    var w = this.world, r = this.rng, a = w.answer();
    if (!a) return null;
    var glow = !!w.hintHand;
    if (glow || r.chance(this.skill)) return a.shell ? w.shellHit(a.shell) : w.partTap(a.part);
    var s = w.stepInfo;
    if (a.shell) {
      var other = w.shells.filter(function (q) { return q.color !== a.shell; });
      if (other.length) return w.shellHit(r.pick(other).color);
    } else {
      var same = w.parts.filter(function (p) { return p.role === s.role && !p.painted && s.targets.indexOf(p.id) < 0; });
      if (same.length) return w.partTap(r.pick(same).id);
      var any = w.parts.filter(function (p) { return p.id !== a.part && !p.painted; });   // pickColor: another part (notThis)
      if (any.length) return w.partTap(r.pick(any).id);
    }
    return a.shell ? w.shellHit(a.shell) : w.partTap(a.part);
  };

  P.step = function (dt) {
    if (!this.enabled || !(dt > 0)) return;
    var w = this.world, r = this.rng;
    if (w.state === 'talk') {
      if (w.talkAnswered || !w.talk) return;
      if (this._talkT < 0) this._talkT = r.float(1.0, 2.4);
      this._talkT -= dt;
      if (this._talkT <= 0) {
        this._talkT = -1;
        var t = w.talk, pick = t.answer;
        if (!t.glowAnswer && !r.chance(this.skill)) {
          var wrong = t.choices.filter(function (c) { return c.id !== t.answer; });
          if (wrong.length) pick = r.pick(wrong).id;
        }
        this.stats.talks++;
        if (w.talkAnswer(pick)) this.stats.talkRight++;
      }
      return;
    }
    this._talkT = -1;
    if (w.state !== 'round') { this._t = -1; return; }
    var key = w.level + ':' + w.round;
    if (this._key !== key) { this._key = key; this._surp = { fishy: r.chance(0.6), clam: r.chance(0.6) }; this._t = -1; }
    var fh = w.fishyHit();
    if (this._surp.fishy && fh) { this._surp.fishy = false; this.tapAt(fh.x, fh.y); return; }
    var ch = w.clamHit();
    if (this._surp.clam && ch && w.phase === 'paint' && r.chance(0.01)) { this._surp.clam = false; this.tapAt(ch.x, ch.y); return; }
    if (!w.interactive) { this._t = -1; return; }
    if (this._t < 0) this._t = this._delay();
    this._t -= dt;
    if (this._t > 0) return;
    this._t = this._delay() * 0.7;
    var p = this._target();
    if (p) this.tapAt(p.x, p.y);
  };

  SP.Bot = Bot;
})(window.SP = window.SP || {});
