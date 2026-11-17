# Visual QA — Tibo's Dino Lake Fishing (2026-11-17)

Capture: `node tests/qa/visual_capture.js` (Playwright Chromium, served by `tests/e2e/serve.js`), 390 PNGs + `layout.json`,
`geometry.json`, `contrast.json`, `errors.json` in `tests/out/visual/`.
Devices: iPhone portrait 393×852 @3 (notch inset 47 / home bar 34, logical 720×1561, s 0.546), iPhone landscape 852×393 @3
(59 L/R, 21 bottom → logical 1561×720, ins 108/108/38), iPad portrait 820×1180 @2 and landscape 1180×820 @2 (24 / 20).
Insets emulated by overriding `--sa-*` on `:root`; the Dynamic Island + home indicator are painted on the shots.
Passes: every screen and catch moment × 4 devices × EN/VI (`<dev>-<lang>-NN-*`), every topic ages 3–7 at round 3 cycling
morning/noon/sunset/night (`*-t-age<N>-<topic>-<mood>`, EN on all, VI on iphone-p + ipad-l), 12-spot density
(`*-t-age6-spots12-night`), every critter + its tap (`*-c-*`), colour contrast per mood (`*-k-*`).
Not captured (timing): 11 waits timed out under 5 parallel pages — ipad-l-en 09–13 (sink/reel/splash/show/leap),
iphone-l-vi 11–13/15, iphone-p-en 15 (joy); the same moments exist on the other 6 device × language runs. `23-chapter-banner`
fired too late (shows the next round); `02-banner` shows the chapter banner on every device.

## P1 — none blocking
No clipped HUD/bubble/buttons, no text overflowing the panels in either language, nothing interactive under the home
indicator or Dynamic Island. Rod/line/hook geometry is exact (see "verified").

## P2 — should fix
1. **Portrait lilies overlap / touch each other.** `computeLayout` lilies at x 332 / 420 / 508 / 596 (gap **88 logical**) on
   both portrait layouts; the pad is ±45 × s wide in `FishArt.drawLily` and `render._lilies` uses `s = size/104 × 0.95`
   → iPhone portrait (size 116, s 1.06) pad width ≈ **95 px > 88 gap → ~7 px overlap per pair** (+6 % more while `pondFull`
   pulses); iPad portrait (s 0.95, 85.5 px) leaves **2.5 px** — they read as one long strip.
   Shots: `iphone-p-en-04-play-morning.png`, `iphone-p-vi-23-chapter-banner.png`, `ipad-p-en-04-play-morning.png`.
   Fix (world.js ~l.237): in portrait spread them over `[rock.x1 + 12, swim.x1 − 12]` (≈ 106 gap on 720 wide) and/or in
   `render._lilies` cap `s ≤ 0.85 × gap / 90`; or zig-zag y ±10 for odd i. Landscape gaps are fine (229 / 152).
2. **Bottom-lane fish swim "in the sand".** The lake-bed art is drawn ~100 logical px above `groundY`, so the lowest lane
   centre (iPhone-p 1374, iPad-p 904, landscape 579/600) puts the lower half of the body over the sand band — the purple/
   yellow fish look beached and lose the water contrast. Shots: `iphone-p-en-c-bronto-noon.png` (purple fish),
   `ipad-p-en-04-play-morning.png` (yellow), `iphone-l-en-c-ptero-morning.png` (blue), `iphone-p-en-t-age7-sub-sunset.png` ("6").
   Fix: either clamp the lowest lane to `bedTop − 0.55 × size` in `computeLayout` (needs the bed top from the env RECIPE) or
   draw `env/bed_*` lower / flatter (scale 0.6 in portrait, top at `groundY − 70`) in `render.js`.
3. **Session-done (portrait) hides the celebration.** `#scrDone` panel (CSS `style.css` l.163/247, top `sa-t + 8–10vh`) spans
   CSS y ≈ 160–590 on iPhone portrait and covers Tibo's cheer (Tibo seat y 645 logical ≈ 352 CSS) and the whole fish
   fountain, which only peeks out at the panel's bottom edge; the lower 45 % of the screen is empty water.
   Shots: `iphone-p-en-24-done.png`, `iphone-p-vi-24b-done.png` (also ipad-l: fountain arcs pass behind the panel,
   `ipad-l-vi-24b-done.png`). Fix: portrait → put the panel at the bottom (`justify-content:flex-end; padding-bottom:
   calc(var(--sa-b) + 24px)`), keep Tibo + lilies + fountain above it; or make render aim the fountain apex below
   `boxCache.done`.
4. **Title: Tibo is covered by DOM text.** `render._titleScene` draws Tibo at `L.tibo` ignoring `boxes.title`; the boxes don't
   include the language toggle. iPhone portrait: the tagline pill (CSS ≈ 290–345 y) covers Tibo's body and the little fish
   (`iphone-p-en-00-title.png`); iPhone landscape: the EN/VI toggle covers Tibo's hat and face top
   (`iphone-l-vi-00-title.png`). Fix: add `.lang` toggle + gear to `boxCache.title` (main.js l.520) and in `_titleScene`
   push Tibo down / scale him to clear the boxes; in portrait move the tagline below the lake line or lift Tibo higher.
5. **Answer-colour luminance contrast on the day water is ~1:1** (measured from canvas pixels, the fish body vs the water
   behind it with the fish hidden, `contrast.json`). Water mean: morning `#8EC3BD`, noon `#84BFC0`, sunset `#9DAAA9`,
   night `#374B66`. Painted colours = palette exactly (ΔE 0; nothing is tinted, night fish are not darkened ✔).
   | colour | morning CR / ΔE00 | noon | sunset | night |
   |---|---|---|---|---|
   | green `#4CC26B` | **1.16 / 21** | **1.10 / 24** | **1.05 / 25** | 3.9 / 54 |
   | orange `#FF9A2E` | 1.08 / 40 | **1.03 / 41** | 1.13 / 32 | 4.2 / 57 |
   | pink `#FF8FC0` | 1.08 / 36 | 1.03 / 39 | **1.14 / 17.5** | 4.2 / 51 |
   | blue `#3C8DE8` | 1.73 / 30 | 1.65 / 27 (p10 21) | 1.42 / 26 (p10 **16–17**) | 2.6 / 27 |
   | yellow `#FFD23F` | 1.36 / 35 | 1.43 / 37 | 1.66 / 32 | 6.2 / 65 |
   | red `#E84A4A` | 1.94 / 51 | 1.85 / 50 | 1.59 / 36 | 2.3 / 43 |
   | purple `#8E44AD` | 3.0 / 43 | 2.85 / 40 | 2.45 / 32 | **1.52 / 22** |
   Hue difference is fine for typical vision (ΔE ≥ 16 everywhere), and the dark-tone outline helps, but green on the teal
   lake (and pink on the sunset water, purple at night) relies on hue only. Fix (fish_art.js `drawThing`): give colour fish
   the soft pale rim glow in every mood (now night-only) or a 1.5 px `rgba(255,255,255,.7)` outer rim, and thicken the
   dark outline to ≈ 4 px @256 as DESIGN §3 asks.
6. **iPhone-landscape Talk picture is small.** The shown fish in `#talkShow` is ≈ 90 CSS px wide in a ≈ 250 CSS px empty left
   column (`iphone-l-vi-22-talk.png`); the portrait/iPad picture is large and clear. Fix: in the phone-landscape media query
   size `#talkShow` to the column (≈ 220×160 CSS) and draw the fish at ~80 % of the canvas.

## P3 — polish
1. Landscape speech-bubble tail points down into the background at the bubble's left third (x ≈ 830/2000 of the shot),
   not toward Tibo at the far left (`iphone-l-en-12-show.png`, `ipad-l-en-04-play-morning.png`): point it left / hide it.
2. Landscape iPhone VI bubble: warm-up line wraps to 4 lines, DOM height **159 vs layout.bubble.h 134** (25 logical over; no
   collision, it ends above the show fish) — `iphone-l-vi-04-play-morning.png`. Shorten `p.color` warm-up VI text or allow
   h 160 there. Bubble is narrow (394 logical) because the measured HUD starts at x 970.
3. Count show: the bubble already reads "1, 2, 3, 4 — four spots!" while the fish ring shows 2 (`iphone-l-en-16-count-show-sunset.png`); reveal the run progressively or show it after the count.
4. Fish crossing the top lane brush the lily pads (dorsal fin over the pads): top lane centre − 0.5 size − fin ≈ surfaceY + 6
   (`iphone-p-en-04-play-morning.png`, `ipad-l-en-04-play-morning.png`). Draw lilies after the fish (they are) but push the
   top lane +12 px, or fade the pad where a fish passes under.
5. Adjacent lanes in iPad landscape (366 / 483, spacing 117 ≈ 1.12 size) + bob ±6 + drift ±10 → fins visibly overlap
   (`ipad-l-en-04-play-morning.png`). Reduce drift when spacing < 1.25 size.
6. Cast frame: the float is drawn ~40 px above the flying hook, detached from the line (`iphone-p-en-08-cast.png`,
   `iphone-l-en-08-cast.png`) — hide the float in `fly` or draw it on the line.
7. Bronto in portrait is cut by the right edge (x 676, drawn half-width ≈ 87 → ~43 logical px off-screen) and its submerged legs
   end in hard rectangles (`iphone-p-en-c-bronto-noon.png`). Use `x = W − ins.right − 0.45 h` in portrait; soften the leg cut.
8. A fish in a U-turn squashes 12 spots into an unreadable column (`iphone-p-en-t-age6-spots12-night.png`, top fish) —
   transient; fine. Two-digit text ("10") touches the body outline (`iphone-p-en-t-age7-sub-sunset.png`) — shrink glyphs
   with ≥ 2 chars by 0.85.
9. Fireflies are tiny (≈ 22 CSS px) on iPhone (`iphone-p-vi-c-fireflies-night.png`); 1.4× would read better (hit r 40 is fine).
10. Open-lily flowers are small and pale against the morning water (`iphone-p-en-14-lily.png`); the coloured centre is ~10 px.

## Verified OK
- Rod / line / hook: `line.tip` equals `World.rodTip(rodBase, rodLen, angle, bend)` on every frame captured
  (e.g. iPhone-p tip (264, 500)); hook-to-mouth distance **0–2 px** in reel / splash / show on all devices; the rod starts at
  Tibo's flippers (grip (205,175) of the SVG) in every pose.
- Hanging fish (show): never overlaps the DOM bubble or HUD (overlap 0 px² everywhere); in portrait it hangs at y 550–666
  logical, between bubble bottom 363 and the surface 675; in landscape it is left of the bubble (bubble dimmed to the
  intended low opacity during the catch).
- Night: fish keep their exact palette colours with a pale rim glow; night line visible; stars/moon/fireflies clear of the HUD.
- Every topic, ages 3–7: shapes, spots (≤ 12, separate), letters, numbers, "3+2"/"7−4" text and animal bubbles readable at
  in-game size on all four devices; Vietnamese fits in the bubble, banner ("Chương 1 · Cá sắc màu"), Talk panel, settings
  ("Giọng của Rùa Tibo" wraps to 2 lines inside its chip) and done buttons ("Chơi lại", "Trang chủ").
- Mood crossfades (`*-19-crossfade-morning-noon`, `*-21-crossfade-sunset-night`) blend sky, water and particles smoothly.
- Notch / home bar: the HUD respects the top inset, the left Dynamic Island in landscape only covers reeds behind Tibo's rock.
