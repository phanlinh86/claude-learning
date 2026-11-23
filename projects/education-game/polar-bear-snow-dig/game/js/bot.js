/* Nuka's Snow Dig — NK.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new NK.Bot(world, { skill: 0.8, seed: 1, pRub: 0.5 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { taps, rubs, rub, dig, busy, already, sand, poke, found, wrong, digMore, talks, talkRight, seal, tern }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerMove / pointerUp (real logical coordinates) and world.talkAnswer:
 *   waits 1.0–2.4 s × (1.3 − 0.5·skill) after an `ask` and between digs, then digs world.answer() (the right buried drift,
 *   world.moundTap) with p = skill, else a random other buried drift. A glowing hint is always followed. Half of its digs
 *   (pRub) are RUBS: press on the drift, 3–6 zig-zag swings of ±50 px over 0.4–0.9 s (every polyline corner is dispatched as a
 *   pointerMove, so a big dt never skips a reversal), lift. After a tap, while its dig runs it sometimes taps the same drift
 *   again (p = 0.5 per 0.25 s) to dig faster. Talk: answers after 1.0–2.4 s, right with p = skill (always when the answer
 *   glows). Surprises: taps the seal / the tern once with p = 0.6.
 */
(function (NK) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new NK.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.pRub = opts.pRub !== undefined ? clamp(+opts.pRub, 0, 1) : 0.5;
    this.stats = { taps: 0, rubs: 0, rub: 0, dig: 0, busy: 0, already: 0, sand: 0, poke: 0, found: 0, wrong: 0, digMore: 0, talks: 0, talkRight: 0, seal: 0, tern: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = {}; this._moreT = 0.25; this._digId = null; this._rub = null;
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
  /** The drift to dig now: the right one with p = skill (always when it glows), else another buried drift. → mound id */
  P._target = function () {
    var w = this.world, r = this.rng, a = w.answer();
    if (!a || a.digging) return null;
    if (w.hintHand || r.chance(this.skill)) return a.mound;
    var other = w.mounds.filter(function (m) { return m.state === 'buried' && m.id !== a.mound; });
    return other.length ? r.pick(other).id : a.mound;
  };
  /** Starts a rub on drift `id`: press now, zig-zag corners over T s (stepped in _stepRub). */
  P.rubOn = function (id) {
    var w = this.world, r = this.rng, c = w.moundTap(id);
    if (!c) return null;
    var n = r.int(3, 6), amp = 50, pts = [{ x: c.x, y: c.y }], side = r.chance(0.5) ? 1 : -1;
    for (var k = 0; k < n; k++) { pts.push({ x: c.x + side * amp, y: c.y + r.float(-8, 8) }); side = -side; }
    pts.push({ x: c.x, y: c.y });
    var len = [0];
    for (k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
    this.finger.x = c.x; this.finger.y = c.y;
    var d = w.pointerDown(c.x, c.y);
    this.stats.rubs++;
    if (d !== 'press') return d;
    this.finger.down = true;
    this._rub = { pts: pts, len: len, t: 0, T: r.float(0.4, 0.9), k: 1 };
    return 'press';
  };
  P._stepRub = function (dt) {
    var w = this.world, R = this._rub, L = R.len, tot = L[L.length - 1];
    R.t += dt;
    var s = Math.min(1, R.t / R.T) * tot;
    while (R.k < L.length && L[R.k] <= s) { var q = R.pts[R.k++]; w.pointerMove(q.x, q.y); this.finger.x = q.x; this.finger.y = q.y; }
    if (R.k < L.length) {
      var a = R.pts[R.k - 1], b = R.pts[R.k], u = (s - L[R.k - 1]) / Math.max(1e-6, L[R.k] - L[R.k - 1]);
      this.finger.x = a.x + (b.x - a.x) * u; this.finger.y = a.y + (b.y - a.y) * u;
      w.pointerMove(this.finger.x, this.finger.y);
    }
    if (R.t >= R.T) {
      this._rub = null; this.finger.down = false;
      var res = w.pointerUp(this.finger.x, this.finger.y);
      if (res && this.stats[res] !== undefined) this.stats[res]++;
    }
  };
  /** Count found / wrong from the world's events (call with each drained event; optional). */
  P.onEvent = function (e) { if (e.type === 'found') this.stats.found++; else if (e.type === 'wrong') this.stats.wrong++; };

  P.step = function (dt) {
    if (!this.enabled || !(dt > 0)) return;
    var w = this.world, r = this.rng;
    if (w.state === 'talk') {
      if (this._rub) { this._rub = null; this.finger.down = false; w.cancelDrag(); }
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
    if (this._rub && w.state !== 'round') { this._rub = null; this.finger.down = false; w.cancelDrag(); }
    if (w.state !== 'round') { this._t = -1; return; }
    if (this._rub) { this._stepRub(dt); return; }
    var key = w.level + ':' + w.round;
    if (this._key !== key) { this._key = key; this._surp = { seal: r.chance(0.6), tern: r.chance(0.6) }; this._t = -1; }
    var mh = w.sealHit();
    if (this._surp.seal && mh && r.chance(0.02)) { this._surp.seal = false; this.tapAt(mh.x, mh.y); return; }
    var ph = w.ternHit();
    if (this._surp.tern && ph && r.chance(0.03)) { this._surp.tern = false; this.tapAt(ph.x, ph.y); return; }
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
    var id = this._target();
    if (!id) return;
    if (r.chance(this.pRub)) this.rubOn(id);
    else { var p = w.moundTap(id); this.tapAt(p.x, p.y); }
  };

  NK.Bot = Bot;
})(window.NK = window.NK || {});
