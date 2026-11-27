/* Tupi's Bakery Delivery — BD.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new BD.Bot(world, { skill: 0.8, seed: 1, pace: 'quick'|'toddler' });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.onEvent(e)       // feed the world's events (drainEvents)
 *   bot.stats            // { grabs, drags, lifts, houseTaps, right, wrong, soft, talks, talkRight, mouse, bird, snow, honk }
 *   bot.finger           // { x, y, down } the virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerMove / pointerUp (logical px, like a finger) and world.talkAnswer:
 *   after an `ask` (and after a wrong house once the cart is back at the fork) it waits a human-ish delay (quick 0.6–2.0 s; toddler:
 *   listens 2.6 s, then 1.4–3.2 s), picks the right house with p = skill (always while a hint glows / the assist is armed), else a
 *   random other house; then with p = 0.25 TAPS that house (auto-drive), otherwise presses the cart and DRAGS: the finger walks the
 *   road from the cart to the house (world.route) in steps of 12–30 px every 1/30 s, wobbling ± 0.25 × roadW across the road, and with
 *   p = 0.15 lifts halfway, waits 0.3–0.8 s and grabs again. It keeps the finger down at the end until the cart arrives (≤ 1.2 s).
 *   Talk: answers after 1.0–2.4 s (toddler 3–6 s), right with p = skill (always when the answer glows). Surprises: taps the mouse /
 *   bird / a snowflake with p = 0.5 per round.
 */
(function (BD) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var PACE = {
    quick: { ask: [0.6, 2.0], again: [0.6, 1.6], listen: 0, talk: [1.0, 2.4] },
    toddler: { ask: [1.4, 3.2], again: [1.2, 2.6], listen: 2.6, talk: [3, 6] }
  };
  var TICK = 1 / 30;

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new BD.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.pace = PACE[opts.pace] || PACE.quick;
    this.pTap = opts.pTap !== undefined ? opts.pTap : 0.25;
    this.pLift = opts.pLift !== undefined ? opts.pLift : 0.15;
    this.enabled = true;
    this.stats = { grabs: 0, drags: 0, lifts: 0, houseTaps: 0, right: 0, wrong: 0, soft: 0, talks: 0, talkRight: 0, mouse: 0, bird: 0, snow: 0, honk: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = {}; this.g = null;
  }
  Bot.PACE = PACE;
  var P = Bot.prototype;

  P._rf = function (a) { return this.rng.float(a[0], a[1]); };
  P.onEvent = function (e) {
    if (e.type === 'right') this.stats.right++;
    else if (e.type === 'wrong') { this.stats.wrong++; this._t = this._rf(this.pace.again); }
    else if (e.type === 'soft') this.stats.soft++;
    else if (e.type === 'honk') this.stats.honk++;
    else if (e.type === 'ask') this._t = this.pace.listen + this._rf(this.pace.ask);
  };
  P._down = function (x, y) { this.finger.x = x; this.finger.y = y; this.finger.down = true; return this.world.pointerDown(x, y); };
  P._move = function (x, y) { this.finger.x = x; this.finger.y = y; this.world.pointerMove(x, y); };
  P._up = function () { this.finger.down = false; return this.world.pointerUp(this.finger.x, this.finger.y); };
  /** A quick tap at (x, y): press now, lift after 0.06–0.16 s. */
  P.tapAt = function (x, y) {
    var d = this._down(x, y);
    if (d === 'mouse' || d === 'bird' || d === 'snow') this.stats[d]++;
    this.g = { kind: 'tap', t: 0, T: this.rng.float(0.06, 0.16) };
    return d;
  };
  P.cancel = function () { if (this.g) { this.world.cancelDrag(); this.g = null; this.finger.down = false; } };

  /** Press the cart and drag along the road to house `id`. */
  P._grabAndDrag = function (id) {
    var w = this.world, h = w.cartHit(), r = this.rng;
    var x = h.x + r.float(-0.25, 0.25) * h.r, y = h.y + r.float(-0.25, 0.25) * h.r;
    var res = this._down(x, y);
    if (res !== 'cart') { if (res) this._up(); return false; }
    this.stats.grabs++;
    var pts = w.route(id);
    this.g = { kind: 'drag', id: id, pts: pts, i: 0, acc: 0, t: 0, hold: 0, lifted: false, liftAt: r.chance(this.pLift) ? r.float(0.35, 0.65) : -1, wob: r.float(0, 6.28) };
    return true;
  };
  P._stepGesture = function (dt) {
    var g = this.g, w = this.world, r = this.rng;
    g.t += dt;
    if (g.kind === 'tap') { if (g.t >= g.T) { this.g = null; this._up(); } return; }
    if (g.kind === 'wait') {   // lifted halfway: grab again after a moment
      if (g.t >= g.T) { this.g = null; if (w.interactive && w.cart.state !== 'auto') this._grabAndDrag(g.id); }
      return;
    }
    // drag: the finger walks the road, 12–30 px per 1/30 s, wobbling across it
    if (w.phase !== 'play' || !this.finger.down || w.cart.state !== 'drag') { this.g = null; if (this.finger.down) this._up(); return; }
    g.acc += dt;
    var rw = w.layout.roadW;
    while (g.acc >= TICK) {
      g.acc -= TICK;
      var pts = g.pts, n = pts.length;
      if (g.i >= n - 1) {
        g.hold += TICK;
        if (g.hold >= 1.2) { this.g = null; this._up(); return; }
        continue;
      }
      var step = r.float(12, 30), x = this.finger.x, y = this.finger.y, cx = pts[g.i][0], cy = pts[g.i][1];
      // advance along the polyline by `step`
      var left = step;
      while (left > 0 && g.i < n - 1) {
        var nx = pts[g.i + 1][0], ny = pts[g.i + 1][1], d = Math.hypot(nx - cx, ny - cy);
        if (d <= left) { left -= d; g.i++; cx = nx; cy = ny; }
        else { cx += (nx - cx) * left / d; cy += (ny - cy) * left / d; pts[g.i] = [cx, cy]; left = 0; }
      }
      var j = Math.min(n - 1, g.i + 1), tx = pts[j][0] - pts[Math.max(0, g.i)][0], ty = pts[j][1] - pts[Math.max(0, g.i)][1], tl = Math.hypot(tx, ty) || 1;
      var wob = 0.25 * rw * Math.sin(g.wob + g.t * 5.3) * (g.i >= n - 1 ? 0 : 1);
      x = cx - ty / tl * wob; y = cy + tx / tl * wob;
      this._move(x, y);
      if (g.liftAt > 0 && !g.lifted && g.i / Math.max(1, n - 1) >= g.liftAt) {
        g.lifted = true; this.stats.lifts++;
        this._up();
        this.g = { kind: 'wait', id: g.id, t: 0, T: r.float(0.3, 0.8) };
        return;
      }
    }
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
    if (this._key !== key) { this._key = key; this._surp = { mouse: r.chance(0.5), bird: r.chance(0.5), snow: r.chance(0.5) }; this._t = -1; }
    var hits = { mouse: w.mouseHit(), bird: w.birdHit(), snow: w.snowHit() };
    for (var s in hits) if (this._surp[s] && hits[s] && r.chance(0.03)) { this._surp[s] = false; this.tapAt(hits[s].x, hits[s].y); return; }
    if (!w.interactive || w.cart.state !== 'wait') return;
    if (this._t < 0) this._t = this._rf(this.pace.again);
    this._t -= dt;
    if (this._t > 0) return;
    this._t = this._rf(this.pace.again) + 1.0;   // when nothing happens, look again a little later
    var a = w.answer();
    if (!a) return;
    if (w.assistId) { var ch = w.cartHit(); this.tapAt(ch.x, ch.y); return; }   // the assist: any press drives there
    var right = !!w.hintHand || w.hintGlow > 0.3 || r.chance(this.skill), id = a.houseId;
    if (!right) {
      var others = w.houses.filter(function (h) { return h.id !== a.houseId; });
      if (others.length) id = r.pick(others).id;
    }
    if (r.chance(this.pTap)) {
      var hb = w.houseHit(id);
      if (hb) { this.stats.houseTaps++; this.tapAt(hb.cx + r.float(-0.2, 0.2) * (hb.x1 - hb.x0), hb.cy + r.float(-0.2, 0.2) * (hb.y1 - hb.y0)); return; }
    }
    if (this._grabAndDrag(id)) this.stats.drags++;
  };

  BD.Bot = Bot;
})(window.BD = window.BD || {});
