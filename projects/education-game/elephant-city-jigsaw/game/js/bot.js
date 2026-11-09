/* Pom's Puzzle Town — PZ.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new PZ.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.onEvent(e)       // optional: counts placed / wrong / nearMiss from the world's events
 *   bot.stats            // { grabs, drags, taps, snap, nearMiss, wrong, home, tap, poke, placed, wrongEv, talks, talkRight, pigeon, bubble }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerMove / pointerUp (real logical coordinates) and world.talkAnswer:
 *   after an `ask` it waits 0.8–2.2 s × (1.3 − 0.5·skill); sometimes (p 0.12) it first taps a tray piece (Pom names it);
 *   then it presses the asked piece with p = skill (always while the hint glows), else another tray piece, and drags it along
 *   a slightly curved path (8–14 moves over 0.4–0.9 s) to the asked slot (± 30 px aim error, sometimes "high": 60 px above;
 *   p 0.06 a big miss elsewhere on the board → near miss) — a wrong piece goes to a random spot on the board — and lets go.
 *   Talk: answers after 1.0–2.4 s, right with p = skill (always when the answer glows). Surprises: taps the pigeon / one
 *   bubble with p = 0.6 per round.
 */
(function (PZ) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new PZ.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { grabs: 0, drags: 0, taps: 0, snap: 0, nearMiss: 0, wrong: 0, home: 0, tap: 0, poke: 0, placed: 0, wrongEv: 0, talks: 0, talkRight: 0, pigeon: 0, bubble: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = {}; this.g = null;
  }
  var P = Bot.prototype;

  P._delay = function () { return this.rng.float(0.8, 2.2) * (1.3 - 0.5 * this.skill); };
  P.onEvent = function (e) { if (e.type === 'placed') this.stats.placed++; else if (e.type === 'wrong') this.stats.wrongEv++; };
  P._count = function (r) { if (r === 'pokePom') this.stats.poke++; else if (r && this.stats[r] !== undefined) this.stats[r]++; };

  /** A quick tap at (x, y). */
  P.tapAt = function (x, y) {
    var w = this.world;
    this.finger.x = x; this.finger.y = y;
    var d = w.pointerDown(x, y);
    if (d === 'pigeon' || d === 'bubble') { this.stats[d]++; return d; }
    if (d === 'grab' || d === 'pom') { this.g = { kind: 'tap', t: 0, T: this.rng.float(0.06, 0.16), x0: x, y0: y, x1: x, y1: y, n: 1 }; this.finger.down = true; if (d === 'grab') this.stats.grabs++; return d; }
    return d;
  };
  /** Press (x0, y0), drag along a curved path to (x1, y1) in T s with n moves, let go. */
  P._dragFrom = function (x0, y0, x1, y1) {
    var w = this.world, r = this.rng;
    this.finger.x = x0; this.finger.y = y0;
    var d = w.pointerDown(x0, y0);
    if (d !== 'grab') { if (d === 'pom') w.pointerUp(x0, y0); return false; }
    this.stats.grabs++; this.stats.drags++;
    var dx = x1 - x0, dy = y1 - y0, len = Math.max(1, Math.sqrt(dx * dx + dy * dy)), bend = r.float(40, 90) * (r.chance(0.5) ? 1 : -1);
    this.g = { kind: 'drag', t: 0, T: r.float(0.4, 0.9), n: r.int(8, 14), k: 0, x0: x0, y0: y0, x1: x1, y1: y1,
      cx: (x0 + x1) / 2 - dy / len * bend, cy: (y0 + y1) / 2 + dx / len * bend - 30 };
    this.finger.down = true;
    return true;
  };
  P._stepGesture = function (dt) {
    var g = this.g, w = this.world;
    g.t += dt;
    if (g.kind === 'drag') {
      var k = Math.min(g.n, Math.floor(g.t / g.T * g.n));
      if (k > g.k) {   // discrete touchmove events along a quadratic Bézier
        g.k = k;
        var u = k / g.n, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
        this.finger.x = a * g.x0 + b * g.cx + c * g.x1; this.finger.y = a * g.y0 + b * g.cy + c * g.y1;
        w.pointerMove(this.finger.x, this.finger.y);
      }
    }
    if (g.t < g.T + (g.kind === 'drag' ? 0.05 : 0)) return;
    this.g = null; this.finger.down = false;
    this._count(w.pointerUp(g.x1, g.y1));
  };
  P.cancel = function () { if (this.g) { this.world.cancelDrag(); this.g = null; this.finger.down = false; } };

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
    if (w.state !== 'round') { this.cancel(); this._t = -1; return; }
    if (this.g) { this._stepGesture(dt); return; }
    var key = w.level + ':' + w.round;
    if (this._key !== key) { this._key = key; this._surp = { pigeon: r.chance(0.6), bubble: r.chance(0.6) }; this._t = -1; }
    var gh = w.pigeonHit();
    if (this._surp.pigeon && gh && r.chance(0.03)) { this._surp.pigeon = false; this.tapAt(gh.x, gh.y); return; }
    var bh = w.bubbleHit();
    if (this._surp.bubble && bh && r.chance(0.03)) { this._surp.bubble = false; this.tapAt(bh.x, bh.y); return; }
    if (!w.interactive) { this._t = -1; return; }
    if (this._t < 0) this._t = this._delay();
    this._t -= dt;
    if (this._t > 0) return;
    this._t = this._delay() * 0.6;
    var a = w.answer();
    if (!a) return;
    var tray = w.pieces.filter(function (p) { return p.state === 'rest'; });
    if (!w.hintHand && tray.length && r.chance(0.12)) {   // "what is this?" — a quick tap on a piece
      var tp = r.pick(tray), th = w.pieceHit(tp.id);
      this.stats.taps++;
      this.tapAt(th.x + r.float(-8, 8), th.y + r.float(-8, 8));
      return;
    }
    var right = !!w.hintHand || r.chance(this.skill), pc = w.pieceById(a.piece);
    var others = tray.filter(function (p) { return p.id !== a.piece; });
    if (!right && others.length) pc = r.pick(others);
    if (!pc || (pc.state !== 'rest' && pc.state !== 'home')) return;
    var h = w.pieceHit(pc.id), px = h.x + r.float(-10, 10), py = h.y + r.float(-10, 10), tx, ty, B = w.layout.board;
    if (pc.id === a.piece) {
      var sd = w.slotDrop(a.slot);
      tx = sd.x + r.float(-30, 30); ty = sd.y + r.float(-30, 30) - (r.chance(0.25) ? 60 : 0);
      if (r.chance(0.06)) { tx = r.float(B.x + 20, B.x + B.w - 20); ty = r.float(B.y + 20, B.y + B.h - 20); }   // a big miss
    } else { tx = r.float(B.x + 30, B.x + B.w - 30); ty = r.float(B.y + 30, B.y + B.h - 30); }
    this._dragFrom(px, py, tx + (px - h.x), ty + (py - h.y));
  };

  PZ.Bot = Bot;
})(window.PZ = window.PZ || {});
