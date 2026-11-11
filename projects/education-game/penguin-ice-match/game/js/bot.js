/* Tuk's Ice Match — IM.Bot (autoplay for tests / demo / ?bot=1; DESIGN §5.4)
 *
 *   const bot = new IM.Bot(world, { skill: 0.8, seed: 1, rub: 0.3 });
 *   bot.step(dt);        // call every frame BEFORE world.update(dt) (same dt)
 *   bot.stats            // { taps, grabs (= taps), flips, rubs, matches, mismatches, misses, talks, talkRight }
 *   bot.finger           // { x, y, down } virtual finger (debug overlay)
 *   bot.memory           // { cardId: key } what the bot remembers
 *
 * Memory model: every time a card's face becomes visible (peek, its own flips, a hint peek) the bot remembers it with
 * probability `skill`. It plays a known pair first; with one card up it taps the remembered partner, else a card it has
 * not seen (else any face-down card). skill 1 = perfect memory (never a mismatch after the peek).
 * Plays ONLY through the public input API, like a finger: reaction (0.9 − 0.5·skill)·U(0.8, 1.25) s (+0.6 s before the
 * first tap of a round), eased path at 900–1300 px/s, pointerDown at the card ± 0.25·size, pointerUp 0.06–0.12 s later.
 * It waits while a mismatch is shown or a pair is being checked. Talk: answers after 1.0–2.2 s, right with p = skill.
 * Rub (p = opts.rub, default 0.3): after revealing the 1st block it keeps the finger down and swipes to the 2nd one
 * (pointerMove at 700–1000 px/s, then pointerUp) — only when the straight path crosses no other frosted block. The 2nd
 * block is the remembered partner, or (it has not seen the 1st face yet) the bot's normal pick for a known pair, else a
 * random clear-path neighbour.
 */
(function (IM) {
  'use strict';

  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = clamp(opts.skill !== undefined ? +opts.skill : 0.8, 0, 1);
    this.rng = new IM.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.enabled = true;
    this.rub = clamp(opts.rub !== undefined ? +opts.rub : 0.3, 0, 1);
    this.stats = { taps: 0, grabs: 0, flips: 0, rubs: 0, matches: 0, mismatches: 0, misses: 0, talks: 0, talkRight: 0 };
    this.finger = { x: world.layout.W / 2, y: world.layout.H / 2, down: false };
    this.memory = {}; this._vis = {}; this._roundKey = null;
    this.phase = 'wait'; this._t = this._reaction(); this._first = true;
    this._path = null; this._target = null; this._talkT = -1; this._ox = 0; this._oy = 0;
  }

  Bot.prototype._reaction = function () { return (0.9 - 0.5 * this.skill) * this.rng.float(0.8, 1.25); };

  Bot.prototype._startPath = function (tx, ty) {
    var f = this.finger, d = hyp(tx - f.x, ty - f.y), sp = this.rng.float(900, 1300);
    this._path = { x0: f.x, y0: f.y, x1: tx, y1: ty, T: Math.max(0.1, d / sp), t: 0, bend: this.rng.float(-0.08, 0.08) * d };
  };
  Bot.prototype._move = function (dt, tx, ty) {
    var p = this._path;
    if (tx !== undefined) { p.x1 = tx; p.y1 = ty; }
    p.t = Math.min(p.T, p.t + dt);
    var u = p.t / p.T, s = u * u * (3 - 2 * u);
    var dx = p.x1 - p.x0, dy = p.y1 - p.y0, L = hyp(dx, dy) || 1, arcK = Math.sin(Math.PI * u) * p.bend;
    this.finger.x = p.x0 + dx * s - dy / L * arcK;
    this.finger.y = p.y0 + dy * s + dx / L * arcK;
    return p.t >= p.T;
  };

  /** Remembers faces as they become visible (flip > 0.9), each exposure with p = skill. */
  Bot.prototype._observe = function () {
    var w = this.world, rk = w.level + ':' + w.round + ':' + (w.cur ? w.cur.seed : '');
    if (rk !== this._roundKey) { this._roundKey = rk; this.memory = {}; this._vis = {}; this._mis0 = 0; this._found0 = 0; }
    this.stats.mismatches += Math.max(0, w.mismatches - this._mis0); this._mis0 = w.mismatches;
    this.stats.matches += Math.max(0, w.found - this._found0); this._found0 = w.found;
    for (var i = 0; i < w.cards.length; i++) {
      var c = w.cards[i];
      if (c.state === 'gone') { delete this.memory[c.id]; continue; }
      var vis = c.flip > 0.9 || (c.flip > 0.7 && c.peekT >= 0);
      if (vis && !this._vis[c.id] && this.rng.chance(this.skill)) this.memory[c.id] = c.key;
      this._vis[c.id] = vis;
    }
  };

  Bot.prototype._choose = function () {
    var w = this.world, down = [], i, mem = this.memory;
    for (i = 0; i < w.cards.length; i++) if (w.cards[i].state === 'down') down.push(w.cards[i]);
    if (!down.length) return null;
    var unknown = down.filter(function (c) { return mem[c.id] === undefined; });
    if (w.open.length === 1) {
      var up = w.cardById(w.open[0]);
      var partner = down.filter(function (c) { return mem[c.id] === up.key; });
      if (partner.length) return partner[0];
      return this.rng.pick(unknown.length ? unknown : down);
    }
    var byKey = {};
    for (i = 0; i < down.length; i++) { var k = mem[down[i].id]; if (k !== undefined) (byKey[k] = byKey[k] || []).push(down[i]); }
    for (var key in byKey) if (byKey[key].length >= 2) return byKey[key][0];
    return this.rng.pick(unknown.length ? unknown : down);
  };

  /** Is the straight finger path from the finger to (x, y) free of other frosted blocks? Exact segment × hit-rect test
   * (Liang–Barsky on each block's rect grown by hitPad + 2 px), so a corner is never clipped between samples. */
  Bot.prototype._clearPath = function (a, b, x, y) {
    var w = this.world, x0 = this.finger.x, y0 = this.finger.y, dx = x - x0, dy = y - y0, pad = w.cfg.hitPad + 2;
    for (var i = 0; i < w.cards.length; i++) {
      var c = w.cards[i];
      if (c === a || c === b || c.state !== 'down') continue;
      var hw = c.w / 2 + pad, hh = c.h / 2 + pad, t0 = 0, t1 = 1;
      var P = [-dx, dx, -dy, dy], Q = [x0 - (c.x - hw), (c.x + hw) - x0, y0 - (c.y - hh), (c.y + hh) - y0], hit = true;
      for (var k = 0; k < 4 && hit; k++) {
        if (Math.abs(P[k]) < 1e-12) { if (Q[k] < 0) hit = false; continue; }
        var r = Q[k] / P[k];
        if (P[k] < 0) { if (r > t1) hit = false; else if (r > t0) t0 = r; }
        else { if (r < t0) hit = false; else if (r < t1) t1 = r; }
      }
      if (hit) return false;
    }
    return true;
  };
  /** The block to rub to after revealing `a` (or null): partner if known, else a random clear-path frosted block. */
  Bot.prototype._rubTarget = function (a) {
    var w = this.world, mem = this.memory, self = this, r = this.rng;
    var down = w.cards.filter(function (c) { return c.state === 'down' && c !== a; });
    if (!down.length) return null;
    var want = mem[a.id] !== undefined ? down.filter(function (c) { return mem[c.id] === mem[a.id]; }) : [];
    var pool = want.length ? want : (mem[a.id] !== undefined ? [] : down.filter(function (c) { return mem[c.id] === undefined; }));
    if (!pool.length) return null;
    var ok = pool.filter(function (c) { return self._clearPath(a, c, c.x, c.y); });
    return ok.length ? r.pick(ok) : null;
  };

  /** Should the bot wait (a mismatch showing, a pair being checked, a pair just found)? */
  Bot.prototype._busy = function () {
    var w = this.world;
    return w.open.length >= 2 || w.phase !== 'play' || !!w._mis;
  };

  Bot.prototype.step = function (dt) {
    if (!this.enabled || !(dt > 0)) return;
    var w = this.world, r = this.rng;

    if (w.state === 'talk') {
      if (w.talkAnswered) return;
      if (this._talkT < 0) this._talkT = r.float(1.0, 2.2);
      this._talkT -= dt;
      if (this._talkT <= 0) {
        this._talkT = -1;
        var t = w.talk, pick = t.answerId;
        if (!r.chance(this.skill)) {
          var wrong = t.choices.filter(function (c) { return c.id !== t.answerId; });
          if (wrong.length) pick = r.pick(wrong).id;
        }
        this.stats.talks++;
        if (w.talkAnswer(pick)) this.stats.talkRight++;
      }
      return;
    }
    this._talkT = -1;
    if (w.state === 'round') this._observe();

    if (w.state !== 'round' || !w.interactive || w.solved) {
      if (this.finger.down) { w.pointerUp(this.finger.x, this.finger.y); this.finger.down = false; }
      if (this.phase !== 'wait' || w.state !== 'round') { this.phase = 'wait'; this._first = true; }
      this._t = this._reaction() + (this._first ? 0.6 : 0);
      return;
    }

    switch (this.phase) {
      case 'wait':
        if (this._busy()) { this._t = Math.max(this._t, this._reaction() * 0.5); break; }
        this._t -= dt;
        if (this._t <= 0) {
          var c = this._choose();
          if (!c) { this._t = 0.1; break; }
          this._target = c; this.phase = 'reach'; this._first = false;
          this._ox = r.float(-0.25, 0.25) * c.w; this._oy = r.float(-0.25, 0.25) * c.h;
          this._startPath(c.x + this._ox, c.y + this._oy);
        }
        break;
      case 'reach': {
        var tc = this._target;
        if (!tc || tc.state !== 'down' || this._busy()) { this.phase = 'wait'; this._t = 0.15; break; }
        if (this._move(dt, tc.x + this._ox, tc.y + this._oy)) {
          this.finger.down = true;
          var n0 = w.events.length;
          var id = w.pointerDown(this.finger.x, this.finger.y);
          this.stats.taps++; this.stats.grabs++;
          if (!id) this.stats.misses++;
          for (var i = n0; i < w.events.length; i++) {
            var e = w.events[i];
            if (e.type === 'flip') this.stats.flips++;
          }
          this.phase = 'up'; this._t = r.float(0.06, 0.12);
          var tgt = id && w.open.length === 1 && w.open[0] === id && r.chance(this.rub) ? this._rubTarget(tc) : null;
          if (tgt) {
            this.phase = 'rub'; this._target = tgt; this._ox = 0; this._oy = 0;
            this._startPath(tgt.x, tgt.y); this._path.bend = 0; this._path.T = Math.max(0.08, hyp(this._path.x1 - this._path.x0, this._path.y1 - this._path.y0) / r.float(700, 1000));
            this.stats.rubs++;
          }
        }
        w.pointerMove(this.finger.x, this.finger.y);
        break;
      }
      case 'rub': {   // finger stays down and swipes to the 2nd block; the world reveals it on entering
        var rt = this._target, done = this._move(dt);
        var n1 = w.events.length;
        w.pointerMove(this.finger.x, this.finger.y);
        for (var j = n1; j < w.events.length; j++) if (w.events[j].type === 'flip') this.stats.flips++;
        if (done || !rt || w.state !== 'round') { w.pointerUp(this.finger.x, this.finger.y); this.finger.down = false; this.phase = 'wait'; this._t = this._reaction(); }
        break;
      }
      case 'up':
        this._t -= dt;
        if (this._t <= 0) { w.pointerUp(this.finger.x, this.finger.y); this.finger.down = false; this.phase = 'wait'; this._t = this._reaction(); }
        break;
    }
  };

  IM.Bot = Bot;
})(window.IM = window.IM || {});
