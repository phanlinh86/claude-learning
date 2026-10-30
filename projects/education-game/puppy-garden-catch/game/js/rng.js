/* Puppy Garden Catch — PG.RNG (seeded mulberry32, same style as the sister games)
 * Same seed => same sequence on every platform; this is what makes PG.World,
 * PG.Content, PG.Weather and PG.Bot deterministic.
 *
 *   const r = new PG.RNG(1234);   // number or string seed
 *   r.next()        // float in [0,1)
 *   r.float(a, b)   // float in [a,b)          (alias r.range)
 *   r.int(a, b)     // integer in [a,b] inclusive
 *   r.pick(arr)     // random element
 *   r.shuffle(arr)  // shuffles IN PLACE (Fisher–Yates) and returns arr
 *   r.sample(arr,k) // k distinct elements (new array)
 *   r.chance(p)     // true with probability p
 *   r.sign()        // -1 or +1
 *   r.fork(salt)    // independent child generator (does not advance this one)
 */
(function (PG) {
  'use strict';

  function hashSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return (Math.floor(seed) >>> 0) || 0x9e3779b9;
    var s = String(seed), h = 0x811c9dc5;           // FNV-1a for strings
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0) || 0x9e3779b9;
  }

  function RNG(seed) {
    this.seed = hashSeed(seed === undefined ? Date.now() : seed);
    this.state = this.seed;
  }
  RNG.hash = hashSeed;

  RNG.prototype.next = function () {
    var t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.float = function (a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.range = RNG.prototype.float;
  RNG.prototype.int = function (a, b) { return a + Math.floor(this.next() * (b - a + 1)); };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.sign = function () { return this.next() < 0.5 ? -1 : 1; };
  RNG.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  RNG.prototype.sample = function (arr, k) { return this.shuffle(arr.slice()).slice(0, k); };
  RNG.prototype.fork = function (salt) {
    return new RNG((Math.imul(this.seed ^ hashSeed(salt === undefined ? 1 : salt), 0x9e3779b1) >>> 0));
  };

  PG.RNG = RNG;
})(window.PG = window.PG || {});
