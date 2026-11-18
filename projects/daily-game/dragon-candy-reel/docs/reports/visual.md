# Visual QA: Taffy's Candy Reel (2026-11-18)

Art director pass, report only. Capture script: `tests/visual/vqa.js` (run `NODE_PATH=$(npm root -g) node tests/visual/vqa.js`).
It serves `game/` over a local http server because on `file://` the canvas is tainted and the Score Card cannot be made.
Raw PNGs (127) go to `tests/out/vqa/` (gitignored). Small JPEG boards, 1.9 MB in total, are in `docs/reports/visual/`:

| Board | What it shows |
|---|---|
| `screens_d960.jpg`, `screens_p390.jpg`, `screens_l844.jpg` | title, how-to, settings, customise, start banner, play, pause, game over, Score Card |
| `play_d960.jpg`, `play_p390.jpg`, `play_l844.jpg` | the 4 weather levels in play, golden reel meter, windsock right / gust warning left / windsock left, custom pictures |
| `sheet_sink_rise`, `sheet_gust_sway`, `sheet_catch`, `sheet_escape`, `sheet_snap`, `sheet_levelup` | motion contact sheets (960×540, frozen time, fixed steps) |
| `cb_level0..3.jpg`, `cb_items_zoom.png` | normal / deuteranopia / protanopia (Machado 2009, severity 1) |
| `phone_levels_lineup.jpg` | one of each item in all 4 levels at 390×844 |
| `p390_safe_play.jpg`, `l844_safe_play.jpg` | simulated iPhone notch and home-bar insets (47/34 px portrait, 47/21 px landscape) |
| `d960_title.jpg`, `d960_over.jpg`, `d960_custom_play.jpg`, `l844_reel_gold.jpg` | full-size evidence for single items |

No console errors appeared in any run.

## What already works
- The snowflakes read well against the water at every size and in every level. The white sugar rim, the coloured glow and the bubble rim keep them clear even at 28 css px on a 390 px phone. In Sugar Snow the glow makes them read best of all.
- The windsock moves the way a real one would. It hangs limp in calm air, swings down through vertical (it never flips over the top), stretches and flutters more in strong wind, and points clearly both ways. The line bows downwind, more with depth.
- Sink and rise ease nicely. The bobber accelerates and settles, and the line goes taut while you hold.
- The snap is cute, not scary: the gummy puffs up, the loose line curls, and puffs and bubbles burst out.
- The style is consistent. Taffy, the jar, the spools, the windsock and the four scenes all share one outline weight and palette. Snow is clearly a different scene. Score Card, Settings, How-to and Pause fit inside the panels at all 3 viewports with no clipped text.

## P1: must fix

1. **In portrait on a notched iPhone, the HUD covers the jar and the windsock** (`p390_safe_play.jpg`).
   - What happens: with a 47 px top inset the HUD drops about 100 logical px, but the scene stays where it was (`surfaceY = 150`, world.js layout).
   - The score/lines plate (render.js:635-638, x0 = 12, plate 120×76·K) now sits on the candy jar (`holeX − 150 = 130`, render.js:368).
   - The pause button covers the windsock pole (sock at x 430, render.js:378; buttons from x ≈ 417, `_hudBtn.l`).
   - The level pill (render.js:683-686) lands on the wafer deck.
   - Why P1: the windsock is the cue for the day's twist, and the iPhone is the target device.
   - Fix: in portrait, push the whole scene down by the top inset. Pass `ins.top` to `world.setLayout(W, H, topInset)` so that `surfaceY = 150 + round(ins.top)`, `waterTop = surfaceY + 40`, and so on. Then, in `Renderer.background()` (render.js:124-161) and `drawScene`, `g.translate(0, ins.top)` and fill the strip above with the sky colour. That keeps the 150 px sky band below the notch for the HUD, the pill and the windsock.
   - A cheaper alternative: in portrait set `sockPos` x to `holeX + 90` (between the gap and the buttons), and in `drawJar` use `x = holeX − 100` when `VW < VH`. That moves the jar right of the plate and the sock left of the buttons.

## P2: should fix

2. **Lime, gold and the sour gummy look the same to colour-blind players. Berry turns grey** (`cb_items_zoom.png`).
   - Under deuteranopia: lime `#8fe34a` (render.js:24) shows as `#e0cb57`, gold `#ffd84a` as `#f8e052`, gummy orange as `#d1bb3c`. All three are mustard yellow.
   - Berry `#ff6fa8` shows as `#acaba5`, a grey that almost vanishes inside the bubble on sunny water. Grape stays distinct (it turns blue).
   - Shapes help (fern arms against the ornate gold), but at 40 px they are both "busy" flakes.
   - Fix (colour cannot separate all 4, so add a second cue):
     - In `drawFlake` (render.js:480-501), draw value pips under each drifting flake: berry 1, lime 2, grape 3 white dots of r = 2.5 px with a 1 px `#16305a` stroke, at y + s·0.62. For gold, draw a 4-point star instead.
     - Draw the glow ring as a solid 2.5 px stroke of `col` at r = s·0.62 in addition to the gradient. This also fixes item 6.
     - Darken the berry art outline to about `#b0306a` so the grey version keeps its contrast.

3. **On the reel meter, the gold Perfect segment is hard to tell from the green zone for colour-blind players** (render.js:566-568).
   - Under deuteranopia, `#53d88a` shows as `#c6bb8f` and `#ffd84a` as `#f8e052`. The two are similar in lightness and both lie on the same 16 px arc.
   - Fix: draw the Perfect arc 22 px wide (it is 16 now), and add 2 px white ticks at `ang(p0)` and `ang(p1)` from R−11 to R+11.

4. **Floating texts land on the reel plate and on each other.**
   - `'Golden snowflake!'` / `'Hooked!'` are drawn centred on the hook at `it.y − 50` (render.js:196). The text is about 220 px wide and the plate's left edge is only at `hookX + 140 − 80 = hookX + 60`. At 844×390 it covers the plate's "Reel" label (`l844_reel_gold.jpg`).
     - Fix: use the same side logic as `reelGood`: `x = reelPos(w)[0] > it.x ? it.x − 40 : it.x + 40` with `textAlign` right or left.
   - On an escape, `'Oops!'` (render.js:207, at `hk.y − 20`, x ± 70) and `'It floated away!'` (render.js:208, at `it.y − 50`) stack on the same spot (`sheet_escape.jpg`).
     - Fix: skip the third slip's `'Oops!'` when it causes the escape, or drop `texts` with |dy| < 30 when the new text is pushed.

5. **The "+20" covers the catch arc.**
   - The score text goes to `(holeX − 64, surfaceY − 118)` (render.js:211). That is right at the apex of the 150 px arc (world.js:766-769, `jarDX −150`). The flake passes under the text, and the jar landing is never the focus (`sheet_catch.jpg`).
   - Fix: spawn the text when the flake lands, above the jar at `(holeX − 150, surfaceY − 70)`. Either delay it 0.75 s (`catchFly`) by pushing it from the item's removal, or keep it but at the jar. Also lower the arc a little (`− sin(πk)·110`) so it clears Taffy's head without leaving the sky band.

6. **Custom pictures: the snowflake values can't be read and the gap shows a turquoise patch** (`d960_custom_play.jpg`).
   - With a custom snowflake, all four types are the same photo sticker. The only cue is the soft glow at alpha 0.49 (render.js:484), which washes out on a busy photo.
     - Fix: the solid ring plus pips from item 2, and a 0.25 white disc behind the sticker.
   - render.js:149-151 always paints the `#a6ecef → #8fe3e0` gradient through the dock gap, even over a custom background photo. You get a mint rectangle 68×34 px under the gap.
     - Fix: wrap it in `if (!cust)`.
   - A busy custom photo also lowers item contrast in the water.
     - Fix: when `cust`, fill `rgba(20,60,90,.18)` from `waterTop` to `VH` in `background()`.

7. **Sunny, Rain and Windy look nearly the same in portrait** (`phone_levels_lineup.jpg`).
   - On 390×844 the sky band is 150 of 1212 logical px (12 %). The water palettes are close: sunny `#8fe3e0 → #2f9bb5`, wind `#86dcd6 → #2a8aa6` (DESIGN §4.2), and rain is only slightly greyer. Rain sprinkles are about 10 px and sparse, and I saw no ripple rings at 960 (`d960_level1_play.png`).
   - Fix:
     - Rain water: `#9fbcc4 → #2f5873`, with a soft grey veil.
     - Wind: add 2–3 faint horizontal current streaks under water (weather.js, `layer: 'back'`, alpha 0.25, moving with `wind`).
     - Rain: let sprinkles keep falling 30–60 px into the water and fade, raise the sprinkle size to 14–16 px, about double the count, and make `ring` ripples size 26 and alpha 0.7.

8. **Reef lollipops compete with the deep (grape) band.**
   - Outside x 320–640 the reef's lilac and purple swirl lollipops reach up to about y 350 (`levels/*/reef.svg`). The whole deep band (394–484) runs through them. In Sugar Snow a grape flake beside a lilac lollipop is the same hue (`d960_level3_play.png`).
   - This breaks DESIGN §3 ("no saturated purple in the play band").
   - Fix: recolour the reef lollipops to blue and teal, or desaturate them to about 40 % alpha. Alternatively cap the reef's lollipop stems at about 60 px across the full width, not only at x 320–640.

9. **On the title screen the logo sits on top of in-game Taffy and the windsock, and the title icon repeats Taffy right beside him** (`d960_title.jpg`; at 844×390 the logo crosses Taffy's body).
   - Fix: in `draw()` (render.js:286-290), when `mode === 'title'`, skip `drawTaffy`, `drawJar` and `drawWindsock`, or draw Taffy at `holeX + 250` on the title. Or move `.title-wrap` down (style.css:162 `margin-top: calc(var(--u)*-4)` → `calc(var(--u)*4)`) so the logo sits in the water.

10. **On the game-over screen the "NEW!" badge sticks out of the panel** (`d960_over.jpg`; also visible behind the Score Card modal on phone).
    - Cause: style.css:193 `.new-best{right:calc(var(--u)*-5.6);top:calc(var(--u)*-1.6)}` pushes it 5.6 u right of the score box. At 960 and 844 it crosses the score box edge and touches the panel border.
    - Fix: `right: 0; top: calc(var(--u)*-2.2)` (sitting on the number's top-right corner), or put it inline after `#overBest`.

11. **The start banner covers the play band in portrait.**
    - The level banner's 520×88 box at `VH·0.74` (render.js:694-696) spans almost the whole 560-px width, right through the hook column, for 2.6 s.
    - Fix: in portrait use `cy = waterTop + 70` (the top of the water, where the bobber starts) and w = `VW − 40`. Or shorten it to 1.6 s and fade it to 0.6 alpha whenever the hook is under it.

## P3: polish
12. Level-up has no celebration: only a crossfade and the banner (`sheet_levelup.jpg`).
    - Add a star burst from the jar, `taffy.anim = 'happy'`, and a short "Level clear!" text over the pill before the banner.
13. Line 237 of render.js puts "Whoosh! Wind!" at `sy − 62·K·1.3 − 10`. At 960 the text's top (about y 52) touches the level pill's bottom (y 56).
    - Use `Math.max(pill.y + pill.h + 14, …)`.
14. The gust-warning arrow (render.js:409-420) is a white 34 px arrow on a pale pink-white Windy sky, which is low contrast.
    - Make the fill `#ffe14d` with the existing navy stroke, and scale it ×1.3 in landscape.
15. At max depth the hint chip clamps to `VH − 40` (render.js:615) and sits on the lake bed right under the bobber.
    - Put it above the hook instead (`hy − 56`) once `hy > VH − 110`.
16. An escaping snowflake drifts sideways along the bottom for about 1 s. It does not visibly "float away".
    - Give it an upward `vy` of about −60 px/s (world escape branch, about world.js:758) to match the text.
17. In portrait the items are small for a 6-year-old: 40 logical px is 28 css px at 390.
    - In portrait, multiply `FLAKE/BUBBLE/GUM` by 1.15 (render.js:22) and the hit radius to match.
18. A custom gummy (any picture) gives no hint that it is a hazard.
    - Keep a thin orange `#ff9a3c` 3 px outline ring around custom gummies so "sour = orange" survives.
19. Not verified: real-device safe areas (simulated here with CSS insets), and how fast the sky drift looks on a 120 Hz iPad.

## Fixes applied (fix engineer, 2026-11-18)
Evidence: `visual/fixes_landscape.jpg` shows 960×540 rain, windy, the gold reel, the "+20" landing, the gust warning and game over. `visual/fixes_portrait_notch.jpg` shows 390×844 @3 with a simulated 47/34 px notch inset: sunny, rain, the reel and the level banner.
- **#1 (P1) fixed.** In portrait the whole scene moves down by the top safe inset:
  - `world.setLayout(W, H, top)` gives `surfaceY = 150 + top` and `waterTop = 190 + top`.
  - The renderer draws the sky tile, water, dock and gap from `top` and fills the strip under the notch with the sky's top colour.
  - Weather keeps floss and wrappers inside the moved sky band.
  - The plate, pause button and level pill no longer cover the jar, windsock or deck.
- **#2 fixed.** Each drifting or hooked flake now has a solid 2.5 px ring in its value colour and value pips under it: berry 1, lime 2, grape 3, and a 4-point star for gold. The berry flake outline is darker and thicker (`berryDeep #8a1f50`, in `tools/art-characters/gen.js`, regenerated). Because `icon.svg` changed, the mobile icons were re-rendered.
- **#3 fixed.** The Perfect segment is 22 px wide with white end ticks.
- **#4 fixed.**
  - "Hooked!" and "Golden snowflake!" sit beside the hook, on the side away from the reel meter.
  - `say()` drops an older text sitting on the same spot.
  - An escape removes the "Oops!" it caused.
- **#5 fixed.** "+N" (and the jar pop and sparkles) appear over the jar when the flake lands, after `catchFly`. The flight arc is lower (`CONFIG.catchArc` 110).
- **#6 fixed.** Custom flakes keep their rings and pips and get a white disc behind them. There is no gap gradient over a custom background, and a busy photo gets an `rgba(20,60,90,.18)` water tint.
- **#7 fixed.**
  - Water palettes: rain is now grey slate `#9fbcc4 → #2f5873` with a grey veil, and windy is mint-green `#a4f0cf → #1f7a80`. The gap colours match.
  - The windy level has faint current streaks under the water that move with the wind.
  - Rain has 80 sprinkles (was 56). Near ones are 15–20 px, dive 30–60 px into the water and fade, and ring the surface as they cross it. Rings are bigger and longer-lived, and there can be up to 22 at once.
  - All four levels are now clearly distinct in portrait. Remaining gap: the rings are still subtle at 960, because the water line sits right under the dock front.
- **#8 fixed.** Reef lollipops are now teal, blue, mint and lime, with no purple or pink. The purple and pink gumdrops became blue and mint, and the purple pebbles became lime. Regenerated with `node tools/art-environment/gen.js`.
- **#9 fixed.** On the title, in-game Taffy, the jar, the windsock, the line and the hooked flakes are not drawn. The logo and the Taffy icon are the only Taffy.
- **#10 fixed.** NEW! now sits inline between the "Best" label and the number, inside the panel.
- **#11 fixed.** In portrait the banner sits at the water top (`waterTop + 92`), and it fades to 0.55 alpha while the hook is behind it.
- **#12 fixed.** On a level clear: stars burst from the jar, Taffy does two happy hops, and "Level clear!" shows under the pill (under the deck in portrait). The banner then follows 0.7 s later.
- **#13 fixed.** "Whoosh! Wind!" is kept below the level pill.
- **#14 fixed.** The gust arrow is yellow `#ffe14d` with a dark navy outline, its streaks have dark edges, and it is ×1.3 in landscape.
- **#15 fixed.** At max depth the hint chip moves above the hook.
- **#16 fixed.** An escaping flake starts at a stronger upward speed (−80 to −100 px/s) with more buoyancy, and less sideways drift.
- **#17 fixed.** In portrait, snowflakes and gummies are ×1.15, and the world's hit radii match (`layout.itemK`, `CONFIG.portraitItems`).
- **#18 fixed.** A custom gummy keeps an orange `#ff9a3c` 3 px ring.
- **#19 not done.** It needs a real device.
