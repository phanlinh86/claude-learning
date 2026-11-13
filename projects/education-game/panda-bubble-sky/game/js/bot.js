/* Bao's Bubble Sky — PB.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new PB.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.onEvent(e)       // optional: counts right / wrong from the world's events, reacts to `ask`
 *   bot.stats            // { taps, right, wrong, soft, talks, talkRight, bird, kite, snow, poke }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerUp (real logical coordinates) and world.talkAnswer:
 *   after an `ask` it waits 0.8–2.4 s × (1.3 − 0.5·skill), then — and between pops — taps a remaining target with p = skill (always
 *   while a hint glows / the assist is armed), else a random non-target bubble; aim error ± 0.3 × the bubble radius at the
 *   bubble's CURRENT position, held 0.06–0.16 s. Talk: answers after 1.0–2.4 s, right with p = skill (always when the answer
 *   glows). Surprises: taps the bird / kite / a snowflake with p = 0.5 per round.
 */
(function (PB) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new PB.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { taps: 0, right: 0, wrong: 0, soft: 0, talks: 0, talkRight: 0, bird: 0, kite: 0, snow: 0, poke: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = {}; this.g = null;
  }
  var P = Bot.prototype;

  P._delay = function () { return this.rng.float(0.8, 2.4) * (1.3 - 0.5 * this.skill); };
  P.onEvent = function (e) {
    if (e.type === 'right') this.stats.right++;
    else if (e.type === 'wrong') this.stats.wrong++;
    else if (e.type === 'soft') this.stats.soft++;
    else if (e.type === 'ask') this._t = this._delay();
  };

  /** A quick tap at (x, y): press now, lift after 0.06–0.16 s. */
  P.tapAt = function (x, y) {
    var w = this.world;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var d = w.pointerDown(x, y);
    if (d === 'bird' || d === 'kite' || d === 'snow') this.stats[d]++;
    this.g = { t: 0, T: this.rng.float(0.06, 0.16) };
    return d;
  };
  P._stepGesture = function (dt) {
    var g = this.g;
    g.t += dt;
    if (g.t < g.T) return;
    this.g = null; this.finger.down = false;
    if (this.world.pointerUp(this.finger.x, this.finger.y) === 'pokeBao') this.stats.poke++;
  };
  P.cancel = function () { if (this.g) { this.world.cancelDrag(); this.g = null; this.finger.down = false; } };

  /** Tap bubble `id` where it is now (± 0.3 × its radius). */
  P._tapBubble = function (id) {
    var w = this.world, r = this.rng, h = w.bubbleHit(id);
    if (!h) return;
    this.stats.taps++;
    var a = r.float(0, Math.PI * 2), d = 0.3 * h.own * Math.sqrt(r.next());
    this.tapAt(h.x + Math.cos(a) * d, h.y + Math.sin(a) * d);
  };

  P.step = function (dt) {
    if (!this.enabled || !(dt > 0)) return;
    var w = this.world, r = this.rng;
    if (w.state === 'talk') {
      this.cancel();
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
    if (w.state !== 'round' && w.state !== 'roundDone') { this.cancel(); this._t = -1; return; }
    if (this.g) { this._stepGesture(dt); return; }
    var key = w.level + ':' + w.round;
    if (this._key !== key) { this._key = key; this._surp = { bird: r.chance(0.5), kite: r.chance(0.5), snow: r.chance(0.5) }; this._t = -1; }
    var hits = { bird: w.birdHit(), kite: w.kiteHit(), snow: w.snowHit() };
    for (var s in hits) if (this._surp[s] && hits[s] && r.chance(0.03)) { this._surp[s] = false; this.tapAt(hits[s].x, hits[s].y); return; }
    if (!w.interactive) return;
    if (this._t < 0) this._t = this._delay();
    this._t -= dt;
    if (this._t > 0) return;
    this._t = this._delay() * 0.6;
    var a = w.answer();
    if (!a) return;
    var right = !!w.hintHand || !!w.assistId || r.chance(this.skill), id = a.bubble;
    if (!right) {
      var tg = w.targets(), others = w.bubbles.filter(function (b) { return b.state === 'float' && tg.indexOf(b.id) < 0; });
      if (others.length) id = r.pick(others).id;
    }
    this._tapBubble(id);
  };

  PB.Bot = Bot;
})(window.PB = window.PB || {});
