/* Kiki's Camp Chimes — CC.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new CC.Bot(world, { skill: 0.8, seed: 1 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.onEvent(e)       // optional: counts right / wrong from the world's events, reacts to `ask`
 *   bot.stats            // { taps, swipes, right, wrong, brush, soft, songSwipes, songWaits, talks, talkRight, hedgehog, bird, firefly, poke }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *
 * Plays ONLY through world.pointerDown / pointerMove / pointerUp (real logical coordinates) and world.talkAnswer:
 *   after an `ask` it waits 0.8–2.2 s × (1.3 − 0.5·skill); then it touches the asked chime with p = skill (always while the
 *   hint glows), else another chime not rung yet. A touch is a tap (aim error ± 0.3 × hit radius, held 0.06–0.16 s) or, with
 *   p = 0.25, a short horizontal swipe that starts just outside the chime (on the side away from its neighbours' path) so
 *   the FIRST contact is the chime it aims at. Song: swipes left → right across the beam band (p 0.8) or waits for the auto
 *   cascade. Talk: answers after 1.0–2.4 s, right with p = skill (always when the answer glows). Surprises: taps the hedgehog /
 *   bird / a firefly with p = 0.6 per round.
 */
(function (CC) {
  'use strict';

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined && opts.skill !== null ? +opts.skill : 0.8, 0, 1);
    this.rng = new CC.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.stats = { taps: 0, swipes: 0, right: 0, wrong: 0, brush: 0, soft: 0, songSwipes: 0, songWaits: 0, talks: 0, talkRight: 0, hedgehog: 0, bird: 0, firefly: 0, poke: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this._t = -1; this._key = ''; this._talkT = -1; this._surp = {}; this.g = null; this._songKey = ''; this._songT = -1;
  }
  var P = Bot.prototype;

  P._delay = function () { return this.rng.float(0.8, 2.2) * (1.3 - 0.5 * this.skill); };
  P.onEvent = function (e) {
    if (e.type === 'right') this.stats.right++;
    else if (e.type === 'wrong') this.stats.wrong++;
    else if (e.type === 'ring' && e.brush) this.stats.brush++;
    else if (e.type === 'soft') this.stats.soft++;
    else if (e.type === 'ask') this._t = this._delay();
  };

  /** A quick tap at (x, y): press now, lift after 0.06–0.16 s. */
  P.tapAt = function (x, y) {
    var w = this.world;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var d = w.pointerDown(x, y);
    if (d === 'hedgehog' || d === 'bird' || d === 'firefly') this.stats[d]++;
    this.g = { kind: 'tap', t: 0, T: this.rng.float(0.06, 0.16), pts: [], k: 0, x1: x, y1: y };
    return d;
  };
  /** Press (x0, y0), slide in a straight line to (x1, y1) in T s with n pointerMove events, lift. */
  P.swipe = function (x0, y0, x1, y1, T, n) {
    var w = this.world, pts = [];
    n = n || 10;
    for (var i = 1; i <= n; i++) { var u = i / n; pts.push({ x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u + 6 * Math.sin(Math.PI * u) }); }
    this.finger.x = x0; this.finger.y = y0; this.finger.down = true;
    var d = w.pointerDown(x0, y0);
    this.g = { kind: 'swipe', t: 0, T: T, pts: pts, k: 0, x1: x1, y1: y1 };
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
    if (w.pointerUp(this.finger.x, this.finger.y) === 'pokeKiki') this.stats.poke++;
  };
  P.cancel = function () { if (this.g) { this.world.cancelDrag(); this.g = null; this.finger.down = false; } };

  /** Touch chime `id`: a tap near its centre, or a swipe whose first contact is this chime. */
  P._touchChime = function (id) {
    var w = this.world, r = this.rng, h = w.chimeHit(id);
    if (!h) return;
    if (r.chance(0.25)) {
      var dir = r.chance(0.5) ? 1 : -1, sx = h.x - dir * (h.r + 14), sy = h.y + r.float(-0.2, 0.2) * h.r;
      var under = w._chimeAt(sx, sy);
      if (!under && sx > 0 && sx < w.layout.W) {
        this.stats.swipes++;
        this.swipe(sx, sy, h.x + dir * h.r * 0.9, sy + r.float(-10, 10), r.float(0.12, 0.25), 8);
        return;
      }
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
    if (this._key !== key) { this._key = key; this._surp = { hedgehog: r.chance(0.6), bird: r.chance(0.6), firefly: r.chance(0.6) }; this._t = -1; }
    // song: swipe across the band (or let it play by itself)
    var a = w.answer();
    if (a && a.song) {
      if (this._songKey !== key) { this._songKey = key; this._songT = r.chance(0.8) ? r.float(0.6, 2.0) : 99; if (this._songT > 50) this.stats.songWaits++; }
      this._songT -= dt;
      if (this._songT <= 0) {
        this._songT = 99;
        var B = w.layout.band, ys = w._chimeMidY();
        this.stats.songSwipes++;
        this.swipe(B.x + 6, ys, B.x + B.w - 6, ys + r.float(-20, 20), r.float(0.4, 0.8), 18);
      }
      return;
    }
    var hh = w.hedgehogHit();
    if (this._surp.hedgehog && hh && r.chance(0.03)) { this._surp.hedgehog = false; this.tapAt(hh.x, hh.y); return; }
    var bh = w.birdHit();
    if (this._surp.bird && bh && r.chance(0.03)) { this._surp.bird = false; this.tapAt(bh.x, bh.y); return; }
    var fh = w.fireflyHit();
    if (this._surp.firefly && fh && r.chance(0.03)) { this._surp.firefly = false; this.tapAt(fh.x, fh.y); return; }
    if (!w.interactive) return;
    if (this._t < 0) this._t = this._delay();
    this._t -= dt;
    if (this._t > 0) return;
    this._t = this._delay() * 0.6;
    if (!a || !a.chime) return;
    var right = !!w.hintHand || !!w.assistId || r.chance(this.skill), id = a.chime;
    if (!right) {
      var others = w.chimes.filter(function (c) { return c.id !== a.chime && !c.done && c.state === 'hang'; });
      if (others.length) id = r.pick(others).id;
    }
    this._touchChime(id);
  };

  CC.Bot = Bot;
})(window.CC = window.CC || {});
