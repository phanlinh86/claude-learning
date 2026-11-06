# Visual QA — Momo's Toy Train (2026-11-06)

Report only: nothing under `game/` was changed. Scripts are in `tests/visual/`, images in `docs/reports/visual/`.

| Script | What it captures |
|---|---|
| `screens.js` (`NOTCH=1`) | 15 screens × 4 viewports × EN/VI, plus DOM measurements → `screens-measure.json`, `screens-notch-measure.json` |
| `topics.js` | all 20 age×topic combos on iPhone portrait (EN, @2 + train crop) and landscape (VI); checks for cargo left on the rug during depart → `topics-measure.json` |
| `moods.js` | 4 moods × 4 viewports; recolours cars/cargo into all 7 answer colours and samples the rendered pixels → `contrast.json` (WCAG ratio, ΔE00, deut/prot ΔE00) |
| `surprises.js` | bunny + balloon × 4 viewports (load / tap / depart), Momo @3 crops, arrive/depart motion strips |
| `sheet.js` | contact-sheet helper (sharp) |

Viewports: `ip-p` 393×852, `ip-l` 852×393, `pad-p` 820×1180, `pad-l` 1180×820. Notch emulation overrides `--sa-*`
(iPhone portrait t59/b34, landscape l59/r59/b21; iPad t24/b20); `#safeProbe` picks it up correctly
(`ins` portrait top 108 / bottom 62 logical, landscape left/right 108 logical). No console errors in any run.

## P1 — fix before shipping

1. **The next round's cargo shows full size on the rug while the old train leaves and the new one arrives.** This is the
   "Off we go! Bye-bye, toys!" screenshot with toys on the rug.
   *Evidence:* `seq-depart-07..15.png` (state `arrive`, every item `pop` with `size 0`, yet drawn about 100 px),
   `scr-pad-p-en-10-depart-b.png`, `scr-ip-p-en-04-arrive.png`, `topic-ip-p-en-a4-colors-depart-leftover.png`, and the
   arrive frames of `motion-ip-l-arrive-depart.png` (count balls visible before the deal).
   *Cause:* `game/js/render.js:315` and `:320` use `s = ip(it,'size',a) || 100`. A size of 0 is falsy, so a not-yet-dealt toy is
   drawn at 100 logical px. The world logic is correct: the traced states and sizes are right.
   *Fix:* `const s = ip(it,'size',a);` with `if (!(s > 1)) return;` in `_item`, and the same guard in `_itemShadow`. Also
   skip `it.state === 'pop' && !it._popped` in the filter at `render.js:206`.

2. **iPhone portrait: with 3–4 cars the cars are smaller than the cargo.** At age 5 (shapes, letters, homes, 4 cars) each car is
   109 logical (59 CSS px) wide, and a toy on the rug is 125 logical (68 CSS px). With 3 cars a car is 151 logical
   (82 CSS px); the car's drop box is 82×32 CSS px. Home badges on the sign plates are about 22 CSS px, and pond and burrow
   (both green circles) can't be told apart at that size.
   *Evidence:* `topic-ip-p-en-a5-homes.png`, `topic-ip-p-en-a5-letters-train.png`, `scr-ip-p-en-05-ask.png`.
   *Fix:* in `content.js`/`world.js` cap the cars at 3 when `layout.portrait`. For 3 cars in portrait, set
   `CONFIG.engineWPort` 180 → 150 and `engineX` 20 → 8, which gives a car about 170 logical wide. Draw home badges
   at ≥ 0.8 × plate height.

## P2 — clearly visible, should fix

3. **The rug has decoy toys and the cargo floats on the wallpaper (portrait).** `render.js _foreground()` draws a lilac
   play-mat with a cream cube, a cone and a mint ball (`toys` array, render.js about line 222). These are the same toy
   kinds as the cargo, and the mat sits below the track where a child expects the toys. The real cargo floats on the
   striped wall above the train. In landscape and on iPad the cargo sits in the shelf row next to the background teddy and
   tent (`scr-ip-l-vi-07-wrong.png`, `sur-pad-l-balloon-1.png`).
   *Evidence:* `scr-ip-p-en-05-ask.png`, `topic-ip-p-en-a5-homes.png`.
   *Fix:* remove the three mat toys. Better still, move the portrait rug band below the track, which frees about 300 logical
   px: put `layout.rug` in `trackY+40 … H-ins.bottom-40` and keep the mat as the backdrop for the cargo. In landscape, draw
   a soft cream shelf board or shadow strip under the rug row so cargo reads as "on the rug" and props stay behind it.

4. **Momo is barely visible in the cab.** Only the cap and eyes show above the cab sill: about 35 CSS px of a 93 CSS px owl
   on iPhone portrait. The beak and cheeks are always hidden, and in a blink frame she reads as a cap with two lilac lids.
   *Evidence:* `hires-ip-p-momo-night.png`, `hires-pad-l-momo-night.png`, `topic-ip-p-en-a5-letters-train.png`.
   *Fix:* in `world.js` CONFIG set `momoDy` 34 → about 60 (raise her 26 px), or lower the cab front wall in
   `train_art.js drawEngine 'front'` so the sill sits at the belly (≈ 45 % of Momo's height). Move the cap brim up about 6 px
   in `momo_*.svg` so it doesn't cover the eye rings.

5. **The size topic (age 3) draws the big and small cars the same size.** The only difference is the tiny cube icon on the
   plate. *Evidence:* `topic-ip-p-en-a3-size-train.png`. *Fix:* in `world.js` layout, for `label.type === 'size'`, make the
   small car body 0.7 × w and 0.75 × h (the `plan.scales` hook already exists), and draw the plate icon at 0.9 × plate.

6. **The session-done train is hidden behind the done panel in portrait.** The panel is at y 497–813 on iPhone and
   854–1130 on iPad portrait; the train is at H−150. In landscape only 2 of 4 cars show beside the panel.
   *Evidence:* `scr-ip-p-en-14-done.png`, `scr-pad-p-en-14-done.png`, `scr-notch-ip-l-en-14-done.png`. *Fix:* `render.js
   _doneScene` portrait `ty = H*0.5` (above the panel), or in `style.css` move `#scrDone` portrait to `align-items:flex-start`
   with the train below. Landscape: `x0 = ins.left+24` and n = cars that fit left of the panel.

7. **Talk panel overlaps the HUD with a notch (iPhone portrait).** HUD bottom 125 px vs panel top 114 px (11 px overlap);
   the star pill covers the panel border. *Evidence:* `scr-notch-ip-p-vi-12-talk.png`. *Fix:* `style.css` `#scrTalk`
   `padding-top: calc(var(--sa-t) + 76px)` on portrait.

8. **The iPad-landscape title has no cars.** `_titleScene` gives `n = floor((294-180)/186) = 0` at W=1036, so only the engine
   shows. iPhone landscape shows 2 cars and portrait shows 2. *Evidence:* `scr-pad-l-vi-01-title.png`. *Fix:* `render.js` about
   line 412: `n = clamp(..., 2, 3)` and shrink `cw` to fit (`cw = min(170, (room-E)/2-16)`), or let the train run under the
   Play button's right side.

9. **Night lighting doesn't match the train.** At night the cars and cargo render at exactly the daytime palette
   (`#E84A4A`, `#3C8DE8` sampled, the same as noon) on a `#4B4A6C` wall, so they look pasted on. They also have the lowest
   contrast in the game: purple car vs night wall CR 1.43, ΔE00 18.5; purple cargo vs night wainscot CR 1.07, ΔE 17.8; blue
   cargo CR 1.51, ΔE 16.7. *Evidence:* `mood-pad-l-night.png`, `mood-ip-p-night-recolour.png`, `contrast.json`.
   *Fix:* keep the colours (good for answers) but add a 3 px light rim (`light` colour, 70 % alpha) to colour cars and
   cargo when `amb.lamp>0.5` (`train_art.js drawCar/drawCargo`), plus a soft warm floor-light pool under the train.

## P3 — polish

10. **The bubble keeps the depart line through the next train's arrival.** "Off we go! Bye-bye, toys!" stays until `ask`
    (`seq-depart-07..15`). *Fix:* clear or replace the bubble on the `round`/`arrive` event in `main.js` (e.g. `deal[]`
    "Here comes the train!").
11. **Touch targets on iPhone landscape.** Pause is 48×48 CSS px = 88 logical, below the 100 target (`style.css:198`
    `.icon-btn{48px}`); keep 56 px. The iPad pause is 56 CSS px but only 49 logical (fine physically). Cargo hit 153–178
    logical, whistle 103–120 logical, and the bunny and balloon (125–144 logical) all pass. Settings age chips are
    56×40 CSS px in landscape.
12. **Surprise hit boxes run past the right edge.** Overhang is 13 px for the bunny and 25 px for the balloon on iPhone
    portrait, and 9 px / 27 px on iPad landscape; the balloon head sits 30 px from the edge (`sur-pad-l-balloon-1.png`). In
    landscape, cargo can sit on top of the tunnel (red ball at x≈50, `scr-ip-l-vi-07-wrong.png`). *Fix:* clamp the balloon
    anchor x ≤ `W-ins.right-0.6·balloonSize·S` in `_balloonIn`, and set `rug.x0 ≥ tunnel right edge + S/2`.
13. **The landscape settings panel needs scrolling.** The 4th toggle ("Answer by talking" / "Trả lời bằng giọng nói") is
    half-hidden behind Done at 393 px height (`scr-ip-l-vi-02-settings.png`). *Fix:* landscape `.set-grid` with 4 columns, or
    shrink the row gap.
14. **Count plate dots are small.** Unlit dots are hollow, about 5 CSS px, and barely visible on phone
    (`topic-ip-p-en-a4-count-train.png`). Make them filled at 35 % alpha and 1.3× larger.
15. **Low-contrast colours rely on outlines.** Yellow cargo on the mint wainscot: CR 1.02–1.16 (ΔE 21–28). Orange car on the
    sunset floor: ΔE 14.6. Yellow car on the floor: ΔE 16.6. Outlines carry these, so keep the `dark` outline at ≥ 4 px
    at phone scale. Colour-vision pairs: yellow–orange deut ΔE 7.9, green–orange prot 8.3, red–green deut 8.8 (already
    excluded under age 5). Also exclude yellow+orange at age 5+, or rely on toy-picture labels.
16. **The ghost hand covers Momo and the whistle** during the whistle nudge (`scr-ip-p-vi-09-whistle.png`). Offset it
    +30 px right and down.
17. **The tunnel reads as a pillar** at the left edge without a notch (12–50 px wide slab). It looks good with a left inset.
    Give it a fixed visible width of ≥ 70 logical.
18. **The done scene's "3" car carries 2 toys** (`render.js _doneScene`). Give it 3 toys.

**OK as measured:** Vietnamese text fits everywhere (no bubble overflow on any of the 8 runs; banners and done titles wrap
cleanly). The HUD never overlaps the bubble or any cargo (0 overlaps on all runs). No cargo is off-screen. Arrive braking
and couplings, depart jolt, stretched couplings, puffs and the headlamp beam look physical (`motion-*-arrive-depart.png`).
The art is consistent and charming, and the room stays calmer than the answer colours by day.

## Fixes applied (lead, QA round 1)
- **P1-1 next train's toys on the rug:** `render.js _item/_itemShadow` skip size ≤ 1 (no more `|| 100`).
- **P1-2 portrait cars:** at most 3 cars in portrait (`portMaxCars`, content `maxCars`), `engineWPort 150`, `engineX 8`
  → cars ≈ 165 logical px (90 CSS px) on iPhone portrait; count-plate dots bigger (P3-14).
- **P2-3:** decoy toys on the portrait play mat removed; `trackTall 300 → 230` (less empty floor under the track).
- **P2-4 Momo:** drawn at 0.8·E and raised 0.16·E in the cab — face, beak and wings clear the cab wall (checked on iPhone/iPad).
- **P2-5 size topic:** the small car is laid out at 0.7× (width and height); small toys are no longer shrunk twice (the
  renderer passes world-sized 'size' toys at scale 1).
- **P2-6 done screen:** portrait panel at the top, train visible below; landscape train parks left of a narrower panel;
  the "3" car carries 3 toys.
- **P2-7 Talk under HUD:** portrait `#scrTalk` padding-top = safe-area top + 86 px.
- **P2-8 iPad landscape title:** at least one car.
- **P2-9 night contrast:** a soft moonlit rim behind each car and a light halo behind every toy when the lamp is on.
- **P3-10** stale bubble fixed; **P3-11** pause target 56 CSS px + 12 px invisible hit ring; **P3-12** a tunnel keep-out box
  for resting cargo, balloon/bunny targets inside the screen; **P3-13** landscape settings fit (4 toggles in a row, note
  hidden); **P3-16** whistle hint hand rotated to reach in from the lower right.
- Not changed: P3-15 (yellow/orange still allowed together at age ≥ 5), P3-17 (thin tunnel without a notch).
