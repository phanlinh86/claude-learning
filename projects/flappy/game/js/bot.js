/* Family Flappy — FF.Bot autopilot (high-speed playtests + title-screen attract mode)
 *
 *   const bot = new FF.Bot(world, { skill: 0..1, seed });
 *   bot.step(dt);      // call each frame BEFORE world.update(dt); may call world.flap()
 *   bot.stats          // { flaps, aimed, altitude, random, starts, deaths, predicted, lapses, time }
 *
 * Strategy
 *  1. READY  → flap to start after a short pause (startDelay).
 *  2. Aim    → if a flap now would release a drop and World.predictDrop() (same
 *              physics as the real drop) says it lands on a shell, flap.
 *  3. Altitude → keep the bird in a comfortable band: never flap when high
 *              (ceiling), always flap when the bird would get too low.
 *  skill < 1: reaction delay (decisions execute later than planned), perception
 *  noise on the bird's height, stricter/looser aim margin, occasional random flaps.
 */
(function (FF) {
  'use strict';

  function Bot(world, opts) {
    opts = opts || {};
    this.world = world;
    this.skill = opts.skill === undefined ? 1 : Math.max(0, Math.min(1, opts.skill));
    this.rng = new FF.RNG(opts.seed !== undefined ? opts.seed : 99);
    this.startDelay = opts.startDelay === undefined ? 0.6 : opts.startDelay;
    this.highY = opts.highY || 115;     // never flap above this (y smaller = higher)
    this.lowY = opts.lowY || 300;       // below this, flapping is welcome
    this.forceY = opts.forceY || 372;   // below this, flap no matter what
    this.minFlapGap = 0.12;             // s between bot flaps
    this.enabled = true;
    this.reset();
  }

  Bot.prototype.reset = function () {
    this.time = 0;
    this._readyTime = 0;
    this._lastFlap = -1e9;
    this._pending = null;     // { at, reason }
    this._deadSeen = false;
    this._distracted = 0;
    this.stats = this.stats || { flaps: 0, aimed: 0, altitude: 0, random: 0, starts: 0, deaths: 0, predicted: 0, lapses: 0, time: 0 };
  };

  Bot.prototype._delay = function () {
    var k = 1 - this.skill;
    return k <= 0 ? 0 : k * (0.08 + 0.17 * this.rng.next());
  };

  Bot.prototype._flap = function (reason) {
    if (this.world.flap()) {
      this._lastFlap = this.time;
      this.stats.flaps++;
      if (this.stats[reason] !== undefined) this.stats[reason]++;
    }
  };

  Bot.prototype._schedule = function (reason) {
    var d = this._delay();
    if (d <= 0) this._flap(reason);
    else this._pending = { at: this.time + d, reason: reason };
  };

  Bot.prototype.step = function (dt) {
    if (!this.enabled) return;
    var w = this.world, c = w.cfg, b = w.bird;
    dt = dt || 0;
    this.time += dt;
    this.stats.time += dt;

    if (w.state === 'ready') {
      this._deadSeen = false;
      this._readyTime += dt;
      if (this._readyTime >= this.startDelay) {
        this._readyTime = 0;
        if (w.flap()) { this.stats.starts++; this._lastFlap = this.time; }
      }
      return;
    }
    if (w.state === 'dead') {
      if (!this._deadSeen) { this._deadSeen = true; this.stats.deaths++; }
      this._pending = null;
      return;
    }

    // execute a delayed decision
    if (this._pending) {
      if (this.time >= this._pending.at) { var r = this._pending.reason; this._pending = null; this._flap(r); }
      return;
    }
    if (this.time - this._lastFlap < this.minFlapGap) return;

    var k = 1 - this.skill;
    // human lapses: now and then a low-skill player looks away for a moment
    if (this._distracted > 0) { this._distracted -= dt; return; }
    if (k > 0 && this.rng.chance(k * 0.3 * dt)) {
      this._distracted = k * this.rng.range(0.35, 1.0);
      this.stats.lapses++;
      return;
    }
    var noise = k > 0 ? this.rng.gauss() * 14 * k : 0;
    // where will the bird be once my (delayed) reaction lands?
    var lag = k * 0.16;
    var yLag = b.y + b.vy * lag + 0.5 * c.gravity * lag * lag + noise;
    var vyLag = Math.min(b.vy + c.gravity * lag, c.maxFall);

    // 1) must flap: too low
    var forceY = this.forceY - k * 25;
    if (yLag > forceY && vyLag > -60) { this._schedule('altitude'); return; }

    // never flap when high (ceiling)
    if (b.y < this.highY) return;

    // 2) aim: would a drop released now land on a shell?
    if (w.canDrop()) {
      var p = w.predictDrop(b.vy);
      var need = 4 + k * 10 - (b.y > this.lowY ? 3 : 0);   // safety margin inside shell box (px)
      if (p.hitId !== null && p.margin >= need) {
        this.stats.predicted++;
        this._schedule('aimed');
        return;
      }
    }

    // 3) human-ish random flap when low-skill
    if (k > 0 && b.y > this.lowY - 40 && this.rng.chance(k * 0.6 * dt)) { this._schedule('random'); }
  };

  FF.Bot = Bot;
})(typeof window !== 'undefined' ? (window.FF = window.FF || {}) : (globalThis.FF = globalThis.FF || {}));
