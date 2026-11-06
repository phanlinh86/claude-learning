/* Momo's Toy Train — TT.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new TT.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { grabs, correct, wrong, misses, full, taps, whistles, toots, talks, talkRight, hitch, balloon }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerMove / pointerUp / talkAnswer, like a finger:
 *   load: waits 1.0–2.4 s after the `ask` and between cargo (× (1.3 − 0.5·skill)), presses a resting cargo, drags it in
 *   6–10 frames to the target car's centre, 30 px above its floor, and lifts. Target = the right car with p = skill, else a
 *   random other car (count: a full car, or the rug when none is full).
 *   whistle: taps it after 0.8–2 s. Talk: answers after 1.0–2.4 s, right with p = skill (always when the answer glows).
 *   Surprises: taps the bunny / the balloon once with p = 0.6.
 */
(function (TT) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new TT.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { grabs: 0, correct: 0, wrong: 0, misses: 0, full: 0, taps: 0, whistles: 0, toots: 0, talks: 0, talkRight: 0, hitch: 0, balloon: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._drag = null; this._key = ''; this._talkT = -1; this._wT = -1; this._surp = {};
  }
  var P = Bot.prototype;

  P._delay = function () { return this.rng.float(1.0, 2.4) * (1.3 - 0.5 * this.skill); };
  P._count = function (res) {
    var S = this.stats;
    if (res === 'correct') S.correct++; else if (res === 'wrong') S.wrong++; else if (res === 'miss') S.misses++;
    else if (res === 'full') S.full++; else if (res === 'tap') S.taps++;
  };
  P._tap = function (box) {
    var w = this.world;
    this.finger.x = box.x; this.finger.y = box.y;
    var r = w.pointerDown(box.x, box.y);
    w.pointerUp(box.x, box.y);
    return r;
  };

  P._target = function (it) {
    var w = this.world, r = this.rng, right = w.answerCarId(it.id), others = [], i, c;
    if (r.chance(this.skill) && right) return w.carBox(right);
    for (i = 0; i < w.cars.length; i++) {
      c = w.cars[i];
      if (c.id === right) continue;
      if (w.cur.mode === 'count' && c.reserved < c.need) continue;   // a "wrong" count drop = a full car
      others.push(c);
    }
    if (others.length) return w.carBox(r.pick(others));
    if (w.cur.mode === 'count') {   // nothing full yet: release on the rug, away from the cargo (a miss)
      var R = w.layout.rug, x = it.x < (R.x0 + R.x1) / 2 ? Math.min(R.x1, it.x + 200) : Math.max(R.x0, it.x - 200);
      return { x: x, y: R.y0, floorY: R.y0 + 30, miss: true };
    }
    return right ? w.carBox(right) : null;
  };

  P.step = function (dt) {
    if (!this.enabled || !(dt > 0)) return;
    var w = this.world, r = this.rng, i;

    if (w.state === 'talk') {
      this._abort();
      if (w.talkAnswered || !w.talk) return;
      if (this._talkT < 0) this._talkT = r.float(1.0, 2.4);
      this._talkT -= dt;
      if (this._talkT <= 0) {
        this._talkT = -1;
        var t = w.talk, pick = t.answerId;
        if (!t.glowAnswer && !r.chance(this.skill)) {
          var wrong = t.choices.filter(function (c) { return c.id !== t.answerId; });
          if (wrong.length) pick = r.pick(wrong).id;
        }
        this.stats.talks++;
        if (w.talkAnswer(pick)) this.stats.talkRight++;
      }
      return;
    }
    this._talkT = -1;
    if (w.state !== 'round') { this._abort(); this._t = -1; this._wT = -1; return; }

    // surprises: one tap each, sometimes
    var key = w.level + ':' + w.round;
    if (this._key !== key) { this._key = key; this._surp = { hitch: r.chance(0.6), balloon: r.chance(0.6) }; this._t = -1; this._wT = -1; }
    if (!this._drag) {
      if (this._surp.hitch && w.hitch && w.hitch.state === 'ride') { this._surp.hitch = false; if (this._tap(w.hitchHit()) === 'hitch') this.stats.hitch++; return; }
      if (this._surp.balloon && w.balloon && (w.phase === 'load' || w.phase === 'whistle')) { this._surp.balloon = false; if (this._tap(w.balloonHit()) === 'balloon') this.stats.balloon++; return; }
    }

    if (w.phase === 'whistle') {
      this._abort();
      if (this._wT < 0) this._wT = r.float(0.8, 2.0);
      this._wT -= dt;
      if (this._wT <= 0) { this._wT = -1; var res = this._tap(w.whistleHit()); if (res === 'whistle') this.stats.whistles++; else if (res === 'toot') this.stats.toots++; }
      return;
    }
    if (w.phase !== 'load') { this._abort(); this._t = -1; return; }

    var D = this._drag;
    if (D) {
      if (w.held !== D.id) { this._drag = null; this.finger.down = false; this._t = this._delay(); return; }
      D.k++;
      var u = Math.min(1, D.k / D.n), s = u * u * (3 - 2 * u);
      this.finger.x = D.x0 + (D.x1 - D.x0) * s;
      this.finger.y = D.y0 + (D.y1 - D.y0) * s - 60 * Math.sin(Math.PI * s);
      w.pointerMove(this.finger.x, this.finger.y);
      if (D.k >= D.n + 1) {
        this._count(w.pointerUp(this.finger.x, this.finger.y));
        this.finger.down = false; this._drag = null; this._t = this._delay();
      }
      return;
    }
    if (this._t < 0) this._t = this._delay();
    this._t -= dt;
    if (this._t > 0) return;
    var c = [];
    for (i = 0; i < w.items.length; i++) if (w.items[i].state === 'rest' && !w.items[i]._bye) c.push(w.items[i]);
    if (!c.length) { this._t = 0.2; return; }
    var it = r.pick(c), tg = this._target(it);
    if (!tg) { this._t = 0.2; return; }
    this.finger.x = it.x; this.finger.y = it.y; this.finger.down = true;
    var id = w.pointerDown(it.x, it.y);
    if (id !== it.id) { if (w.held) w.pointerUp(it.x, it.y); this.finger.down = false; this._t = 0.2; return; }
    this.stats.grabs++;
    this._drag = { id: id, x0: it.x, y0: it.y, x1: tg.x + r.float(-0.2, 0.2) * Math.min(tg.w || 0, 160), y1: (tg.floorY !== undefined ? tg.floorY : tg.y) - 30, k: 0, n: r.int(6, 10) };
  };
  P._abort = function () {
    if (this._drag) { if (this.world.held === this._drag.id) this.world.cancelDrag(); this._drag = null; }
    this.finger.down = false;
  };

  TT.Bot = Bot;
})(window.TT = window.TT || {});
