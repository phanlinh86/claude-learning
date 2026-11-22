/* Mimi's Splash Rocket — DK.MIMI_POINTS + DK.ROCKET_POINTS (written by tools/art_mimi.py; do not edit by hand).
 * MIMI_POINTS: points in Mimi's 300x300 viewBox (characters/mimi_*.svg). Scale by (h / 300), place by the feet.
 *   feet     feet anchor of every frame (bottom of the webbed feet)
 *   box      hit box [x0, y0, x1, y1] (hat to feet, tail to bill)
 *   pumpDy   how much LOWER the head centre is in mimi_pump (all above the feet squashed 1.06 x 0.90 about y 284);
 *            pumpHatDy = how much lower the hat top is there
 *   wingTip  tip of the near wing at rest; hatTop = top of the bucket hat (standing frames, no tilt)
 *   head     head centre (tilt pivot for the face is the neck [176, 186]); bill = bill tip
 * ROCKET_POINTS: points in the rocket's 120x240 viewBox (characters/rocket.svg, nose UP).
 *   nozzle   anchor = nozzle bottom; nose = nose-cone tip (= the chute attachment, chute.svg (120, 196));
 *   com      centre of mass (rotate about it in flight); waterTop = water line y (water fills below it);
 *   w        bottle width (fins reach x 8..112) */
(function (DK) {
  'use strict';
  DK.MIMI_POINTS = { feet: [150, 290], box: [40, 28, 284, 292], pumpDy: 15, pumpHatDy: 25,
    wingTip: [115, 245], hatTop: [166, 32], head: [180, 130], bill: [282, 150] };
  DK.ROCKET_POINTS = { nozzle: [60, 236], nose: [60, 10], com: [60, 150], waterTop: 150, w: 56 };
})(typeof window !== 'undefined' ? (window.DK = window.DK || {}) : (globalThis.DK = globalThis.DK || {}));
