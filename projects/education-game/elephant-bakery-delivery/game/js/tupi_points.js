/* Tupi's Bakery Delivery — BD.TUPI_POINTS (written by tools/art_tupi.py; do not edit by hand).
 * Tupi frames: 300x300 viewBox, Tupi seated facing RIGHT. Cart: 340x240 viewBox facing RIGHT.
 * Tupi is drawn at the SAME scale as the cart (1 unit = 1 unit): put Tupi's seat anchor on cart.seat, i.e. draw the
 * Tupi frame at cart offset (cart.seat - seat) = (50, -82). Compose: cart_back -> Tupi -> cargo -> cart_front -> wheels.
 *   seat       Tupi's seat anchor (bottom of her bottom) in the Tupi frame
 *   trunkTip   tip of the trunk in tupi_spray (emit the sprinkle fountain here, direction up-forward ~ -70 deg)
 *   trunkHold  where the held treat goes in tupi_hand (bottom-centre of the treat)
 *   mouth      mouth centre; box = union of all seated frames' opaque pixels [x0, y0, x1, y1] (Tupi frame)
 *   cart.ground  wheel contact point; cart.seat where Tupi's seat anchor goes; cart.wheels [cx, cy, r] (wheel.svg is
 *              80x80 with r 38 -> scale r / 38, its centre (40, 40) on [cx, cy]); cart.tray bottom-centre of the cargo
 *              (the tray front lip in cart_front covers the bottom ~8 units); cart.box = the composed Tupi + cart + wheels
 *              (idle frame) bounding box in CART coords (y0 < 0: Tupi's hat rises above the cart viewBox). */
(function (BD) {
  'use strict';
  BD.TUPI_POINTS = { seat: [150, 250], trunkTip: [274, 58], trunkHold: [282, 176],
    mouth: [196, 162], box: [45, 4, 298, 255],
    cart: { ground: [170, 232], seat: [200, 168],
      wheels: [[92, 194, 38], [262, 194, 38]], tray: [86, 138],
      box: [0, -74, 338, 232] } };
})(typeof window !== 'undefined' ? (window.BD = window.BD || {}) : (globalThis.BD = globalThis.BD || {}));
