/* Nim's River Hop — NH.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new NH.Bot(world, { skill: 0.8, seed: 1, pace: 'quick'|'toddler' });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.onEvent(e)       // feed the world's events (drainEvents): counts right / wrong, reacts to `ask` / `land`
 *   bot.stats            // { taps, right, wrong, soft, talks, talkRight, fish, frog, snow, poke }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerUp (real logical coordinates) and world.talkAnswer:
 *   after an `ask` and after each `land` it waits a human-ish delay (quick: 0.6–2.0 s; toddler: listens 2.6 s to the question,
 *   then 1.4–3.2 s; 1.2–2.6 s between hops), then taps the ACTIVE row's target with p = skill (always while a hint glows / the assist
 *   is armed), else a random non-target stone of that row; aim error ± 0.3 × hitR at the stone's CURRENT hit point, held
 *   0.06–0.16 s. Talk: answers after 1.0–2.4 s (toddler 3–6 s), right with p = skill (always when the answer glows). Surprises: taps
 *   the fish / frog / a snowflake with p = 0.5 per round.
 */
(function (NH) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var PACE = {
    quick: { ask: [0.6, 2.0], between: [0.6, 2.0], listen: 0, talk: [1.0, 2.4] },
    toddler: { ask: [1.4, 3.2], between: [1.2, 2.6], listen: 2.6, talk: [3, 6] }
  };

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new NH.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.pace = PACE[opts.pace] || PACE.quick;
    this.enabled = true;
    this.stats = { taps: 0, right: 0, wrong: 0, soft: 0, talks: 0, talkRight: 0, fish: 0, frog: 0, snow: 0, poke: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = {}; this.g = null;
  }
  Bot.PACE = PACE;
  var P = Bot.prototype;

  P._rf = function (a) { return this.rng.float(a[0], a[1]); };
  P.onEvent = function (e) {
    if (e.type === 'right') this.stats.right++;
    else if (e.type === 'wrong') { this.stats.wrong++; this._t = this._rf(this.pace.between); }
    else if (e.type === 'soft') this.stats.soft++;
    else if (e.type === 'ask') this._t = this.pace.listen + this._rf(this.pace.ask);
    else if (e.type === 'land') this._t = this._rf(this.pace.between);
  };

  /** A quick tap at (x, y): press now, lift after 0.06–0.16 s. */
  P.tapAt = function (x, y) {
    var w = this.world;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var d = w.pointerDown(x, y);
    if (d === 'fish' || d === 'frog' || d === 'snow') this.stats[d]++;
    this.g = { t: 0, T: this.rng.float(0.06, 0.16) };
    return d;
  };
  P._stepGesture = function (dt) {
    var g = this.g;
    g.t += dt;
    if (g.t < g.T) return;
    this.g = null; this.finger.down = false;
    if (this.world.pointerUp(this.finger.x, this.finger.y) === 'pokeNim') this.stats.poke++;
  };
  P.cancel = function () { if (this.g) { this.world.cancelDrag(); this.g = null; this.finger.down = false; } };

  /** Tap stone `id` where it is now (± 0.3 × hitR around its hit point). */
  P._tapStone = function (id) {
    var w = this.world, r = this.rng, h = w.stoneHit(id);
    if (!h) return;
    this.stats.taps++;
    var a = r.float(0, Math.PI * 2), d = 0.3 * Math.min(h.r, h.own) * Math.sqrt(r.next());
    this.tapAt(h.x + Math.cos(a) * d, h.y + Math.sin(a) * d);
  };

  P.step = function (dt) {
    if (!this.enabled || !(dt > 0)) return;
    var w = this.world, r = this.rng;
    if (w.state === 'talk') {
      this.cancel();
      if (w.talkAnswered || !w.talk) return;
      if (this._talkT < 0) this._talkT = this._rf(this.pace.talk);
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
    if (this._key !== key) { this._key = key; this._surp = { fish: r.chance(0.5), frog: r.chance(0.5), snow: r.chance(0.5) }; this._t = -1; }
    var hits = { fish: w.fishHit(), frog: w.frogHit(), snow: w.snowHit() };
    for (var s in hits) if (this._surp[s] && hits[s] && r.chance(0.03)) { this._surp[s] = false; this.tapAt(hits[s].x, hits[s].y); return; }
    if (!w.interactive) return;
    if (this._t < 0) this._t = this._rf(this.pace.between);
    this._t -= dt;
    if (this._t > 0) return;
    this._t = this._rf(this.pace.between) + 1.0;   // when nothing happens (e.g. a wrong tap), look again a little later
    var a = w.answer();
    if (!a) return;
    var right = !!w.hintHand || !!w.assistId || r.chance(this.skill), id = a.stone;
    if (!right) {
      var row = w.row, others = w.stones.filter(function (q) { return q.row === row && q.state === 'rest' && !q.target && !q.visited; });
      if (others.length) id = r.pick(others).id;
    }
    this._tapStone(id);
  };

  NH.Bot = Bot;
})(window.NH = window.NH || {});
