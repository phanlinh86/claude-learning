/* Mimi's Splash Rocket — DK.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new DK.Bot(world, { skill: 0.8, seed: 1, pace: 'quick'|'toddler' });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.onEvent(e)       // feed the world's events (drainEvents): counts right / wrong, reacts to `ask` / `next` / `pumpAsk`
 *   bot.stats            // { taps, right, wrong, soft, pumps, autoWaits, talks, talkRight, marmot, goat, bird, poke }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerUp (real logical coordinates) and world.talkAnswer:
 *   play: after an `ask` / `next` it waits a human-ish delay (quick: 0.6–2.0 s; toddler: listens 2.6 s to the question, then 1.4–3.2 s),
 *   then taps the target mat with p = skill (always while a hint glows / the assist is armed), else a random non-target mat of this
 *   launch; aim error ± 0.3 × hitR around the mat's CURRENT hit point, held 0.06–0.16 s.
 *   pump: with p = 0.15 per launch it waits for Mimi's auto-pump; else it taps the pump 3 times 0.3–0.6 s apart (the first one
 *   0.3–0.6 s after `pumpAsk`) at the pump's hit circle (± 0.3 r).
 *   Talk: answers after 1.0–2.4 s (toddler 3–6 s), right with p = skill (always when the answer glows). Surprises: taps the marmot /
 *   goat / bird with p = 0.5 per round.
 */
(function (DK) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var PACE = {
    quick: { ask: [0.6, 2.0], between: [0.6, 2.0], listen: 0, talk: [1.0, 2.4], pump: [0.3, 0.6] },
    toddler: { ask: [1.4, 3.2], between: [1.2, 2.6], listen: 2.6, talk: [3, 6], pump: [0.3, 0.6] }
  };

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new DK.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.pace = PACE[opts.pace] || PACE.quick;
    this.pAutoWait = opts.pAutoWait !== undefined ? +opts.pAutoWait : 0.15;
    this.enabled = true;
    this.stats = { taps: 0, right: 0, wrong: 0, soft: 0, pumps: 0, autoWaits: 0, talks: 0, talkRight: 0, marmot: 0, goat: 0, bird: 0, poke: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = {}; this.g = null; this._pumpT = -1; this._wait = false; this._pumpKey = '';
  }
  Bot.PACE = PACE;
  var P = Bot.prototype;

  P._rf = function (a) { return this.rng.float(a[0], a[1]); };
  P.onEvent = function (e) {
    if (e.type === 'right') this.stats.right++;
    else if (e.type === 'wrong') { this.stats.wrong++; this._t = this._rf(this.pace.between); }
    else if (e.type === 'soft') this.stats.soft++;
    else if (e.type === 'ask') this._t = this.pace.listen + this._rf(this.pace.ask);
    else if (e.type === 'next') this._t = this._rf(this.pace.between);
    else if (e.type === 'pumpAsk') { this._wait = this.rng.chance(this.pAutoWait); if (this._wait) this.stats.autoWaits++; this._pumpT = this._rf(this.pace.pump); }
    else if (e.type === 'pump' && !e.auto) this._pumpT = this._rf(this.pace.pump);
  };

  /** A quick tap at (x, y): press now, lift after 0.06–0.16 s. */
  P.tapAt = function (x, y) {
    var w = this.world;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var d = w.pointerDown(x, y);
    if (d === 'marmot' || d === 'goat' || d === 'bird') this.stats[d]++;
    if (d === 'pump') this.stats.pumps++;
    this.g = { t: 0, T: this.rng.float(0.06, 0.16) };
    return d;
  };
  P._stepGesture = function (dt) {
    var g = this.g;
    g.t += dt;
    if (g.t < g.T) return;
    this.g = null; this.finger.down = false;
    if (this.world.pointerUp(this.finger.x, this.finger.y) === 'pokeMimi') this.stats.poke++;
  };
  P.cancel = function () { if (this.g) { this.world.cancelDrag(); this.g = null; this.finger.down = false; } };

  /** Tap mat `id` where it is now (± 0.3 × hitR around its hit point, never outside its own body). */
  P._tapMat = function (id) {
    var w = this.world, r = this.rng, h = w.matHit(id);
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
    if (this._key !== key) { this._key = key; this._surp = { marmot: r.chance(0.5), goat: r.chance(0.5), bird: r.chance(0.5) }; this._t = -1; }
    var hits = { marmot: w.marmotHit(), goat: w.goatHit(), bird: w.birdHit() };
    for (var s in hits) if (this._surp[s] && hits[s] && r.chance(0.03)) { this._surp[s] = false; this.tapAt(hits[s].x, hits[s].y); return; }
    if (!w.interactive) return;
    if (w.phase === 'pump') {
      var pk = key + ':' + w.launch;
      if (this._pumpKey !== pk) { this._pumpKey = pk; if (this._pumpT < 0) this._pumpT = this._rf(this.pace.pump); }
      if (this._wait) return;   // Mimi pumps by herself after 3 s
      this._pumpT -= dt;
      if (this._pumpT > 0) return;
      this._pumpT = this._rf(this.pace.pump);
      var ph = w.pumpHit(), a0 = r.float(0, Math.PI * 2), d0 = 0.3 * ph.r * Math.sqrt(r.next());
      this.tapAt(ph.x + Math.cos(a0) * d0, ph.y + Math.sin(a0) * d0);
      return;
    }
    if (this._t < 0) this._t = this._rf(this.pace.between);
    this._t -= dt;
    if (this._t > 0) return;
    this._t = this._rf(this.pace.between) + 1.0;   // when nothing happens (e.g. a wrong tap), look again a little later
    var ans = w.answer();
    if (!ans || !ans.mat) return;
    var right = !!w.hintHand || !!w.assistId || r.chance(this.skill), id = ans.mat;
    if (!right) {
      var j = w.launch, others = w.mats.filter(function (q) { return q.launch === j && q.state === 'rest' && !q.target && !q.visited; });
      if (others.length) id = r.pick(others).id;
    }
    this._tapMat(id);
  };

  DK.Bot = Bot;
})(window.DK = window.DK || {});
