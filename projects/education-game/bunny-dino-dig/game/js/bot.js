/* Bun's Dino Dig — DD.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new DD.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { taps, dig, busy, already, sand, poke, found, wrong, digMore, talks, talkRight, mole, ptero }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerUp (a tap at real logical coordinates) and world.talkAnswer:
 *   waits 1.0–2.4 s × (1.3 − 0.5·skill) after an `ask` and between digs, then taps world.answer() (the right buried mound,
 *   world.moundTap) with p = skill, else a random other buried mound. A glowing hint is always followed. While its dig runs
 *   it sometimes taps the same mound again (p = 0.5 per 0.25 s) to dig faster. Talk: answers after 1.0–2.4 s, right with
 *   p = skill (always when the answer glows). Surprises: taps the mole / the pterosaur once with p = 0.6.
 */
(function (DD) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new DD.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { taps: 0, dig: 0, busy: 0, already: 0, sand: 0, poke: 0, found: 0, wrong: 0, digMore: 0, talks: 0, talkRight: 0, mole: 0, ptero: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = {}; this._moreT = 0.25; this._digId = null;
  }
  var P = Bot.prototype;

  P._delay = function () { return this.rng.float(1.0, 2.4) * (1.3 - 0.5 * this.skill); };
  /** A tap through the real input API at (x, y). → the world's answer string */
  P.tapAt = function (x, y) {
    var w = this.world;
    this.finger.x = x; this.finger.y = y;
    var d = w.pointerDown(x, y), r = d === 'press' ? w.pointerUp(x, y) : d;
    this.stats.taps++;
    if (r === 'pokeBun') this.stats.poke++;
    else if (r && this.stats[r] !== undefined) this.stats[r]++;
    return r;
  };
  /** The mound to tap now: the right one with p = skill (always when it glows), else another buried mound. */
  P._target = function () {
    var w = this.world, r = this.rng, a = w.answer();
    if (!a || a.digging) return null;
    if (w.hintHand || r.chance(this.skill)) return w.moundTap(a.mound);
    var other = w.mounds.filter(function (m) { return m.state === 'buried' && m.id !== a.mound; });
    return other.length ? w.moundTap(r.pick(other).id) : w.moundTap(a.mound);
  };
  /** Count found / wrong from the world's events (call with each drained event; optional). */
  P.onEvent = function (e) { if (e.type === 'found') this.stats.found++; else if (e.type === 'wrong') this.stats.wrong++; };

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
    if (this._key !== key) { this._key = key; this._surp = { mole: r.chance(0.6), ptero: r.chance(0.6) }; this._t = -1; }
    var mh = w.moleHit();
    if (this._surp.mole && mh && r.chance(0.02)) { this._surp.mole = false; this.tapAt(mh.x, mh.y); return; }
    var ph = w.pteroHit();
    if (this._surp.ptero && ph && r.chance(0.03)) { this._surp.ptero = false; this.tapAt(ph.x, ph.y); return; }
    // dig faster: tap the digging mound again now and then
    if (w.dig && w.dig.phase !== 'rise') {
      this._moreT -= dt;
      if (this._moreT <= 0) {
        this._moreT = 0.25;
        if (r.chance(0.5)) { var p0 = w.moundTap(w.dig.id); if (p0) { this.tapAt(p0.x, p0.y); this.stats.digMore++; } }
      }
      return;
    }
    if (!w.interactive) { this._t = -1; return; }
    if (this._t < 0) this._t = this._delay();
    this._t -= dt;
    if (this._t > 0) return;
    this._t = this._delay() * 0.7;
    var p = this._target();
    if (p) this.tapAt(p.x, p.y);
  };

  DD.Bot = Bot;
})(window.DD = window.DD || {});
