# Visual QA / art direction — Comet's Gem Factory (2026-11-13)

Captures: `node tests/visual/capture.js` → `tests/out/visual/` (126 PNGs: menu screens at 1280×720, iPhone 844×390 @3x and iPad portrait 768×1024 @2x; every season during deal, peek, play, one card open, wrong pair, match, flyers, clear and time's up; colour-blind and greyscale versions of a 12-gem board; contact sheets `motion_*.png`; custom pictures; letterbox at 2560×900, 1180×820, 667×375 and 390×844).
Time is frozen (`setSpeed(0)`) and stepped exactly with `Game.step(1/120)`, so every frame can be reproduced.

**Overall:** the art is strong and consistent. The cream faces and teal backs read well. All 12 gems keep their own silhouette in greyscale and deuteranopia. Gizmo and Comet are appealing, and the time's-up nap is lovely. The main problems are about **layout**: Comet and pop-up text cover cards, the see-through mauve bench, flyers flying into the HUD, and the large empty bands in portrait.

## P1 — fix before release

1. **Comet covers the cards the child is reading.** Comet's sprite (84×77) is centred only 30 px above the tapped card's top edge (`world.js` `cometHoverDY: -30`), so the body and flame sit on the card above. On the top row, `cometMinY: 62` clamps it onto the tapped card itself. During the "oops" hop and the happy loop it passes right over the gem.
   *Where:* `motion_comet_oops.png` frames 2–5, `motion_wiggle.png` 2–5, `s1_iphone_7flyers.png` (Comet over the row-2 card), `box_ultrawide.png` (happy loop over a card).
   *Fix (world.js `_stepComet`, target):* hover at the **gutter corner** above and outside the card, not over it. Use `tx = card.cx < 540 ? card.x + card.w + 6 : card.x - 6; ty = card.y - 6;`, then clamp. Change `cometMinY: 62 → 96`, which also keeps Comet clear of the phone HUD (see 6). In the renderer (`render.js:452`), draw Comet at scale 0.8 while `y < FLOOR_Y && x > BOARD.x` (`g.scale(dir*0.8, 0.8)`). Change `cometOopsKick: {vx:-90, vy:-160} → {vx: 0, vy: -220}` so the hop goes straight up, away from the cards. Change `cometLoopR: 26 → 20`.

2. **The bench is see-through and muddy.** It is drawn at `globalAlpha 0.88` (`render.js:323`), so window frames, trees and the custom wall photo show through as ghost shapes behind the cards. Spring `#c9a3ae` mauve and autumn `#cfa27c` read as dusty/dirty against the teal backs.
   *Where:* `s0_iphone_2peek.png`, `s2_iphone_8clear.png`, `custom_match.png` (a giant ghost face behind the cards).
   *Fix:* make it opaque (`globalAlpha = 1`), and draw an inner panel `rr(x+10, y+10, ww-20, hh-20, 16)` filled `rgba(255,255,255,.10)` to give it depth. Bench colours in `levels/palette.json` (same lightness, warm wood family, so the cards always win): spring `#dcb9a8`, summer `#d6b27c`, autumn `#c9976c`, winter `#aeb5d8`. Keep the border `#b8936a`.

3. **On a portrait iPad / iPhone (`?` upright play), 55–65 % of the screen is empty bands.** The stage is centred (`render.js:58`, `oy = (VH-LH)*0.5`). The bottom band is a dark slate gradient (`#4f5d68 → #2f3a44`, `render.js:270`) that looks like a broken/unloaded screen to a child.
   *Where:* `scr_ipadP_*`, `s*_ipadP_*`, `scr_iphoneP_upright_play.png`, `box_tall_phoneP.png`.
   *Fix:* in `resize()`, when `this.portrait`, use `oy = (VH-LH)*0.62`. Paint the bottom band as a **continuation of the wooden floor**: gradient `#c8956a → #9c6b45`, plank lines `rgba(90,50,20,.18)` 2 px every 46 px, plus a 6 px top edge `#7a5236`. Keep the teal wall in the top band. Optionally draw the ribbon in the bottom band when it is ≥ 120 logical px tall (`y = LH + 60`).

## P2 — should fix

4. **Flyers (gems flying to Gizmo) arc up into the HUD band.** They pass over the fuel gauge and combo meter (apex y ≈ 40–60) and are hard to follow.
   *Where:* `motion_match_flyers.png` frames 2–6, `box_ultrawide.png` (heart at the gauge).
   *Fix (world.js launch, ~line 385):* pick the apex first and derive the throw. Use `apexY = max(96, min(y0, HOPPER.y) - 70)`, `vy0 = -sqrt(2*g*(y0-apexY))`, `T = (-vy0 + sqrt(vy0*vy0 + 2*g*(HOPPER.y-y0)))/g`, `vx = (HOPPER.x-x0)/T`. Also raise the flyer size at launch from 56 to `min(c.w,c.h)*0.74`, the size it had on the card, so the gem visibly "leaves" the card (`render.js:437`).

5. **"+10" and "×N!" pop-ups sit on top of neighbouring cards** for 0.95 s, right when the child wants to tap the next card.
   *Where:* `s1_iphone_7flyers.png`, `box_ultrawide.png` ("+40 ×4!" over two cards).
   *Fix (`render.js:136–137`):* spawn the text at the **matched card's** centre, which is empty once it pops (it is now at the pair midpoint `e.x,e.y`). Use `life: 0.75`, rise 30 → 44 px, and fade from k > 0.5. Draw `×N!` at `size 24` 30 px below.

6. **The "+4s" time bonus collides with the season dots and the board frame. Two quick matches stack two "+4s" labels on top of each other.**
   *Where:* `s1_iphone_7flyers.png`, `s2_iphone_8clear.png`, `box_ultrawide.png`.
   *Fix (`render.js:144, 528`):* anchor it right of the seconds label, at `x = gx + gw + 70, y = gy + gh/2`, rising 18 px. Offset each new one by `+22 px` in y while another one is alive. Also move the season dots from `gy+gh+16` to `gy+gh+13` with radius 5 / 6.5. They are 4.5 px now, about 3 CSS px on a phone.

7. **The wrong-pair wiggle is too weak on a phone.** It is 6 px, which is ≈ 4 CSS px at 844×390; the tilt is visible in one frame only.
   *Where:* `motion_wiggle.png`, `s*_iphone_5wiggle.png`.
   *Fix (world.js):* `wiggleAmp: 6 → 10`, `wiggleRot: 0.05 → 0.09`, `wiggleDecay: 0.16 → 0.2`. Renderer: while `wiggleT > 0`, overlay the face with `rgba(255,110,90,.16)` (`rr` of the face) so the "no" reads without sound.

8. **Hexagon (orange) and octagon (amber/brown) are the only pair that is easy to confuse.** Their outlines are both near-circles at 47 CSS px (6×4 board on a phone). Under deuteranopia and protanopia they also become the same olive-gold hue.
   *Where:* `cb_deuter.png`, `cb_protan.png`, `cb_grey.png` (row 3).
   *Fix (art, `tools/art-characters`):* make the octagon a **tall cushion/emerald-cut** (aspect 0.72 w/h, cut corners 22 %) in `#8a5a2b`/`#b07a3a`, so it differs from the hexagon in outline as well as colour. Also rotate the hexagon so it is pointy-top (it is flat-top now).

9. **The title logo is drawn straight over the bot demo board.** "Gem Factory" is mint `#bff3ea` on teal card backs, so it has almost no contrast.
   *Where:* `scr_iphone_title.png`, `scr_desk_title.png`.
   *Fix (style.css):* `#scrTitle { background: radial-gradient(ellipse at 50% 45%, rgba(10,40,50,.55), rgba(10,40,50,.25) 70%); }` and `.logo .l2 { color:#d9fff8; -webkit-text-stroke: calc(var(--u)*.35) #0e4f50; paint-order: stroke fill; }`.

10. **The bench is always 720 px wide even when the board is 4×3.** On Spring and Summer, about 330 px of empty bench sits on the right, which looks unbalanced. The board looks pushed to the right edge, and Gizmo looks far away.
    *Where:* `s0_iphone_*`, `s1_iphone_*`, `scr_*_over.png`.
    *Fix (`render.js:_bench`):* size the bench from the card grid: `x = min(card.x) - 22`, `w = gridW + 44`, keeping `y`/`h`. Ease the size over 0.4 s at `deal`, so the seasons visibly "grow" the bench.

11. **How to Play is too wordy for 4–6-year-olds,** and the text drops to 11–12 px on phones (`style.css:395–398`).
    *Where:* `scr_iphone_how.png`.
    *Fix:* cut each card to ≤ 8 words ("Look! Remember the gems.", "Tap two cards.", "Same gem? Gizmo eats it!", "Be fast before the clock ends."). Use a minimum of 14 px on coarse pointers and icons at 44 px.

## P3 — polish

12. The combo coin "×1" at 19 px is ≈ 13.7 CSS px on a phone, and its grey `#c9d6d4` fill looks disabled. Use font 22 and radius 23; for ×1 use a pale gold `#ffe9a0 → #f2c230`, so it reads as "a coin that will grow" (`render.js:541–544`).
13. Game over on phone landscape: the panel is right-aligned on purpose (`style.css:404`) so the nap shows. Add `#scrOver.dim{background:linear-gradient(90deg,rgba(10,40,50,0) 0 30%,rgba(10,40,50,.45) 55%)}` so the half-covered cards behind the panel recede.
14. The custom wall replaces the windows and gears completely, and Gizmo stands on a photo. Keep the floor/conveyor drawn (it is), and also draw the gears over the custom wall at `alpha .6`. This keeps the "factory" feel (`render.js:277` returns early).
15. Clear banner: the happy Comet looping behind the semi-transparent banner shows through as a ghost (`s2_iphone_8clear.png`). Make the banner panel `rgba(255,250,240,.96)` at `globalAlpha al` (not `al*0.9`), or park Comet at HOME during `clear`.
16. The flip contact sheet (`motion_flip.png`) looks physical: lift 6 px, scale ×1.07, squash to a sliver at frames 6–7. Swapping the face at exactly 0.5 is clean. Keep it. Optional: a 4 % darken of the back when `sxF < 0.4` to fake the edge-on shading.

## Not verified
- Safe-area insets (notch/home bar): Chromium does not emulate `env(safe-area-inset-*)`. This needs a check on a real iPhone, especially the left score pill against the notch in landscape.
- The first ~0.4 s of the deal slide-in happens before the capture freezes, so `motion_deal.png` shows only the settle. The overshoot looked clean in the frames captured.
