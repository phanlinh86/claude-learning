/* Tumi's Flower Farm — FT.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.5)
 *
 *   const bot = new FT.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { taps, pick, wrong, needPick, strokes, lifts, traceDone, chips, talks, talkRight, bird, mouse, poke }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerMove / pointerUp (real logical coordinates) and world.talkAnswer:
 *   waits 0.9–2.2 s × (1.3 − 0.5·skill) after an `ask`, then
 *   - pick steps: taps the right choice (world.choiceHit) with p = skill, else another choice (a glowing hint is followed);
 *   - trace steps: presses on the shining start of the current stroke (world.pathScreen()), slides along the points at
 *     260–420 px/s with a smooth finger wobble ≤ 0.5·tol, lifts at the end; ages 3–4 sometimes lift halfway and go on;
 *   - chips steps: taps free spots on the cookie (world.chipSpot()).
 *   Talk: answers after 1.0–2.4 s, right with p = skill (always when the answer glows). Surprises: taps the bird / mouse
 *   once with p = 0.6.
 */
(function (FT) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new FT.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { taps: 0, pick: 0, wrong: 0, needPick: 0, strokes: 0, lifts: 0, traceDone: 0, chips: 0, talks: 0, talkRight: 0, bird: 0, mouse: 0, poke: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = {}; this.g = null;
  }
  var P = Bot.prototype;

  P._delay = function () { return this.rng.float(0.9, 2.2) * (1.3 - 0.5 * this.skill); };
  /** A tap through the real input API at (x, y). → the world's answer string */
  P.tapAt = function (x, y) {
    var w = this.world;
    this.finger.x = x; this.finger.y = y;
    var d = w.pointerDown(x, y), r = w.pointerUp(x, y);
    var res = r || (d === 'bird' || d === 'mouse' ? d : null);
    this.stats.taps++;
    if (res && this.stats[res] !== undefined) this.stats[res]++;
    if (res === 'pokeMochi') this.stats.poke++;
    if (res === 'chip') this.stats.chips++;
    return res;
  };
  /** Start a finger stroke along `pts` (logical px). */
  P._stroke = function (pts) {
    var w = this.world, r = this.rng, tol = w.tol * w.layout.tray.s;
    if (!pts || pts.length < 1) return false;
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    var amp = Math.min(0.5 * tol, 3 + (1 - this.skill) * 0.6 * tol);
    var liftAt = w.age <= 4 && r.chance(0.18) && cum[cum.length - 1] > 200 ? r.float(0.35, 0.65) * cum[cum.length - 1] : -1;
    this.g = { pts: pts, cum: cum, len: cum[cum.length - 1], d: 0, speed: r.float(260, 420), amp: amp, ph1: r.float(0, 6.28), ph2: r.float(0, 6.28),
      f1: r.float(1.2, 2.4), f2: r.float(3, 5), t: 0, liftAt: liftAt };
    var p0 = pts[0];
    this.finger.x = p0[0]; this.finger.y = p0[1]; this.finger.down = true;
    w.pointerDown(p0[0], p0[1]);
    this.stats.strokes++;
    return true;
  };
  P._strokeStep = function (dt) {
    var g = this.g, w = this.world;
    g.t += dt; g.d = Math.min(g.len, g.d + g.speed * dt);
    var i = 1;
    while (i < g.cum.length - 1 && g.cum[i] < g.d) i++;
    var a = g.pts[i - 1], b = g.pts[Math.min(i, g.pts.length - 1)], seg = (g.cum[i] - g.cum[i - 1]) || 1, u = clamp((g.d - g.cum[i - 1]) / seg, 0, 1);
    var x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
    // smooth finger wobble across the direction of travel
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    var wob = g.amp * (0.7 * Math.sin(g.ph1 + g.f1 * 6.283 * g.t) + 0.3 * Math.sin(g.ph2 + g.f2 * 6.283 * g.t)) * Math.min(1, g.t * 4);
    x += nx * wob; y += ny * wob;
    this.finger.x = x; this.finger.y = y;
    w.pointerMove(x, y);
    var done = g.d >= g.len || !w.interactive || (w.stepInfo && w.stepInfo.mode !== 'trace');
    if (g.liftAt > 0 && g.d >= g.liftAt) { g.liftAt = -1; done = true; this.stats.lifts++; }
    if (done) {
      var r = w.pointerUp(x, y);
      if (r === 'traceDone') this.stats.traceDone++;
      this.finger.down = false; this.g = null;
      this._t = this.rng.float(0.2, 0.45);
    }
  };
  /** The right thing to do now (with p = skill, else a plausible mistake). */
  P._act = function () {
    var w = this.world, r = this.rng, a = w.answer();
    if (!a) return;
    if (a.choice) {
      var glow = !!w.hintHand;
      if (glow || r.chance(this.skill)) { var h = w.choiceHit(a.choice); this.tapAt(h.x, h.y); return; }
      var other = w.choices.filter(function (c) { return c.id !== a.choice && !c.gone; });
      var o = other.length ? w.choiceHit(r.pick(other).id) : w.choiceHit(a.choice);
      this.tapAt(o.x, o.y);
      return;
    }
    if (a.trace) { this._stroke(w.pathScreen()); return; }
    if (a.chip) this.tapAt(a.chip.x, a.chip.y);
  };

  P.step = function (dt) {
    if (!this.enabled || !(dt > 0)) return;
    var w = this.world, r = this.rng;
    if (w.state === 'talk') {
      if (this.g) { this.g = null; this.finger.down = false; }
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
    if (w.state !== 'round') { this._t = -1; this.g = null; this.finger.down = false; return; }
    if (this.g) { this._strokeStep(dt); return; }
    var key = w.level + ':' + w.round;
    if (this._key !== key) { this._key = key; this._surp = { bird: r.chance(0.6), mouse: r.chance(0.6) }; this._t = -1; }
    var bh = w.birdHit();
    if (this._surp.bird && bh) { this._surp.bird = false; this.tapAt(bh.x, bh.y); return; }
    var mh = w.mouseHit();
    if (this._surp.mouse && mh && w.phase === 'play' && r.chance(0.01)) { this._surp.mouse = false; this.tapAt(mh.x, mh.y); return; }
    if (!w.interactive) { this._t = -1; return; }
    if (this._t < 0) this._t = this._delay();
    this._t -= dt;
    if (this._t > 0) return;
    this._t = this._delay() * 0.6;
    this._act();
  };

  FT.Bot = Bot;
})(window.FT = window.FT || {});
