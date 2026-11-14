/* Tofu's Volcano Melody — PVM.RNG
 * Small, fast, seeded PRNG (mulberry32). Same seed => same sequence on every platform, which is
 * what makes PVM.World / PVM.Weather / PVM.Bot deterministic. Works with or without `new`.
 *
 *   const r = PVM.RNG(1234);
 *   r.next()        // float in [0,1)
 *   r.range(a, b)   // float in [a,b)
 *   r.int(a, b)     // integer in [a,b] (inclusive)
 *   r.pick(arr)     // random element
 *   r.chance(p)     // true with probability p
 *   r.shuffle(arr)  // Fisher–Yates, in place, returns arr
 *   r.sign()        // -1 or +1                                   (added)
 *   r.fork(salt)    // independent child generator for a sub-system (added)
 */
(function (PVM) {
  'use strict';

  function hashSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return (Math.floor(seed) >>> 0) || 0x9e3779b9;
    var s = String(seed), h = 0x811c9dc5;              // strings: FNV-1a
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0) || 0x9e3779b9;
  }

  function RNG(seed) {
    if (!(this instanceof RNG)) return new RNG(seed);
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
  RNG.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1)), t = arr[i];
      arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  RNG.prototype.fork = function (salt) {
    return new RNG(Math.imul(this.seed ^ hashSeed(salt === undefined ? 1 : salt), 0x9e3779b1) >>> 0);
  };

  PVM.RNG = RNG;
})(window.PVM = window.PVM || {});
