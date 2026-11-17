/* Tibo's Dino Lake Fishing — TL.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new TL.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.onEvent(e)       // optional: counts right / wrong from the world's events, reacts to `ask`
 *   bot.stats            // { taps, slides, right, wrong, soft, water, talks, talkRight, critter, poke }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerMove / pointerUp (real logical coordinates) and world.talkAnswer:
 *   after an `ask` it waits 0.8–2.4 s × (1.3 − 0.5·skill); then it taps the target fish with p = skill (always while the hint
 *   glows / the assist is armed), else a random other swimming fish — at the fish's CURRENT position (they swim!) with an aim
 *   error of ± 0.3 × hit radius, held 0.06–0.16 s; with p = 0.15 a slide from the water just below the fish; with p = 0.04 a tap
 *   on empty water. Talk: answers after 1.0–2.4 s, right with p = skill (always when the answer glows). Critters: taps the
 *   critter with p = 0.6 per round; now and then pokes Tibo (p 0.03 per round).
 */
(function (TL) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new TL.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { taps: 0, slides: 0, right: 0, wrong: 0, soft: 0, water: 0, talks: 0, talkRight: 0, critter: 0, poke: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = false; this._poke = false; this.g = null;
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
    if (d === 'critter') this.stats.critter++;
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
    if (w.pointerUp(this.finger.x, this.finger.y) === 'pokeTibo') this.stats.poke++;
  };
  P.cancel = function () { if (this.g) { this.world.cancelDrag(); this.g = null; this.finger.down = false; } };

  /** Is (x, y) on nothing (no fish, no critter, not Tibo), inside the safe area? */
  P._empty = function (x, y) {
    var w = this.world, L = w.layout;
    if (x < L.ins.left + 4 || x > L.W - L.ins.right - 4 || y < L.ins.top + 4 || y > L.H - L.ins.bottom - 4) return false;
    for (var i = 0; i < w.members.length; i++) { var h = w.memberHit(w.members[i].id); if (h && hyp(x - h.x, y - h.y) <= h.r + 30) return false; }
    var c = w.critterHit();
    if (c && hyp(x - c.x, y - c.y) <= c.r * 1.6) return false;
    var b = L.tiboBox;
    return !(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  };
  /** Touch fish `id` where it is NOW: a tap near its centre, or a slide from the empty water just below it. */
  P._touchMember = function (id) {
    var w = this.world, r = this.rng, h = w.memberHit(id);
    if (!h) return;
    if (r.chance(0.15)) {
      var sx = h.x + r.float(-0.2, 0.2) * h.r, sy = h.y + h.r + 10;
      if (this._empty(sx, sy)) { this.stats.slides++; this.slide(sx, sy, h.x, h.y, r.float(0.06, 0.12), 4); return; }
    }
    this.stats.taps++;
    this.tapAt(h.x + r.float(-0.3, 0.3) * h.r, h.y + r.float(-0.3, 0.3) * h.r);
  };

  P.step = function (dt) {
    if (!this.enabled || !(dt > 0)) return;
    var w = this.world, r = this.rng, L = w.layout;
    if (w.state === 'talk') {
      this.cancel();
      if (w.talkAnswered || !w.talk || !w.talkOpen()) return;
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
    if (this._key !== key) { this._key = key; this._surp = r.chance(0.6); this._poke = r.chance(0.03); this._t = -1; }
    var ch = w.critterHit();
    if (this._surp && ch && r.chance(0.03)) { this._surp = false; this.tapAt(ch.x + r.float(-0.2, 0.2) * ch.r, ch.y + r.float(-0.2, 0.2) * ch.r); return; }
    if (!w.interactive) return;
    if (this._poke && r.chance(0.02)) { this._poke = false; var tb = w.tiboHit(); this.tapAt(tb.cx, tb.cy); return; }
    if (this._t < 0) this._t = this._delay();
    this._t -= dt;
    if (this._t > 0) return;
    this._t = this._delay() * 0.6;
    var a = w.answer();
    if (!a || !a.member) return;
    var help = !!w.hintHand || !!w.assistId;
    if (!help && r.chance(0.04 * (1 - this.skill * 0.5))) {   // a tap on empty water now and then
      for (var k = 0; k < 6; k++) {
        var x = r.float(L.swim.x0, L.swim.x1), y = r.float(L.surfaceY + 20, L.groundY - 20);
        if (this._empty(x, y)) { this.stats.water++; this.tapAt(x, y); return; }
      }
    }
    var right = help || r.chance(this.skill), id = a.member;
    if (!right) {
      var others = w.members.filter(function (m) { return m.id !== a.member && (m.state === 'swim' || m.state === 'dart'); });
      if (others.length) id = r.pick(others).id;
    }
    this._touchMember(id);
  };

  TL.Bot = Bot;
})(window.TL = window.TL || {});
