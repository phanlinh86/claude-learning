/* Bao's Bubble Sky — PB.BAO_POINTS (written by tools/art_bao.py; do not edit by hand).
 * Points in Bao's 300x300 viewBox: feet anchor, wand ring centre at rest (idle blink talk happy think oops wave giggle),
 * the ring centre in 'blow', ring radius, and the mouth (rest). Scale by (h / 300) and place by the feet. */
(function (PB) {
  'use strict';
  PB.BAO_POINTS = { feet: [150, 292], ring: [250, 120], blowRing: [214, 104], ringR: 26, mouth: [184, 148] };
})(typeof window !== 'undefined' ? (window.PB = window.PB || {}) : (globalThis.PB = globalThis.PB || {}));
