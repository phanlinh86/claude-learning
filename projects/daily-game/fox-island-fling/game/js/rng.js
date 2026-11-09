/* Clover's Farm Hop — FIF.RNG (same API as the sister games)
 * Small, fast, seeded PRNG (mulberry32). Same seed => same sequence on every
 * platform, which is what makes FIF.World / FIF.Weather / FIF.Bot deterministic.
 *
 *   const r = new FIF.RNG(1234);
 *   r.next()        // float in [0,1)
 *   r.range(a, b)   // float in [a,b)
 *   r.int(a, b)     // integer in [a,b] (inclusive); r.int(n) = integer in [0,n)
 *   r.pick(arr)     // random element
 *   r.chance(p)     // true with probability p
 *   r.sign()        // -1 or +1
 *   r.gauss()       // approx. standard normal (mean 0, sd 1), bounded |x| <= 6
 *   r.fork(salt)    // independent child generator
 */
(function (FIF) {
  'use strict';
  var M = Math;   // cached: one global lookup instead of one per call (matters in node vm tests)

  function hashSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return (seed >>> 0) || 0x9e3779b9;
    var s = String(seed), h = 0x811c9dc5;           // FNV-1a for strings
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = M.imul(h, 0x01000193);
    }
    return (h >>> 0) || 0x9e3779b9;
  }

  function RNG(seed) {
    this.seed = hashSeed(seed === undefined ? Date.now() : seed);
    this.state = this.seed;
  }

  RNG.prototype.next = function () {
    var t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = M.imul(t ^ (t >>> 15), t | 1);
    t ^= t + M.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.int = function (a, b) {
    if (b === undefined) return M.floor(this.next() * a);
    return a + M.floor(this.next() * (b - a + 1));
  };
  RNG.prototype.pick = function (arr) { return arr[M.floor(this.next() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.sign = function () { return this.next() < 0.5 ? -1 : 1; };
  RNG.prototype.gauss = function () {
    var s = 0;                                       // Irwin–Hall, 6 terms
    for (var i = 0; i < 6; i++) s += this.next();
    return (s - 3) * M.SQRT2;
  };
  RNG.prototype.fork = function (salt) {
    return new RNG((M.imul(this.seed ^ hashSeed(salt || 1), 0x9e3779b1) >>> 0));
  };

  FIF.RNG = RNG;
})(window.FIF = window.FIF || {});
