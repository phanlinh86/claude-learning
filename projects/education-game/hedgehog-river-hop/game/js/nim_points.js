/* Nim's River Hop — NH.NIM_POINTS (written by tools/art_nim.py; do not edit by hand).
 * Points in Nim's 300x300 viewBox. Scale by (h / 300) and place by the feet.
 *   feet       feet anchor of every standing frame (crouch / jump too)
 *   backSlots  [x, y, rot] fruit centres ON the spines (fruit ~46 units wide), rot in RADIANS (outward tilt);
 *              the same in every standing frame (idle blink talk happy cheer think oops wave giggle dance title)
 *   crouchDy   how far the slots move DOWN in nim_crouch (the art is squashed 1.02 x 0.88 about the feet)
 *   jumpDy     how far the slots move (negative = up) in nim_jump (stretched + tilted up)
 *   rollC / rollR  ball centre + radius in nim_roll; rollSlots = fruit centres on the ball (rotate with rollRot)
 *   mouth      mouth centre (rest); box = hit box [x0, y0, x1, y1] */
(function (NH) {
  'use strict';
  NH.NIM_POINTS = { feet: [150, 290], backSlots: [[143, 83, 0.17], [98, 87, -0.35], [61, 113, -0.87], [43, 147, -1.33]], crouchDy: 22, jumpDy: 2,
    rollC: [150, 200], rollR: 88, rollSlots: [[144, 130], [89, 165], [207, 160], [84, 224]], mouth: [264, 198],
    box: [14, 50, 296, 292] };
})(typeof window !== 'undefined' ? (window.NH = window.NH || {}) : (globalThis.NH = globalThis.NH || {}));
