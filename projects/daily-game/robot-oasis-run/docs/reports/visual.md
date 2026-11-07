# Visual QA — Pebble's Oasis Run (art director review)

Captures: `NODE_PATH=$(npm root -g) node tests/visual/capture.js [screens chapters change fizz motion custom cvd]` → `tests/out/visual/` (142 PNGs, 0 console errors).
Devices: desk 1280×720, iPhone portrait 390×844 @3× (`phone`), iPhone landscape 844×390 @3× (`phoneL`), iPad 1024×768 / 768×1024 @2× (`ipad`, `ipadP`). Safe-area insets are simulated (47/34 px portrait, 47/47/21 landscape) and the Dynamic Island + home bar are painted on top, so overlaps are visible.

## Verdict
**Ship-worthy look with three P1 fixes.** The storybook style is consistent and warm; Pebble is charming and very readable from behind (red scarf + teal accents pop on every chapter, including night), obstacles are darker/warmer than the path as designed, the HUD clears the notch and home bar on every device, menus are big and touch-friendly, the chapter arch + banner are lovely, and custom photos work well (round sticker hero, ringed custom shells, photo backgrounds). Nothing is scary or off-brand. What hurts is (1) a muddy grey band across the horizon on every frame, (2) sky clouds drawn on top of the sand in landscape, and (3) the Fizz warning text printed straight across Fizz in landscape. Below that: props crowding the outer lanes, a small Fizz/pillow shadow on iPhone portrait, and shells that lose contrast in the Dunes and for colour-blind players.

## P1 — fix before release

1. **Dark "smog" band at the horizon (every chapter, every device).**
   Where: `chapter1_phoneL.png`, `busy_grove_desk.png`, `screen_phone_play_hints.png` (y≈300 px desk), and also `custom_desk_play_grove.png`.
   Why: the far end of the path, where every obstacle first appears, sits inside a murky grey-brown strip. It looks dirty and like haze/smoke, and it lowers contrast exactly where kids need to spot what is coming. Measured luminance falls from 224 to 170 and back across the strip on `screen_phone_play_hints.png`.
   Cause: the haze gradient fades to `'rgba(0,0,0,0)'` (transparent *black*), and the canvas interpolates through grey.
   Fix: `render.js:256`, change `fg.addColorStop(1, 'rgba(0,0,0,0)')` to fade to the same colour at alpha 0. Add a helper near line 30: `const clear = c => c[0] === '#' ? 'rgba(' + hex(c).join(',') + ',0)' : c.replace('rgb(', 'rgba(').replace(')', ',0)');` (during the crossfade `P.sandFar` is an `rgb()` string). Then use `fg.addColorStop(1, clear(P.sandFar))`. Make the same change at `render.js:182` for the custom-photo fade: `fg.addColorStop(0, clear(P.sandFar))`.

2. **Clouds from the sky layer are drawn on the ground in landscape.**
   Where: `fizz_phoneL_1enter.png` (two big white clouds lying on the sand behind Pebble), `busy_grove_desk.png`, `fizz_desk_3flight_early.png`, `screen_desk_title.png` (white puff left of the path at y≈330).
   Why: on wide screens the sky tile is scaled up (`ks = VW/960` makes it 720 px tall in a 540 view), so the décor drawn at y 216–420 of `sky.svg` lands below `horizonY`. It is drawn after the sand plain and is not covered. White blobs on the sand read as smoke or as resting pillows, which is a false hazard.
   Fix: clip the sky blit to the sky. At `render.js:211–215`, wrap the loop in `g.save(); g.beginPath(); g.rect(0, 0, cw, Math.round(this.horizonY * px)); g.clip(); … g.restore();`. Optionally also cap the scale at `render.js:193` with `ks = Math.min(Math.max(VW, 960) / 960, 1)` and tile horizontally, so clouds keep their designed size.

3. **The "Fizz throws pillows!" text covers Fizz in landscape.**
   Where: `fizz_desk_2windup.png`, `fizz_desk_3flight_early.png`, `fizz_desk_5landed.png`, `fizz_phoneL_1enter.png`.
   Why: in landscape the text sits at `horizonY − 52`, which is where Fizz hovers (`bossY 2.4`, `z 11`). It hides his windup pose, the only "here it comes" cue apart from the shadow, for 1.8–3.4 s of every visit. Portrait is fine because the text sits in the empty sky there.
   Fix: `render.js:590`, change `y = topY + 30` to `y = this.portrait ? topY + 30 : this.ins.top + 76` (under the chapter pill, above Fizz's ears). Also move the "Fizz is coming…" line at `render.js:569` from `by + 50` to the same row in landscape.

## P2 — should fix

4. **Roadside props stand in the outer lanes.**
   Where: `chapter2_desk.png` (striped tent at left reaches x≈420, over the left lane), `chapter1_desk.png` and `chapter1_phoneL.png` (sand arches and rock piles touching the right edge), `change_phone_xfade_t0.35.png`.
   Why: props are placed at `|x| ≥ 2.05` u but are up to 2.0 u wide, so their inner edge can reach x = 1.05, inside lane ±1. Children read a big tent on the path as an obstacle, and the outer lanes feel cramped.
   Fix: `render.js:270`, change `x: side * (2.05 + hash(...) * 1.5)` to place by width: `x: side * (1.7 + 0.45 * ZONE_INFO[zi].props[idx] + hash(i * 1.9 + side) * 1.2)`. Compute `idx` before this line; it already is.

5. **Fizz and his pillow shadow are too small on iPhone portrait.**
   Where: `fizz_phone_4flight_late.png` and `busy_night_phone.png`. Fizz is about 48 logical px wide in a 560-wide view, sits inside the horizon haze, and the landing shadow is about 35 px.
   Why: Fizz is the star of the twist, and the shadow is the warning the How-to-Play screen tells kids to watch for.
   Fix: in `render.js:37`, change `WIDTH.fizz` from 2.0 to 2.6 (all orientations; the art is clean). Pillow warning at `render.js:327`: change `r = 0.45 * q.u` to `0.55 * q.u`. At `render.js:330`, raise the ring alpha `0.6` → `0.85`, set `lineWidth` to `Math.max(1.5, q.u * 0.05)`, and change the ring colour `#fff6e8` → `#ffffff` with a second 1 px stroke in `#5b3a20` so it shows on light sand.

6. **Shells lose contrast in the Dunes and for colour-blind players.**
   Where: `cvd_chapter1_desk.png` and `zoom_cvd_chapter1_desk.png`. Under deuteranopia and protanopia the peach conch becomes the same tan as the dune path and the arches. In grey it is also close to the path. `cvd_busy_grove_desk.png`: the pink scallop turns grey-blue but stays readable.
   Why: shells are told apart from the path by hue only. Obstacles are fine because they are separated by value (pots and logs stay dark in every simulation).
   Fix: `render.js:320`, before drawing the default shell sprite, add a pearly halo: `g.save(); g.globalAlpha = 0.55 * al; g.fillStyle = '#fffdf6'; g.beginPath(); g.arc(p.sx, p.sy + bob, W * 0.56, 0, TAU); g.fill(); g.restore();`. Also darken the conch outline in `assets/default/shell_1.svg` to about `#a4521c` with a 4 px stroke.

7. **Roadside props swap to the new chapter in one frame.**
   Where: `change_desk_xfade_t0.05.png` vs `change_desk_arch_through.png`. The sky crossfades over 1.3 s, but every prop changes from palms to arches at the instant of `levelUp`.
   Why: it is a visible pop, and before the arch arrives the scenery beyond the arch still shows the old chapter.
   Fix: in `render.js:270`, give props past the arch the next zone: `zone: (w.endS != null && i * SEG > w.endS) ? (zi + 1) % 4 : zi`. New-chapter props then appear at the horizon behind the arch, and nothing changes at the switch.

8. **The pillow's arc passes under the HUD.**
   Where: `fizz_desk_3flight_early.png`. The pillow at the top of its arc is hidden behind the "Chapter 1" pill at y≈50.
   Why: the child loses the pillow at the most dramatic moment.
   Fix: flatten the arc in the mechanics. At `world.js:533`, use a pillow gravity `C.pillowG = 12` instead of `C.g` in `vy0` and in the fly-state integration in `_updateObjects`. That puts the apex at about 3.5 u instead of 4.5 u. As a render-only alternative, also draw flying pillows after the HUD when their screen y is below `I.top + 60`.

9. **Score and Best numbers are misaligned on Game Over.**
   Where: `screen_phone_over.png` and `screen_phoneL_over.png`. The Best number sits in the middle because NEW! is a third flex item under `space-between`.
   Fix: `css/style.css:335`, change it to `.new-best{position:static!important;order:-1;margin-left:calc(var(--u)*.6)} .sc{justify-content:flex-start} .sc b{margin-left:auto}`. That gives "Best NEW! ……… 1240".

10. **How-to-Play pictures are tiny on iPhone portrait.**
    Where: `screen_phone_how.png`. Icons are about 20 pt beside four lines of 15 pt text.
    Why: 5–6-year-olds read the pictures, not the words.
    Fix: `css/style.css:280`, change `.how-ico img{width:calc(var(--u)*4.2)}` to `calc(var(--u)*6)`. In the portrait block at `css/style.css:327`, change `calc(var(--u)*3.2)` to `calc(var(--u)*5)`.

## P3 — polish

11. Pickup texts stack on one spot: "+10" ×3 overlap above Pebble's head (`custom_desk_play_grove.png`, `chapter1_desk.png`). At `render.js:416`, offset `y` by `-14 * (this.texts.filter(t => !t.big && t.t < 0.3).length)`.
12. A knocked pot flies at the camera and covers Pebble for about 0.4 s (`motion_bump_pots.png`, 480–720 ms). At `render.js:344`, fade knocked objects with `z < 0.5` to alpha 0.5.
13. Change Pictures shows "Whole picture / Round" toggles that are already disabled before a picture is chosen (`screen_phone_custom.png`), and "Whole picture" looks selected. Hide `.shape` until a custom picture exists (`ui.js:162`, render it only when `custom`).
14. Game Over stats are a dense paragraph for this age (`screen_phone_over.png`). Consider icons (shell 37 · pillow 0 · bump 1) instead of sentences.
15. On the Pause screen, Restart sits directly under Resume (`screen_ipad_pause.png`). Add `margin-top: calc(var(--u)*1.6)` above `#btnRestart` so a sloppy tap on Resume does not restart.
16. On the iPhone portrait title, the top 35 % is empty sky and the logo sits on the path (`screen_phone_title.png`). Centre `.title-wrap` vertically with `justify-content:center`, or move the logo up about 10 vh.
17. The tumbleweed (`#a7844f`) on the Bazaar path is mid-contrast at distance (`motion_tumble.png`, `chapter2_desk.png`). A darker twig outline (`#6b4a2b`, 3 px) in `tumble.svg` would help. It is fine at night.

## Checked and fine
- Perspective: sprites sit on the path with their shadows, sizes scale consistently, far → near sorting is correct, and the arch and knocked logs layer properly. There is no popping at the horizon because the 5 u fade-in works.
- Jump: stretch on take-off, a clear shadow left on the ground, and a nice squash on landing (`motion_jump.png`). The lane change takes about 180 ms with lean, and a queued double swipe works (`motion_lane_double.png`).
- HUD clears the Dynamic Island, the home bar and the landscape notch on all devices. Pause and mute are at least 44 pt. Hearts, shells and the chapter bar are legible, including the night pills.
- Night: the light-lavender path gives obstacles and shells strong contrast. Pebble stays readable, and lanterns and fireflies add charm without clutter.
- Chapter banner, chapter-bonus text and the "Perfect dodging! +50" / Fizz "hmph" ending read well. The tone is friendly throughout.
