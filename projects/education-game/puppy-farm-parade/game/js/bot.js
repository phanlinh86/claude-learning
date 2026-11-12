/* Bo's Farm Parade — FP.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new FP.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.onEvent(e)       // optional: counts right / wrong from the world's events, reacts to `ask` / `gateAsk`
 *   bot.stats            // { taps, flicks, right, wrong, soft, doors, doorWaits, talks, talkRight, chick, rooster, firefly, poke }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerMove / pointerUp (real logical coordinates) and world.talkAnswer:
 *   after an `ask` it waits 0.8–2.4 s × (1.3 − 0.5·skill); then it touches the odd one with p = skill (always while the hint
 *   glows / the assist is armed), else a random other standing member. A touch is a tap (aim error ± 0.3 × hit radius, held
 *   0.06–0.16 s) or, with p = 0.2, a flick: a press on empty path just below the member that slides up onto it within 0.12 s.
 *   Gate: taps the barn door after 0.5–1.6 s (p 0.85), else waits for the auto-open. Talk: answers after 1.0–2.4 s, right with
 *   p = skill (always when the answer glows). Surprises: taps the chick / rooster / a firefly with p = 0.6 per round.
 */
(function (FP) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new FP.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { taps: 0, flicks: 0, right: 0, wrong: 0, soft: 0, doors: 0, doorWaits: 0, talks: 0, talkRight: 0, chick: 0, rooster: 0, firefly: 0, poke: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = {}; this.g = null; this._gateKey = ''; this._gateT = -1;
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
    if (d === 'chick' || d === 'rooster' || d === 'firefly') this.stats[d]++;
    this.g = { t: 0, T: this.rng.float(0.06, 0.16), pts: [], k: 0 };
    return d;
  };
  /** Press (x0, y0), slide in a straight line to (x1, y1) in T s with n pointerMove events, lift. */
  P.slide = function (x0, y0, x1, y1, T, n) {
    var w = this.world, pts = [];
    n = n || 6;
    for (var i = 1; i <= n; i++) { var u = i / n; pts.push({ x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u }); }
    this.finger.x = x0; this.finger.y = y0; this.finger.down = true;
    var d = w.pointerDown(x0, y0);
    this.g = { t: 0, T: T, pts: pts, k: 0 };
    return d;
  };
  P._stepGesture = function (dt) {
    var g = this.g, w = this.world;
    g.t += dt;
    if (g.pts.length) {
      var k = Math.min(g.pts.length, Math.floor(g.t / g.T * g.pts.length + 1e-9));
      while (g.k < k) { var p = g.pts[g.k++]; this.finger.x = p.x; this.finger.y = p.y; w.pointerMove(p.x, p.y); }
    }
    if (g.t < g.T) return;
    this.g = null; this.finger.down = false;
    if (w.pointerUp(this.finger.x, this.finger.y) === 'pokeBo') this.stats.poke++;
  };
  P.cancel = function () { if (this.g) { this.world.cancelDrag(); this.g = null; this.finger.down = false; } };

  /** Is (x, y) on nothing (no member, no surprise, not Bo)? */
  P._empty = function (x, y) {
    var w = this.world, L = w.layout;
    if (x < L.ins.left + 4 || x > L.W - L.ins.right - 4 || y < L.ins.top + 4 || y > L.H - L.ins.bottom - 4) return false;
    if (w._memberAt(x, y, true)) return false;
    var hs = [w.chickHit(), w.roosterHit(), w.fireflyHit()];
    for (var i = 0; i < hs.length; i++) if (hs[i] && hyp(x - hs[i].x, y - hs[i].y) <= hs[i].r) return false;
    var b = L.boBox;
    return !(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  };
  /** Touch member `id`: a tap near its centre, or a flick from the empty path just below it. */
  P._touchMember = function (id) {
    var w = this.world, r = this.rng, h = w.memberHit(id);
    if (!h) return;
    if (r.chance(0.2)) {
      var sx = h.x + r.float(-0.2, 0.2) * h.r, sy = h.y + h.r + 10;
      if (this._empty(sx, sy)) { this.stats.flicks++; this.slide(sx, sy, h.x, h.y, r.float(0.06, 0.12), 4); return; }
    }
    this.stats.taps++;
    this.tapAt(h.x + r.float(-0.3, 0.3) * h.r, h.y + r.float(-0.3, 0.3) * h.r);
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
    if (this._key !== key) { this._key = key; this._surp = { chick: r.chance(0.6), rooster: r.chance(0.6), firefly: r.chance(0.6) }; this._t = -1; }
    var a = w.answer();
    // gate: tap the doors (or let them open by themselves)
    if (a && a.door) {
      if (this._gateKey !== key) { this._gateKey = key; this._gateT = r.chance(0.85) ? r.float(0.5, 1.6) : 99; if (this._gateT > 50) this.stats.doorWaits++; }
      this._gateT -= dt;
      if (this._gateT <= 0) {
        this._gateT = 99;
        var d = w.doorHit();
        this.stats.doors++;
        this.tapAt(d.cx + r.float(-0.25, 0.25) * d.w, d.cy + r.float(-0.25, 0.25) * d.h);
      }
      return;
    }
    var ch = w.chickHit();
    if (this._surp.chick && ch && r.chance(0.03)) { this._surp.chick = false; this.tapAt(ch.x, ch.y); return; }
    var rh = w.roosterHit();
    if (this._surp.rooster && rh && r.chance(0.03)) { this._surp.rooster = false; this.tapAt(rh.x, rh.y); return; }
    var fh = w.fireflyHit();
    if (this._surp.firefly && fh && r.chance(0.03)) { this._surp.firefly = false; this.tapAt(fh.x, fh.y); return; }
    if (!w.interactive) return;
    if (this._t < 0) this._t = this._delay();
    this._t -= dt;
    if (this._t > 0) return;
    this._t = this._delay() * 0.6;
    if (!a || !a.member) return;
    var right = !!w.hintHand || !!w.assistId || r.chance(this.skill), id = a.member;
    if (!right) {
      var others = w.members.filter(function (m) { return m.id !== a.member && m.state === 'stand'; });
      if (others.length) id = r.pick(others).id;
    }
    this._touchMember(id);
  };

  FP.Bot = Bot;
})(window.FP = window.FP || {});
