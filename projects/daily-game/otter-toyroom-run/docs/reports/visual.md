# Visual QA — Otto's Playroom Dash (2026-11-22)

Method: `node tests/visual/capture.js` (130 PNGs in `tests/out/visual/`, gitignored), all at DPR 2:
desk 1280×720, iPhone landscape 844×390 (touch, simulated notch + safe areas), iPhone portrait 390×844.
Groups: `screens biomes apex change objects motion custom cvd`. The game is frozen (`setSpeed(0)`) and stepped by hand
at 1/120 s, so every frame is deterministic. `tests/out/visual/probes.json` holds the apex geometry (Otto's head vs the HUD).
All numbers below are **logical px** (the canvas view: desk 960×540, phone-L 1169×540, portrait 560×1212) unless marked css.

## P1 — fix before shipping

### 1. The gravity hint text is practically never shown
`render.js:420` sets `gravMsg = 2.6` on the `gravity` event, which `world.js:173/337` fires on the **same tick** as `levelUp`
(banner `t = 0`). `render.js:562` only draws the hint once `banner.t > 2.4`, so it shows for ≈ 0.2 s at ≤ 50 % alpha
(`a = gravMsg/0.4`). Seen in `change_desk_xfade_t2.5.png` (faint, half-transparent "Floaty jumps! Hop over the foam blocks!"),
gone by `t3.1`. The rolled twist's explanation never reaches the child.
**Fix:** `case 'gravity': ... this.gravMsg = 2.6 + 2.6;` (or start the countdown only when the banner ends:
`if (this.gravMsg > 0 && (!this.banner || this.banner.t > 2.4)) this.gravMsg -= dt` in `update`). Also see P3-12 for its position.

### 2. A bumped tower hides Otto completely
Towers are not knocked away (`world.js:466` skips `_knock` for towers); with `state 'hit'` the tower keeps sliding to z < 0 and is
sorted after the hero (`render.js:287`), drawn 1.2× larger right over him. 0.25 s after a bump it covers Otto's whole body
(desk: tower spans ≈ x 650–900, y 505–880 css; `motion_bump_tower.png` frames 540–720 ms). The child can't see the "ouch" pose,
which is the feedback for the mistake.
**Fix (render.js `_items` / `drawItem`):** for `o.state === 'hit'` sort it behind the hero (`z: Math.max(z, 0.05)`) and fade it:
`alpha = f * (o.state === 'hit' ? clamp(0.25 + z, 0.25, 1) : 1)`; or give towers a sideways topple (`_knock` with `vy = 0`).

### 3. Moon-jump apex hits the biome pill on iPhone landscape
`probes.json apex3_phoneL`: laneW0 194.4, footY 440.8, Otto's head top at the moon apex (y 1.251 u) = **36.1**, while the centre
pill spans y **10–48** (`render.js:533–534`: `by = y0 + 4`, pill `by−4 … by+34`). 12 px overlap — the ears go under the pill
(`apex3_phoneL.png`). Desk is fine (head 90 vs 52), portrait fine (690 vs 141).
**Fix (`render.js:86`):** cap the lane width so the tallest apex clears the HUD (head top = footY − 2.08·L):
`this.laneW0 = portrait ? 0.27*VW : Math.min(0.19*VW, 0.36*VH, (this.footY - v.ins.top - 62) / 2.08)` (compute `footY` first).
Phone-L → L ≈ 182, head ≈ 62. Alternative: on very wide landscape (VW/VH > 1.9) move the pill next to the pause button.

## P2 — clearly visible, should fix

4. **"+10" popups land on Otto's head.** `render.js:402` spawns the text at `proj(e.y).sy − 0.3u` — with acorns at y 0.35 that is
   y ≈ 0.65 u, Otto's head (head top ≈ 0.83 u); it then rises only 40 px. Rows of acorns stack 3–4 "+10"s on his head
   (`custom_desk_play_meadow.png`, `pop_*` crops). **Fix:** spawn at `proj(e.x, 1.25, max(0,e.z))` and push x 0.45 u to the
   outside of Otto's lane; offset each new text by −16 px when another is younger than 0.3 s.
5. **"Biome bonus +100" collides with the HUD pill on iPhone landscape.** `render.js:421`: y = footY − 1.9·laneW0 = 440.8 − 369.4 = 71.4,
   rising 18 px → 53; 28 px font × 1.3 pop overlaps the pill (y 10–48) (`change_phoneL_xfade_t1.2.png`). **Fix:** put it under the
   banner: `y = (portrait ? ins.top + 150 : horizonY - 82) + 76 + 26`, or make it a third line inside the banner.
6. **How to Play icons overlap the text** (all sizes). `.how-ico` has `min-width: 7u` but two images at `6u` each (`style.css:105, 337`);
   portrait: second icon right edge 90 css vs text left 87; desk: the raspberry acorn sits on "the next", the foam blocks on "blocks"
   (`screen_*_how.png`). **Fix:** `.how-ico{flex:0 0 auto;min-width:0}` and `.how-ico img:nth-child(2):last-child, .how-ico img:first-child:nth-last-child(2){width:calc(var(--u)*4)}`.
7. **Settings, portrait: the volume "+" button sticks out of its row** (row right 360 css, button 329–365). **Fix:**
   `.set-volume .vol-wrap{flex:1;min-width:0;display:flex;justify-content:flex-end;gap:6px} .set-volume input[type=range]{flex:1 1 auto;min-width:0;width:auto}`.
8. **HUD text too small on phones.** Biome label `900 13px` (`render.js:538`) and "pts" `14px` (`render.js:530`) render at
   **9.0 css px** (portrait, scale 0.696) and **9.4 css px** (landscape, scale 0.722). **Fix:** `const fs = n => Math.round(Math.max(n, 12 / this.cssScale))`
   for the label and pts; widen the pill (`bw` +40) and the acorn pill (156 → 176) on touch.
9. **Acorns fly into an invisible corner on the title screen.** The demo bot collects acorns; flyers aim at `_hudAcorn || {40, 80}`
   (`render.js:501`) but the HUD isn't drawn in title mode, so acorns float into the sky / onto the shelves (`screen_desk_title.png`
   at ≈ (125, 85); `screen_phone_title.png` near the garland). **Fix:** in `onEvents` push flyers only when `OD.Game.mode === 'playing'`.

## P3 — polish

10. **Button label contrast** (white text): green `#5cc65a` 2.2:1, orange `#ff9f43` 2.0:1, teal 2.2:1, grey `#b9b3a8` 2.1:1 (large bold
    text wants ≥ 3:1). The disabled "Reset" on Change Pictures is ≈ 1.4:1. **Fix:** darker text shadow `0 2px 0 rgba(0,0,0,.35)` plus
    `--grey:#8f887c` (≈ 3.4:1) and `--green:#43a841` (≈ 3.0:1); leave orange/teal as brand but add `-webkit-text-stroke:1px rgba(0,0,0,.18)`.
11. **Portrait HUD: progress pill touches the pause/mute buttons** — buttons end at y 140.7, pill starts at 141.5 (`render.js:533`,
    `by = y0 + 64`); with the 3.5 px white ring they visibly kiss (`busy1_phone.png`). **Fix:** `by = y0 + 74`.
12. **Gravity hint position** (once P1-1 is fixed): landscape `y = ins.top + 116` sits 6 px above the banner top (134); portrait
    `y = topY + 30` lands **inside** the banner box (topY … topY+76). **Fix:** `y = topY + 76 + 34` in both layouts.
13. **Game Over: Score and Best digits don't line up** — Best's right edge is 150 css px left of Score's because the NEW! badge sits
    inline after the number (`screen_desk_over.png`). **Fix:** NEW! above the digits (`position:absolute; top:-1.4u; right:0`) or before them.
14. **Title icon is a hard square sticker** (`style.css:59`, full-bleed `icon.svg` with a drop shadow). **Fix:** `border-radius:22%`.
15. **Change Pictures grid is ragged** (portrait 3 + 2 + 1, desk 3 + 3 with a narrower second row). **Fix:** one uniform grid:
    `grid-template-columns:repeat(auto-fill,minmax(150px,1fr))` (2 columns on portrait).
16. **grav_0 badge reads like a Poké Ball at 32 px** (red ball, white curved band, dark ring). **Fix:** repaint as the game's own
    striped ball (blue / white / yellow stripes as in `ball.svg`) with the hop arc.
17. **acorn_2 reads as a strawberry / toadstool** (raspberry body with white dots, teal cap) rather than an acorn. **Fix:** give the cap
    the cross-hatch texture of acorn_0 and use 3 small dots, not 5 large.
18. **Golden acorn vs light roads**: `#ffcc33` on meadow road `#eee2c4` = 1.17:1, crayon road `#f6f0e1` 1.33:1; near ones are fine
    thanks to the dark outline, far ones (< 12 px) almost vanish. **Fix:** for variant 1 tint the halo `rgba(255,170,0,.35)` or thicken
    the olive outline to 4 px in `acorn_1.svg`.
19. **Touch hint pills overlap Otto's shadow on iPhone landscape** (`render.js:575`, `y = VH − 30 − ins.bottom`; the "▲ jump" pill
    covers his shadow, `screen_phoneL_play_hints.png`). **Fix:** in landscape touch move the three pills to `VH − 16 − ins.bottom` and
    shrink to 96 × 30, or shift the middle one 70 px right.
20. **Night: Otto at the moon apex is brown on dark blue** (`#7a4a2e` vs floor `#2a3464` 1.6:1; on the road 3.1:1). The mint scarf
    saves the silhouette; optional 2 px warm rim light (`#ffe9c8` 40 %) when `vis.cur === 3`.

## Checked and OK
- All screens at all three sizes fit; nothing is cut off; safe areas are respected (notch and home bar clear of buttons).
- Biome look: four clearly different palettes; the toy-block arch with the next biome's gravity badge reads well; the crossfade and
  banner are clean; props stay outside the road.
- Moon apex on desk (head 90 vs pill 52) and portrait (690 vs 141) is clear of the HUD.
- Bouncing balls keep their shadow on the floor; foam blocks stay distinct on the lilac pillow floor (dark outline, 2.2:1 vs road).
- Motion: 4-frame run cycle with tail swish reads at 40 ms; jump/land squash and the floaty / heavy / moon arcs differ visibly;
  "ouch" and "happy" poses read; the knocked foam blocks tumble off sideways.
- Custom pictures: photo hero sticker, transparent cut-out acorn (white disc + coloured ring) and photo backgrounds work in play,
  incl. the night dimming.
- Colour-blind (deuteranopia, protanopia, greyscale; `cvd_busy*`): acorns stay separate from the road by value, full vs empty hearts
  differ by fill, red/yellow/blue tower blocks separate by value, Otto's silhouette stays clear.
- Originality: Otto is an original chocolate otter with a mint scarf; toys are generic (no studs, logos, letters or wrappers);
  only the grav_0 badge (P3-16) has a faint brand echo.
