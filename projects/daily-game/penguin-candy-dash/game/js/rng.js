/* Pip's Candy Dash — CD.RNG (copied from Foxy's Reef Memory / Family Flappy)
 * Small, fast, seeded PRNG (mulberry32). Same seed => same sequence on every
 * platform, which is what makes CD.World / CD.Weather deterministic.
 *
 *   const r = new CD.RNG(1234);
 *   r.next()        // float in [0,1)
 *   r.range(a, b)   // float in [a,b)
 *   r.int(a, b)     // integer in [a,b] (inclusive)
 *   r.pick(arr)     // random element
 *   r.chance(p)     // true with probability p
 *   r.sign()        // -1 or +1
 *   r.gauss()       // approx. standard normal (mean 0, sd 1)
 */
(function (CD) {
  'use strict';

  function hashSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return (seed >>> 0) || 0x9e3779b9;
    // strings / anything else: FNV-1a
    var s = String(seed), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) || 0x9e3779b9;
  }

  function RNG(seed) {
    this.seed = hashSeed(seed === undefined ? Date.now() : seed);
    this.state = this.seed;
  }

  RNG.prototype.next = function () {
    var t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.int = function (a, b) { return a + Math.floor(this.next() * (b - a + 1)); };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.sign = function () { return this.next() < 0.5 ? -1 : 1; };
  RNG.prototype.gauss = function () {
    // Irwin–Hall approximation: cheap, bounded (|x| <= 6), good enough for jitter
    var s = 0;
    for (var i = 0; i < 6; i++) s += this.next();
    return (s - 3) * Math.SQRT2;
  };
  /** Derive an independent child generator (for sub-systems). */
  RNG.prototype.fork = function (salt) {
    return new RNG((Math.imul(this.seed ^ hashSeed(salt || 1), 0x9e3779b1) >>> 0));
  };

  CD.RNG = RNG;
})(window.CD = window.CD || {});
