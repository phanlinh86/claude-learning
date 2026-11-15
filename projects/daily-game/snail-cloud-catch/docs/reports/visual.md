# Visual QA / art direction: Shelly's Sky Catch (2026-11-15)

Report only: nothing in `game/` or `tools/` was changed.

**How the screenshots were made**
- `node tests/visual/capture.js` saved desktop screens, zones, crossfades, bursts, lineups and custom pictures to `tests/out/visual/`.
- `node tests/visual/mobile_capture.js` saved mobile screens to `tests/out/visual_mobile/`. It now also covers 390×844, 844×390 and 1024×768, next to the iPhone, SE, iPad and iPad Pro sizes it already had.
- `node tests/visual/extra_capture.js` is new. It saves longer zap, catch-popup and miss sheets, the gust telegraph, the basket in each of the 4 frames facing left and right, and frozen phone/iPad frames.
- `node tests/visual/mock_portrait_fix.js` is new. It monkey-patches the renderer in the page only, to show BEFORE and AFTER for the portrait cloud-bank fix.
- `tests/visual/montage.py` is a small PIL helper. Contact sheets are in `tests/out/visual/zoom/`.

All runs: **no console errors**.

**What already looks good**
- Art style is consistent across the four weathers.
- Shelly mirrors cleanly, and the basket sits on the shell in all 4 frames facing both ways (`extra_basket_frames.png`).
- Catch sequence works: the star sinks behind `basket_front`, then the ring, sparks and "+10" pop behind her back (`extra_catch_popup.png`).
- The zap reads as fizzy, not scary (`extra_zap_long.png`).
- The miss bounce and fade with "Streak lost" works (`extra_miss.png`).
- Gold stars are distinct by size and halo in greyscale, deuteranopia and protanopia (`lineup_zone*_grey|deut|prot.png`).
- The level banner and crossfade look good on desktop.
- Custom hero, star sticker and backgrounds work on desktop.

---

## P1: fix before shipping

### P1-1 Portrait / 4:3: the cloud bank shows as a doubled white slab mid-screen, with the 🚀 button sitting on it
- **Screenshots:** `tests/out/visual_mobile/p390_zone0.png`, `iphone-p_zone*.png`, `ipad-p_zone*.png`, `ipad-l1024_zone0.png`, `ipadpro-l_zone3.png`, `tests/out/visual/extra_frozen_p390_z0.png`.
- **What's wrong:**
  - `bank()` draws a vertically mirrored copy at scene y −132 (alpha 0.9) whenever `SY > 0`.
  - Together with the real bank, this makes a ~280-logical-px band with two rows of wave lines and a flat brighter strip where the two copies overlap. It reads as a wall, not a cloud.
  - The 🚀 button (`y = SY − B − 46`) lands right on the band.
  - The same thing happens on 4:3 iPads in landscape (SY = 180).
- **Fix:** mock-up in `tests/out/visual/mock_portrait_{before,after}_{p390,ipadp}_z{0,1,3}.png`. AFTER clearly reads as one floating cloud shelf.
  1. `game/js/render.js:367`: remove the mirrored `tiled(..., -132, ..., true)` call. Replace it, only when `SY > 0`, with a puffy shelf top drawn in the bank's own top colour:
     - Big puffs: circles every 60 px across `[-SX-40, VW-SX+40]`, r = 34 / 41 / 48 cycling, centred at `y = 30 − 0.35r`, colour `c0`.
     - Small highlight puffs: circles offset 30 px, r = 16 / 22, centred at `y = 20 − 0.6r`, colour `c1` at alpha 0.7.
     - A filler rect at y 20–50 in `c0`.
     - Scroll everything with `_bankOff % 120`.
     - Colours (c0 / c1): sunny `#f4f9ff` / `#ffffff`, rain `#d9d8ea` / `#ecebf6`, wind `#fbe9e2` / `#fff6f0`, snow `#dfe2f6` / `#f4f5ff`. Better: add a `bankTop` key to `zones/palette.json`.
     - The exact code is in `mock_portrait_fix.js` (`PATCH`).
  2. `game/js/render.js:97`: lift the sky 🚀 clear of the new shelf top (about scene y −44):
     `y: Math.max(I.top + 150, this.SY - B - 44 - 24)` → i.e. `this.SY - B - 68`.

### P1-2 Portrait: the level banner is clipped by the narrow width and hidden behind the 🚀 button
- **Screenshot:** `tests/out/visual_mobile/iphone-p_crossfade.png` ("Level 2: Rainy Cloud[s!]" and the hint are cut off; the button covers the right end).
- **What's wrong:**
  - The banner is 640 scene px wide around x 480, but only 560 px are visible.
  - Its y (`-min(SY*0.5, 260)` + 104…214) is the same band as the 🚀 button.
- **Fix:** `game/js/render.js:780`.
  - Translate y: `this.SY >= 150 ? -Math.round(this.SY * 0.5) - 140 : 40` (in the upper sky, under the HUD).
  - After the translate, add `const k = Math.min(1, (this.VW - 32) / 660); g.translate(W/2, 160); g.scale(k, k); g.translate(-W/2, -160);`.
  - The hint (20 px) may still be wider than 560. Cap it with `g.font` measuring, or drop to 17 px when `k < 1`.

### P1-3 Snow (and partly wind): thunder puffs nearly disappear into the sky
- **Screenshots:** `lineup_zone3_normal.png`, `lineup_zone3_grey.png`, `extra_frozen_p390_z3.png`.
- **Measured contrast** (puff body vs sky right next to it, WCAG ratio):

  | Zone | Upper sky | Play band |
  |---|---|---|
  | snow | 1.02 : 1 | 1.63 : 1 |
  | wind | 2.77 : 1 | 4.1 : 1 |
  | rain | 3.9 : 1 | 4.4 : 1 |
  | sunny | 9.1 : 1 | 3.5 : 1 |

- **Why it matters:** the puff is the only hazard, so it must read at a glance.
- **Fix:** `game/js/render.js:557`. In the `else` (puff) branch, before `g.rotate`, draw a soft light back-glow:
  `const ga = g.globalAlpha; g.globalAlpha = ga * 0.55; g.fillStyle = this.glow('rgba(255,255,255,0.6)'); g.save(); g.scale(30, 26); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); g.globalAlpha = ga;`
- **Optional asset tweak** (thunder.svg, art tool): lighten the snow-night puff by adding a 2.5 px `#e6e8ff` outer rim. Target: ≥ 3 : 1 against `#786cad`.

---

## P2: should fix

### P2-1 iPhone landscape (844×390): Change Pictures buttons overflow their cards
- **Screenshot:** `tests/out/visual/screen_custom_iphone.png`; zoom in `zoom/custom_iphone.png`. "Reset" is cut off ("Rese") and sits under the next card's "Choose…".
- **Fix:** `game/css/style.css:235`. Inside that `@media (max-height:430px)` block, add:
  `.slot{min-width:0} .slot .btns{max-width:100%;flex-wrap:nowrap} .slot .btn{padding-left:8px;padding-right:8px;min-width:0} .slot:nth-child(n+4) .btn{font-size:13px}`

### P2-2 iPad portrait title: white tagline on the white cloud bank
- **Screenshot:** `zoom/ipadp_title.png`, from `visual_mobile/ipad-p_title.png`.
- **Fix:** `game/css/style.css:164`. Give `.tagline` a pill: `display:inline-block;background:rgba(40,70,120,.42);padding:.2em .9em;border-radius:99px`.

### P2-3 Narrow portrait (SE 375×667) in wind: the windsock pill overlaps the streak pill
- **Screenshot:** `zoom/hud_se.png`, from `visual_mobile/se-p_zone2.png` (streak pill right edge vs windsock at `jx-64`).
- **Fix:** `game/js/render.js:743`. When `second` is true and `jx - 64 < cx + 98`, draw the windsock under the jar pill at `(jx + 70, jy + 76)` instead of to its left.

### P2-4 Shelly's floor shadow is hidden under the cloud floor
- **Screenshot:** `zoom/jet0.png` (burst_jet frame 0); the shadow is almost invisible in every frame.
- **What's wrong:** the shadow is drawn at y 494 inside `drawShelly`, before `ground()`. The floor art, whose top edge is at about 468–500, paints over it. Jet Hop loses its height cue.
- **Fix:**
  - Move the two shadow lines (`game/js/render.js:601-602`) into a `drawShadow()` that runs right after `game/js/render.js:455` (after the ground).
  - Draw it at `y = 486`, `rgba(60,60,120, 0.22*sk)`, radii `34*sk × 7*sk`. The scale `sk` stays `clamp(1 − hop/220, 0.45, 1)`.

### P2-5 Peek telegraph is small and low-contrast on the white bank
- **Screenshot:** `burst_peek.png`. Yellow on white, about 20 px; the puff peek is a faint grey blob.
- **Why it matters:** this is the main "where will it fall" cue for kids.
- **Fix:**
  - `game/js/render.js:507`: `r = (14 + 22*k)`.
  - `game/js/render.js:516`: `s = (18 + 18*k)`.
  - Before the glow, add a backing disc `fillStyle='rgba(60,80,150,0.16)'`, ellipse `r*1.1 × r*0.9`, so the glow reads on white.

### P2-6 Gust telegraph and gust are hard to see in the scene
- **Screenshot:** `extra_gust.png`. During the 1.2 s warning, only the HUD windsock pulses. The streaks are white on a peach sky and barely visible even at a full gust (wind.x ≈ 96).
- **Fix:**
  - `game/js/weather.js:65` → `alpha: [0.5, 0.75]`.
  - `game/js/weather.js:66` → `alpha: [0.6, 0.9]`.
  - `game/js/weather.js:241` and `:290` → warning level `0.35` → `0.6`.
  - Optional: have the renderer tint wind streaks with `#ffffff` plus a 1 px `rgba(170,110,90,0.35)` underside so they read on peach.

### P2-7 Items are small on phones
- **Screenshot:** `extra_frozen_p390_z0.png`. A star is about 27 CSS px against Shelly's 67 px.
- **Fix:** `game/js/render.js:545` → `this.cssScale < 0.8 ? 1.35 : 1`. Hitboxes stay the same; it's visual only.

### P2-8 Custom thunder-puff picture disappears on a dark custom background
- **Screenshot:** `custom_play_zone3_1280.png` (grey rock on a night city).
- **Fix:** the halo from P1-3 solves it. For custom puffs (`d.zig`), also add a ring like the custom star's: a `rgba(255,255,255,0.8)` disc at `d.s*0.56` with a `#7a7fc0` 3 px stroke.

---

## P3: polish

1. **Jet flame is pale on pale clouds** (`burst_jet.png`). `game/js/render.js:582`: add a stop `0.45 → 'rgba(255,140,50,0.9)'` and raise the minimum alpha to `0.7 + 0.3*f`.
2. **Basket sits about 6 px towards the head.** The shell centre is at viewBox x 52 and the body centre at 60. If wanted, draw the basket with `rimX − 5*face`. Keep the catch line where it is. (`extra_basket_frames.png`)
3. **Rain castle layer looks a bit like a big thunder puff.** The far "drippy" cloud island near the top centre is grey, with drips under it (`zone1_play_1280.png`). Lighten it by about 8 % in `tools/art-environment/gen.js` (rain castle) so it can't be mistaken for one.
4. **Portrait: lots of empty sky above the bank** (`p390_zone0.png`, after P1-1). Consider a faint second cloud-island silhouette, alpha 0.25, at scene y −300, or a few slow birds or balloons. Keep it out of the 🚀 column.
5. **Portrait custom background:** only the top of the photo is used above the bank, and the play band shows its stretched bottom (`iphone-p_custom_bg_play.png`). This is acceptable. Optionally anchor the photo's vertical centre at scene y 0.

---

## Screens checked, no issues found
- Title, How to Play, Settings, Pause and Game Over with the Score Card, at 1280×720, 1920×1080, 844×390, 390×844, 393×852, 375×667, 820×1180, 1024×768, 1180×820 and 1366×1024. Apart from the items above, there's no clipping or overlap, and touch buttons are at least 44 px.
- Notch / home-bar simulations (`visual_mobile/*_notch_*.png`): the HUD respects the insets.
- Icons (`visual_mobile/icons.png`): readable at 40 px.
