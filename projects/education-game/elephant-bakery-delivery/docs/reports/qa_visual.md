# Visual QA — Tupi's Bakery Delivery (2026-11-27)

Screens: `node tests/e2e/screens.js [devices] [langs]` → `tests/out/screens/<device>-<lang>-<NN-name>.png` (CSS px, DPR 1) +
`measure-*.txt` (overlaps in logical px). 4 viewports × EN/VI × 24 scenes = 192 PNGs. Realistic safe areas are on for every shot
(iPhone portrait 59/0/34/0, landscape 0/59/21/59, iPad 24/0/20/0, set via `--sa-*` on `:root`, which also feeds `#safeProbe`);
`13-play-noinsets` is the comparison. DPR-3 close-ups were taken with a scratch script (cart cargo, delivery, party).
`tests/e2e/screens_edges.js` (river game) was deleted.

Passes: nothing is clipped by the notch or home bar. No house is under the bubble or HUD, and no house is off screen in any shot
(`houseUnderBubble/Hud/Off` are empty everywhere). The cart is never under the bubble while it waits. The VI bubble text fits in
2 lines on every viewport. The chapter banner fits in EN and VI, and so do the pause and done buttons. Roads, icing beads and
forks look clean, and Tupi's frames stay consistent. The seasons crossfade correctly (the window, the gingham tint, snow on the
roofs). There is no mirrored text: the cargo stays upright when the cart faces left.

## P1
1. **The parked cart covers the house it delivers to.** Seen in `*-20-wrong`, `*-23-deliver` and `*-24-party` on all 8
   device/language runs. `cartOverHouse` = 5 630–5 815 logical px², about 21 % of a 170-px house box. The cart front covers the
   near window and half the door wall. In portrait the hen or sheep friend squeezes between Tupi and the door
   (`scratchpad deliver.png`). Cause: `world.js` `genMap` `park = cfg.parkK * ext.half + 0.5 * S` with `parkK: 0.55`, so the cart
   stops with 0.45 × half its width inside the house. The cart's y equals the door y, so the y-sort (`render.js _game`) draws it in
   front. Fix: `parkK` ≈ 1.0 (re-run the map-fit tests; only the trunk should reach the door in the `hand` frame). Also sort the
   cart *behind* its target house on a tie (`list.sort((p,q)=>p.y-q.y || (p.k==='c')-(q.k==='c'))`).
2. **The cargo in the tray is hidden and too small to read on a phone.** Seen in `iphone-portrait-*-10-play-age4-count`, `-12-
   play-age6-add` and `-12-play-age3-size`, with close-ups `cart-count/add/animals.png`. On an iPhone the cargo is about 14–18 CSS
   px tall. The lower 30–40 % is covered by `cart_front`, so the cookie stack can't be counted and the cow is half hidden. The
   "4+3" tile renders blurry and greyish. Cause: `render.js _cart` draws the cargo at `80*k` before `cart_front`, at `C.tray`.
   Fix: raise the cargo by about 0.35 × its size (or draw it after `cart_front`, sitting on the rim), and scale it to 110·k.
   Rasterize the tile with `direct:true` or at `size*rs`, because the cache key ignores DPR.

## P2
3. **The title UI sits on top of the town.** Seen in `iphone-portrait-*-00-title` and `ipad-portrait-*-00-title`. The ▶ button
   and tagline cover the blue house, and the star/age pill sits on the red roof. `#logo2` overflows: `OFF logo2 39..405 > 393`
   on the iPhone, and on the iPad it reaches the right edge. Fix: in `render.js _titleScene`, pass `titleKeep` (the logo, ▶ and
   info rects from `measureTitle`) so `genMap` keeps the houses clear of them. In the CSS, set `.logo{max-width:92vw}` and
   `#logo2{white-space:normal}`, or cap the size with `font-size:min(…,9vw)`.
4. **The done panel hides the lit-up town.** In `iphone-portrait-*-31-done` the panel covers all 3 houses, and in `iphone-
   landscape-*-31-done` it covers the top house. Fix: pass `render.donePanel` as a keep box before `_scene`, or make the panel
   smaller or move it to the bottom on phones.
5. **The sprinkle fountain is almost invisible.** In `*-24-party` the sprinkle r is 3.4–4.7 logical px (about 2 CSS px on a
   phone) in pastels on cream. The burst also rises behind the speech bubble and wall. Fix: in `world.js`, give the sprinkles r
   8–12, add a dark outline in `HouseArt.drawSprinkle`, and aim the arc sideways or down when the house is in the top row.
6. **Portrait maps repeat.** `iphone-portrait-*-10/11-*` uses seeds 3–6 and 21–23, and all 7 rounds have the same
   2-house map. Fix: in `genMap`, vary the portrait row x and side (left or right) and the wiggle points with the seed.
7. **The VI settings toggles are cut off.** In `iphone-landscape-vi-01-settings`, "Giọng của Tupi" wraps and the toggle row is
   cut off by the Done button. Fix: in the landscape-phone media query, set `.set-grid{grid-template-columns:repeat(2,1fr)}` or
   reduce `.toggle` to 15px.
8. **The Talk choice pictures are too small.** In `iphone-landscape-*-30-talk` the home badges are about 40 px inside 90-px
   cards. Fix: in `.talk-choices button canvas`, use 100 % of the card, and set `HouseArt.drawIcon` to fill 0.94.

## P3
9. Yellow `#FFD23F` against the cream cloth `#F6ECD8` is only about 1.2:1. It reads only because of the `#C99A12` outline.
   This is fine in all 4 seasons (`11-play-colors-*`), but keep that outline at ≥ 3 px in `house_art`.
10. The window is mostly hidden behind the HUD and bubble on phones and iPad landscape, so the season shows mainly through
    the tint. Consider `wallLayout` placing the glass right of the bubble.
11. The duck sign (white) on the cream sign board is low contrast (`*-10-play-age4-animals-winter`). Give the board a soft
    tinted backing for white animals.
12. A white "active" ellipse under the house at arrival looks like a stray ring (`*-23-deliver`). Lower its alpha.
13. The VI Talk mic label wraps to 2 lines (`iphone-portrait-vi-30-talk`). This is acceptable; a shorter string would also do.
