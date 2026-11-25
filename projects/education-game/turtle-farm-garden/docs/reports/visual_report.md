# Visual QA report — Tumi's Flower Farm (2026-11-25)

Report-only: nothing in `game/` was edited. Coordinates are CSS px on the screenshot viewport.

**What was run**
- `node tests/visual/screens.js` → `docs/reports/visual/*.jpg` (4 viewports × en/vi × 16 screens, no console errors).
- `tests/visual/qa_full.js` (ip-p, ip-l, pad-p, pad-l × en/vi: every topic at ages 3–7, all 4 seasons, pause, Talk ×2,
  rack, walk home, done, plus a geometry probe). It still works as written.
- `tests/visual/qa_layout_probe.js` still works.
- New report-only helper `tests/visual/qa_detail.js`: dpr-3 close-ups of Tumi and the can at rest, carrots, an 8-frame
  rosette hop strip, the finish butterflies, an animal walking home, the butterfly surprise, and room for the hay bale per
  choice count.
- Contrast was computed with WCAG luminance ratios. Colour-blind checks use the Machado deuteranopia/protanopia simulation
  and CIELAB ΔE. Background colours were sampled from the screenshots.

Viewports: ip-p 393×852 (insets 59/0/34/0), ip-l 852×393 (0/59/21/59), pad-p 820×1180 (24/0/20/0), pad-l 1180×820 (24/0/20/0).

---

## P1 (fix before release)

**P1-1 · Vietnamese title on iPhone landscape pushes Play to the bottom edge and hides the stars/age pill** (`ip-l-vi-01-title.jpg`)
- In VI the logo is two big lines: `logo1` 235,76 → 617,153 and `logo2` 150,153 → 730,230, each 77 px tall. In EN the
  whole logo is one 36 px line at y 97–133.
- `btnPlay` is at y 281–391, but the viewport is 393 tall with a 21 px home-indicator inset, so the safe bottom is 372.
  The bottom 19 px of the Play button sit in the home-indicator area.
- `titleStars` and `titleAge` are at y 408–429, which is **off screen**.
- The logo is drawn over Tumi's hat and over the rosettes on the title fence (x ≈ 700–770). The tagline (y 244–276)
  covers Tumi's eye.
- Fix: in landscape use the EN layout for VI too: one logo line, "Rùa Tumi · Nông Trại Hoa", with
  `font-size: min(…, 9vh)`. Or clamp the logo block to about 0.30·H and lay out Play and the pill from the bottom safe
  edge (`bottom: calc(var(--sa-b) + 12px)`). Re-check at 667×375 too: `se-l vi` has Play at 206–318 and the pill at
  334–355, which fits, but only just.

## P2 (should fix)

**P2-1 · Shape signs for square, rect, circle and oval are blank wooden boards** (`ip-p-en-06-trace-shapes.jpg`, `docs/art/farm_signs.png`)
- After the circle was picked, the other choice at (196, 755) is a plain square board with nothing painted on it.
- A 3-year-old reads that as "an empty sign", not as "the square". The circle sign also looks the same as the round size
  sign, and the square sign looks the same as the "glyph plain" board.
- Fix: paint the shape on the board as a thick inset stroke, `#5A3A28`, 6 px at 116 px size, about 70 % of the board,
  or fill it with a flat cream-on-wood shape. Keep the cut-out silhouette as well. Triangle, star, heart and diamond read
  fine.

**P2-2 · Carrots are tiny and grow out of the wooden sign instead of the soil** (`ip-p-en-10-chips.jpg`, `det-*-carrots.png`)
- `chip.r` is 15 picture px. On screen that is a radius of 8.8 px on ip-p and 9.4 px on ip-l, so each carrot is about
  18 px tall.
- The tap spots fall on the numeral board, which is "lying on the bed", so the carrots stand on wood and overlap the
  flower row of the "2".
- Fix: make `r` at least 26 picture px. Put the chip spots on the soil around the board, for example a row under it,
  where `chipSpot` avoids the `ck.icingBox`. Draw a soil mound under each carrot.

**P2-3 · Petals are drawn over the walking animal** (`det-pad-l-walk1.png`, `ip-l-en-11-walkhome.jpg`)
- Petals that have landed on the pebble path are drawn on top of the walker. On the sheep, the blue and purple petals
  cover its face and eye.
- Because the petals use all 7 answer colours, the path also looks like bakery sprinkles.
- Fix: draw the landed petals before `walker`, or fade a petal within about 30 px of the walker. Tint the petals with
  the row colour, plus a white or pale-pink accent.

**P2-4 · Watering can at rest sinks into the bed rail on iPhone portrait** (`det-ip-p-tumi-rest.png`, `ip-p-*-04-pick.jpg`)
- Tumi stands on the bed rim with the bed top at y 392. The can body reaches y ≈ 407, which is about 15 px into the
  rail plank and touches the soil edge. Only the spout tip is clamped (`lim = T.y − frame − 6`), not the can body.
- On ip-l, pad-p and pad-l (Tumi on the grass) the can sits on the grass by Tumi's feet and looks fine: it does not float
  and does not sink.
- Fix: in `_bagPose` (rest, `mochi.up`) clamp the lowest point of the can body as well (about `ty + 0.15·ts` for the
  rest angle) to `lim`. Or rotate the can about 20° more upright so it hangs beside the flipper. Draw the can after the
  rail so it sits on top of it.

**P2-5 · The butterfly surprise flies over the choice column on iPhone landscape** (`ip-l-en-13-bird.jpg`)
- The butterfly, at about (695, 117) with r ≈ 35, overlaps the top animal sign (the rabbit, centre ≈ (713, 100),
  hitR 41).
- A child tapping the rabbit may hit the butterfly, or the reverse. Two touchable things are stacked on each other.
- Fix: in landscape with a choice column, limit the butterfly's flight lane to `x < choices.x − hitR − 20`, or turn it
  back before the column. The same lane is fine on ip-p (y ≈ 282, between the bubble and the fence).

**P2-6 · The chick in the hay never appears in portrait with 4+ choices (iPhone) or 3+ choices (iPad)**
- `computeLayout(…,{n, sack:true})` gives no sack room for these counts:

  | Viewport | n = 2 | n = 3 | n = 4 | n = 5 |
  |---|---|---|---|---|
  | ip-p | ✓ | ✓ | ✗ | ✗ |
  | pad-p | ✓ | ✗ | ✗ | ✗ |
  | ip-l | ✓ | ✓ | ✓ | ✓ |
  | pad-l | ✓ | ✓ | ✓ | ✗ |

- When there is no room, the round silently switches to the butterfly (`ip-p-*-13-mouse.jpg` and `pad-p-*-13-mouse.jpg`
  show no hay bale). iPad portrait, the main tablet orientation, almost never shows the chick.
- Fix: in portrait, put the hay bale on the meadow left of Tumi or right of the fence (pad-p has lots of empty meadow
  between y 860 and y 1000), so it does not compete with the choice row.

## P3 (polish)

**P3-1 · Brown beads around the round patch look like trace dots** (`ip-p-*-05-trace-colors.jpg`, `ip-p-en-06-season*.jpg`)
- The raked round patch has a ring of brown beads around its edge. Next to the cream guide dots it reads as a second
  dotted path ("follow the dots").
- Fix: draw the patch edge as a soft raised soil lip, a solid ring `#7A5238` with a highlight, not separate beads.

**P3-2 · Purple flowers have almost no luminance contrast on the raked patch** (`qa ip-p-en-07-a3-colors`)
- Purple `#8E44AD` against the patch `#8A5E40` is 1.05:1. Against the soil `#664330` it is 1.49:1.
- The row only reads because of the dark furrow (`#4A2F1F`, 2.08:1) and the light flower centre.
- Red (1.47:1) and blue (1.64:1) on the patch are also weak.
- Fix: give each flower a 1.5 px light-tone rim (`#D2BDF3` for purple, 3.28:1), or draw the petals' upper-left
  highlight with the light tone.

**P3-3 · Colour-blind safety at ages 5 and up**
- Below age 5 the `SAFE` sets avoid confusable pairs. At 5+, `COLORS5` can show red and green together
  (deuteranopia ΔE 14.3), or yellow and orange (ΔE 12.5; protanopia ΔE 19.9).
- Every packet shows the same flower, so these pairs differ only by colour.
- Fix: give each colour its own flower shape on the packet (for example red tulip, green clover, yellow sunflower, orange
  marigold, blue forget-me-not, purple violet, pink cherry blossom). Or put a small pattern in the colour band.

**P3-4 · Green answers blend into the leaves and the meadow**
- Green flowers (`#4CC26B`) against the stems and leaves (`#5FA046`) are ΔE 18. A green flower is about 1.10:1 against
  the meadow.
- Under deuteranopia, green against the summer meadow is ΔE 5.1: nearly invisible if a green row, butterfly or rosette is
  drawn over grass.
- The packets themselves are fine because they are cream paper.

**P3-5 · The finish butterflies are too small to see** (`det-*-finish.png`)
- The 2–3 butterflies are about 8–10 px. They are drawn in the row colour, so on a red bed with red flowers they
  disappear.
- Fix: draw them at 22–28 px, in white or a pale tint of the row colour with a dark outline.

**P3-6 · Rosette mini-pictures read as brown cookies** (`*-15-done.jpg`, the fence rosettes)
- On colour-round rosettes the centre disc shows a dark-brown patch with a thin squiggle. At 30–45 px this looks like a
  chocolate cookie, a bakery leftover feeling.
- Fix: draw the rosette centre with the bloomed flowers only, 2–3 big flowers in the row colour on a cream or
  light-soil disc, with no dark soil.

**P3-7 · Rosette hop size** (`det-*-hop0..7.jpg`)
- The rosette grows in the bed to about 110 px wide on ip-p and about 190 px on pad-l. It squashes and bounces 4 times,
  then flies and shrinks into a fence slot of about 28–45 px.
- The motion reads well. The one issue is pad-l, where the flight passes through the speech-bubble area, at about
  (448, 326) when t = 0.72. The bubble is faded at that moment, so it is acceptable.
- Optional: start the shrink earlier so it is about 70 % of its size when it crosses the fence top.

**P3-8 · The bubble font goes down to 13 px for long VI prompts in landscape** (`ip-l-vi-04-pick.jpg`, `ip-l-vi-12-rack.jpg`)
- The bubble is 306 × 67 and the VI text takes 3–4 lines. On ip-p VI the pick prompt also goes to 3 lines at about
  13–14 px (`ip-p-vi-04-pick.jpg`).
- Fix: shorten the VI `p.colors` lines. For example "Bé chạm gói hạt màu xanh dương nhé!" instead of the 2-sentence
  version.

**P3-9 · Talk-time VI button and labels wrap** (`ip-p-vi-14-talk.jpg`)
- The mic button "Bé chạm hoặc nói đáp án nhé!" takes 2 lines on ip-p. "hình ngôi sao" and "hình bầu dục" wrap inside
  the cards.
- They are readable. Optional: use "Chạm hoặc nói nhé!" and drop "hình" from the card labels.

**P3-10 · Carrots in the Talk counting icon are too small to count** (`ip-p-en-14-talk2.jpg`)
- 7 carrots in a 150 px patch, about 10 px each.
- Fix: for n ≥ 6, draw them bigger in 2 rows, or use dots.

**P3-11 · iPad portrait composition**
- Tumi sits at the bottom left (centre about (86, 1022)), far from the bed (y 322–850). A short fence floats in the
  meadow between the bed and the choices.
- It works, but Tumi "pours" from about 170 px away from the bed. Consider placing Tumi on the bed's top-left corner as
  on ip-p.

**P3-12 · Stacked choice column on iPhone landscape**
- With 4 signs, each sign's stake disappears behind the next board, so the column looks like a totem pole
  (`ip-l-en-13-bird.jpg`).
- Visual hit size there is 64 px (hitR 41 → 82 px), which is OK for touch. Shorten the stakes in column mode.

**P3-13 · Tumi's hit box overlaps the bed** (geometry probe)
- `mochi ∩ tray` is 1216 px² on ip-p: Tumi's box (17, 268, 101 × 136) overlaps the bed's top-left corner. On ip-l it is
  149 px².
- No trace path starts there in the sampled rounds. Consider trimming the hit box to the body.

## Checked and fine
- **Seasons:** spring blossom, summer sun and sunflowers, autumn amber with pumpkins and leaves, winter snow with a
  snowman. The meadow under the bed stays readable in winter (`#E6EDEC` / `#D1DED8`, green tufts showing). All packets
  are distinct on every meadow.
- **Safe areas:** no choice, bubble, HUD or bed is inside the notch or home-indicator insets in any probed screen.
- **HUD and bubble:** neither ever covers a choice, the bed or the fence (qa_full geometry, 4 viewports × 2 languages).
- **Bubble text:** never overflows.
- **Can under the finger:** the spout tip is under the finger (dx/dy ≈ 0.27 px).
- **Tumi's palette:** sage skin `#B9CC93`, caramel shell, straw hat. It never uses an answer colour, and answer green
  is ΔE 37.7 from the skin.
- **Animals walking home:** the leg cycle, facing right, and the pebble path with stones and tufts read well (apart from
  P2-3). The butterfly surprise (lilac with cream spots) reads on both the sky and the soil.
- **Settings, pause and done:** they lay out cleanly on all 4 viewports in both languages. The done gallery fits 16
  rosettes.
- **Bakery leftovers:** no visible text mentions cookies, icing or a kitchen. Internal names only appear in code
  comments and keys, as intended. The only bakery feel left is visual: the multicolour sprinkle-like petals (P2-3) and the
  cookie-like rosette centres (P3-6).
