# Visual QA — Zippy's Jungle Boop (2026-11-11)

Capture: `node tests/visual/capture.js` → 88 PNGs in `tests/out/visual/` (no console errors).
Viewports: `desk_*` 1280×720 · `phone_*` 844×390 @3x touch · `ipad_*` 1024×768 @2x touch · `portrait_*` 390×844 @3x touch.
Critter tableaux are frozen with deterministic stepping (`Game.step`), every state shown (up / rise / booped / wow); colour-blind sims via an SVG `feColorMatrix` on `#stage`.

Overall: the art is clean, cute and consistent; the menus are readable on every viewport; the flight arc, squash and star-flyer feel good. The problems are about **draw order** and about **overlays sitting on the faces and stars the child is looking at**.

---

## P1 — fix before shipping

### P1-1 Front-row friends' faces are hidden behind the burrow lip of the row behind them (every biome; worst in Canopy/Ruins)
- Screenshots: `phone_play_L3.png`, `desk_play_L2.png`, `desk_play_L3.png`, `ipad_play_L1.png` (the front toucan's crest is cut flat by the back bamboo pot), `phone_custom_play_L0.png`, `desk_custom_round_flight.png`.
- What's wrong: every `burrow_front` is baked into one full-screen `front` layer (`render.js:139`) and drawn once **after all critters** (`render.js:239`). So the back row's front lip is painted over the mid-row critter's head, and the mid row's lip over the front-row critter's eyes. In L2/L3 the middle column reads as a "totem" where the mid and front frogs have no eyes (crop: front monkey/frog eyes covered by the stone pot). With custom pictures the round photos are cut the same way.
- Fix (`render.js`): draw each burrow front right after its own critter. Holes are already ordered back→front.
  1. `render.js:139` delete `if (bf) frg.drawImage(bf, x, y, w, hh);` (the `front` layer keeps only the `near` frame).
  2. In `_critters` (`render.js:275-309`) loop over **all** holes and draw the lip at the end of each iteration:
  ```js
  const n = ZJB.Assets.SEASONS[this.vis.cur];
  for (const hole of w.holes) {
    const c = hole.critter, s = hole.s;
    if (c) { /* …existing critter / star / paws code, unchanged… */ }
    this._img(n + '_burrow_front', hole.x - 85 * s, hole.y - 45 * s, 170 * s, 90 * s);
  }
  ```
  (`continue` statements in the critter block need to become `if` guards so the lip is still drawn.) Shake comes for free because this runs under `T()`. During the crossfade, draw the previous biome's lips the same way with `g.globalAlpha = 1 - this.vis.fade` from `ZJB.World.LAYOUTS[this.vis.prev]` (they are currently in `prev.front`, `render.js:240`).

### P1-2 The level banner covers the back-row friends for 2.6 s
- Screenshots: `desk_banner_L2.png`, `phone_banner_L2.png`, `phone_banner_L3.png`, `phone_crossfade_sheet.png`.
- What's wrong: banner centre y = 200, pill 68–92 px tall (`render.js:432,436`) → covers y 166–258. In Canopy/Ruins the back-row critter heads start at y ≈ 187 and their stars sit at y ≈ 258, so the monkey and toucan in the back row are completely hidden under "Treetop Canopy", while friends are already popping up and the child must tap them.
- Fix (`render.js:428-441`): put it in the empty band between the HUD and the burrows and make it shorter:
  ```js
  const y = 150 - (t < 0.3 ? (1 - t / 0.3) * 20 : 0);           // was 200
  g.font = '900 38px "Baloo 2", "Trebuchet MS", system-ui, sans-serif';   // was 44
  const text = b.sub ? b.text + ' · ' + b.sub : b.text;          // one line, no 2nd row
  this._pill(480 - tw / 2 - 26, y - 28, tw + 52, 56);            // y 122–178
  ```
  and fade out earlier (`render.js:217`: `> 2.6` → `> 2.0`, `render.js:431`: `2.1` → `1.5`). Zippy at (480,112) is partly behind the pill for ~2 s; that's fine because the target badge stays visible. (Optional, `world.js`: no back-row spawns during the first 1.5 s of a level.)

### P1-3 Pause / sound buttons ignore the safe area (notch, Dynamic Island, status bar)
- Screenshots: `portrait_notch_hud.png` (simulated 47 px top inset + island), `phone_notch_hud.png`.
- What's wrong: `#hud` is `top/right: calc(var(--u)*1.4)` (`style.css:72` and `:149`). The comment says "overridden by Renderer.resize()", but `_measureHud()` is empty (`render.js:71`). In portrait the buttons sit at y 8–52 px, under the status bar / beside the island, while the canvas HUD row is correctly moved down to y ≈ 61 (`hudDy()`), so the two halves of the HUD are on different lines. In landscape the sound button sits inside the 47 px right inset (rounded corner).
- Fix (`style.css`, replace line 149):
  ```css
  #hud{top:max(calc(var(--u)*1.4), calc(env(safe-area-inset-top,0px) + 6px));
       right:max(calc(var(--u)*1.4), calc(env(safe-area-inset-right,0px) + 6px))}
  ```
  and delete the stale comment and the empty `_measureHud` call, or make it set the same values from `this.insets`.

---

## P2 — should fix

### P2-1 Zippy's boop and the "+N" text cover the giggling face, which is the reward
- Screenshots: `desk_zippy_flight_sheet.png` (frames 0.30–0.42 s), `desk_boop_backrow.png`, `desk_custom_round_flight.png`.
- What's wrong: Zippy boops at `by − 120·s` (`world.js:54 TARGET_DY: 120`). His sprite extends 43 px below its centre, which puts his belly on the critter's eyes (eyes ≈ `by − 80·s`). The "+20 ×2" text (`render.js:179`, `y: e.y - 40` where `e.y = by − 29·s`) rises 46 px and lands on the same spot.
- Fix: `world.js:54` `TARGET_DY: 160` (his belly now just touches the head top at `by − 125·s`; that's the "boop"). `render.js:179` `y: Math.max(96, e.y - 175)` (above Zippy), and `render.js:380` rise for non-big texts `46` → `22`.

### P2-2 "Oops!" sits on the surprised face
- Screenshot: `desk_zippy_dizzy_sheet.png` (0.08–0.40 s: the frog's "wow" face is hidden under the text).
- Fix: `render.js:185` `y: e.y - 40` → `y: e.y - 115` (above the head), size 28 → 30.

### P2-3 Combo and "Biome cleared!" texts land on the back row
- Screenshot: `desk_play_L2.png` (geometry); the texts are at y 200 / 220 (`render.js:192-193`), the same band as P1-2.
- Fix: `render.js:192` y 200 → 172 and `render.js:193` y 220 → 150. "New colour!" at y 168 (`render.js:191`) is fine (`phone_new_colour.png`). When combo and colour fire on the same boop, offset combo to x 620.

### P2-4 Colour-change warning flickers at 8 Hz (4 flashes/s)
- Screenshots: `desk_colour_warn_a.png` / `_b.png` (the badge and Zippy's glow alternate every 1/8 s).
- What's wrong: `Math.floor(this.time * 8) % 2` (`render.js:315`, `:422`) is above the 3 flashes/s guideline (WCAG 2.3.1). It's also too fast for a 4-year-old to read *which* colour is coming.
- Fix: use `* 3` in both places (1.5 flashes/s); during `warn` also draw the next star small at the badge's right: `this._img('star_' + this.warnTo, cx + 30, cy - 12, 24, 24)`.

### P2-5 Wide phones: the foliage frame stops in a hard vertical line at the stage edge
- Screenshots: `phone_play_L0.png`, `phone_play_L3.png`, `phone_title.png` (leaves cut straight at x ≈ 75 css px and 769 css px; the letterbox columns show bare background).
- What's wrong: `near.svg` is only drawn inside the stage when `oy ≤ 2` (`render.js:147`).
- Fix (`render.js:141-148`): anchor each quadrant of the frame to its screen corner, which covers both the wide and the tall case:
  ```js
  if (nr) {
    const hw = LW / 2, hh = LH / 2, W2 = hw * k, H2 = hh * k;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++)
      frg.drawImage(nr, i * hw, j * hh, hw, hh, i ? bw - W2 : 0, j ? bh - H2 : 0, W2, H2);
  }
  ```
  This is safe because `near.svg` keeps x 120–840 clear, so moving the quadrants outward only opens up more room.

### P2-6 iPad: hard seams in the background (top edge of the far layer, near-frame halves)
- Screenshot: `ipad_play_L1.png`: the bamboo trunks start abruptly at y ≈ 95 css px (top of `far.svg` at `this.oy`, `render.js:166`), and the left/right bamboo poles of the near frame are cut at y ≈ 280 and restart at y ≈ 465 (the top and bottom halves are drawn apart, `render.js:143-146`).
- Fix: (a) in `_drawBack` after drawing each far tile, when `this.oy > 0`, extend it upward: `g.drawImage(L.far, 0, 0, tw, 2, x, 0, tw, this.oy)`, which carries the trunks to the top (it's transparent for the riverbank and ruins). Do the same in the static branch at `render.js:152`. (b) P2-5's corner-anchored quadrants (they replace the `oy > 2` branch at `render.js:143-146`) plus, for the vertical gap, `frg.drawImage(nr, 0, hh - 1, LW, 2, ox, H2, LW * k, bh - 2 * H2)` (stretch the 2 px seam row across the gap; it's mostly transparent except the poles, which then continue).

### P2-7 Portrait and tall screens: the stretched floor makes streaky "reflections"
- Screenshots: `portrait_title.png`, `portrait_notch_hud.png`, `portrait_play_L0.png`.
- What's wrong: `render.js:126` stretches the floor's last 30 px down 400+ px, so every reed or shadow in that strip becomes a long vertical smear.
- Fix: replace the stretch with tiling the calm ground band (file y 380–540) downward, with a gradient into `info.ground`:
  ```js
  for (let y = oy + LH * k; y < bh; y += 160 * k) fg.drawImage(fl, 0, 380, 1920, 160, Math.round(x), Math.round(y), Math.round(tw), Math.ceil(160 * k));
  ```

### P2-8 Colour-blind: Coral ≈ Sunny and Sky ≈ Grape; only the emblems separate them, and the emblems are small at phone size
- Screenshots: `phone_stars_L3_deutan.png`, `phone_stars_L3_protan.png`, `phone_stars_L*_gray.png`. Under both deutan and protan, Coral turns yellow-olive next to Sunny's yellow, and Sky and Grape are two similar blues. The emblems (heart/sun/drop/moon) are visible but only ≈ 13 css px on back-row stars on an 844×390 phone. With normal vision the four stars are easy to tell apart at phone size (`phone_stars_L3.png`).
- Fix: (a) darken Coral so it also differs from Sunny by lightness: `#ff5d73` → `#e8384f` (dark `#8f1426`) in `render.js:12`, the star generator in `tools/art-characters/` and DESIGN.md §3. Simulated luminance Coral/Sunny goes from 0.68/0.82 to 0.53/0.82 (deutan). (b) Emblem 40% → 52% of the star, with a 2 px darker outline, in `star_0..3.svg`. Make the sun a disc with 6 thick rays (8 thin rays blur into a blob at 13 px). (c) Draw stars 10% larger in play: `render.js:301` `62 * s` → `68 * s`.

### P2-9 Custom Zippy has almost no colour cue
- Screenshots: `desk_custom_round_flight.png`, `phone_custom_play_L0.png`.
- What's wrong: with a custom hero the antenna bulbs are skipped (`render.js:350`) and only the faint radial glow remains, so the hero is hard to tell from the custom friends (same photo style) and his current colour is hard to read.
- Fix (`render.js:345-348`): after drawing the custom hero, add a ring and a bulb in his colour:
  ```js
  g.lineWidth = 6; g.strokeStyle = C.fill; g.beginPath(); g.arc(0, 0, Math.max(fw, fh) / 2 + 3, 0, Math.PI * 2); g.stroke();
  this._img('star_' + colour, fw / 2 - 14, -fh / 2 - 10, 28, 28);
  ```

---

## P3 — polish

1. **Crossfade shows two sets of burrows**: `phone_crossfade_sheet.png` (0.15–0.6 s: riverbank and bamboo pots overlap). Use `1 - this.vis.fade` squared for the previous layers (`render.js:228,240`) or shorten the fade to 0.6 s (`render.js:205` `/ 0.9` → `/ 0.6`).
2. **Zippy's antenna glow touches the badge ring**: `desk_play_L0.png`. Home y 112 → 120 (`render.js:10` HOME and the world's home y), or shrink the antenna glow radius `2.6` → `2.0` (`render.js:354`).
3. **Game over keeps the canvas HUD visible**, and the badge peeks above the panel: `phone_over.png`. Skip `_hud` when `mode === 'over'` (`render.js:246`).
4. **Toast covers the "Change Pictures" title**: `phone_custom_filled.png`. `style.css:271`: top → `calc(env(safe-area-inset-top,0px) + 4px)` and `font-size:13px`, or show it at the bottom over the Done row's left side.
5. **Custom hero/friend preview is tiny** in its card (`phone_custom_filled.png`: a 60 px circle in a wide strip). `.slot .prev img{height:100%;width:auto}`.
6. **Custom friends have no expression change**, so booped and wow look identical. Add a tiny tilt (`booped`: rotate ±0.15 rad wobble; `wow`: grey 20% overlay) in `_critters` when `customC`.
7. **Rotate prompt** uses regular-weight text and the canvas shows through the phone glyph: `portrait_rotate_prompt.png`. `#rotate p{font-weight:800}`, `#rotate .phone{background:rgba(16,50,30,.95)}` (`style.css:351-353`).
8. **Portrait play is very small** (critters ≈ 45 css px): `portrait_notch_hud.png`. If upright play stays allowed, crop the stage to x 70–890 in portrait (`cssScale = Math.min(W / 820, H / LH)`, `ox` centred on x 480), which makes everything 17% bigger. All burrows and the frame edges stay inside.
9. **Canopy/Ruins middle column is a vertical stack** (back/mid/front at x 480): even after P1-1 it reads as one tall pile. Consider mid-row x 250/480/710 → 260/470/700 and back y 280 → 272 (`World.LAYOUTS[2..3]`).

## Checked and fine
- Title, How to Play, Settings, Change Pictures, Pause and Game Over fit and are readable on all four viewports. Buttons are ≥ 44 px on touch, and the short-landscape Settings fits without scrolling (`phone_settings.png`).
- Canvas HUD (score pill, leaves, badge with progress ring) is legible at phone size and stays clear of Zippy's home and of the DOM buttons in landscape.
- Hit zones (`desk_debug_L*.png`) match the visible friends, and the nearest-zone rule handles the overlaps.
- Flight arc, squash on boop, return and star-flyer to the badge are smooth (`desk_zippy_flight_sheet.png`). Retargeting mid-flight is smooth (`desk_zippy_retarget_sheet.png`).
- The Easy halo around matching friends is visible without hiding the star.
- Custom background photos cover the screen with soft burrow shadows. Custom pictures load and save with no errors.
