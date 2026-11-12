# Visual QA — Biscuit's Kitchen Flight (2026-11-12)

Report only; no game files were changed.
Capture script: `tests/visual/capture.js` (run `node tests/visual/capture.js`, or `ONLY=motion|screens|zones|custom|hud|kettle`).
Screenshots: `tests/out/visual/` (gitignored). Sizes: 1280×720 (`desk`), iPhone 13 landscape (`iphone`), iPad Pro 11 landscape (`ipadL`) and portrait (`ipadP`), iPhone 13 portrait for the rotate card.
Motion sheets are frame-exact: the loop is frozen (`setSpeed(0)`) and `Game.step(1/120)` is run by hand, so the 50 ms gaps are real game time.

## Summary
The art is warm, consistent and kid-friendly. Biscuit (teal, red propeller) reads clearly in all four zones, even with deuteranopia/protanopia simulated (he turns grey-blue but keeps his dark outline). Leaves are easy to tell apart from the herb pots on the sills: they are larger, brighter, rotate, have a pale vein, and glow at night. The night is dim and blue but still readable and cozy, not scary. The ready prompt, the zone banner and the score never cross Biscuit's column at any size. `overlap.json` checks this numerically, and every test came back false.

The remaining problems are mostly about **feedback legibility**: text sits on top of Biscuit when he bumps; steam and wind are close to invisible; the night obstacle rims look like debug boxes. The other problems are **layout on iPad portrait and in the iPhone Change Pictures screen**.

---

## P1: fix before shipping

### P1-1. "Bonk!" and "Boing!" are drawn right on top of Biscuit's face
- Screenshots: `motion_counter.png` (every frame from 50 to 600 ms), `motion_bump.png` (50 to 550 ms).
- The bump text starts at `e.y − 40`, which is Biscuit's eyes, and floats up only 30 px. For about 0.9 s the child cannot see Biscuit's face at the moment they most need to see what happened. This breaks the rule that overlays never cover Biscuit.
- **Fix** in `game/js/render.js:124`: anchor the text above the propeller and a little ahead of him:
  ```js
  this.texts.push({ x: w.pup.x + 30, y: w.pup.y - 105, text: …, t: 0, life: 0.9, col: '#e5483c', size: 32 });
  ```
  At this position the rising text stays above the hub (sprite top = pup.y − 64, propeller about −58). Clamp it with `Math.max(-this.oy + 90, …)` so it stays below the HUD when Biscuit is at the ceiling.

### P1-2. iPad portrait: about 55% of the screen is two flat bands of colour
- Screenshots: `scr_ipadP_title.png`, `zone3_ipadP_t35.png`, `scr_ipadP_over.png`.
- The contain-fit leaves about 600 px above and 600 px below the kitchen (at 1668×2388). They are filled with plain `#e8d7a2` (render.js:192) and `#7f9a6c` (render.js:226). The result looks unfinished, and the night overlay greys the bands out. The iPad is a target device.
- **Fix** (render.js:191–193 and 226):
  - **Top band:** tile the calm wallpaper strip instead of a flat colour. Use `room_wall` source rows y 60–110 (the leaf-sprig pattern, with no rail or window), repeated upward with the same parallax as `PAR.wall`. Then draw a 6 px `#7a4222` crown moulding at the boundary (`y = -1 … 5` logical).
  - **Bottom band:** repeat the drawer row of `room_counter` (source y 30–70) downward in steps of 40 logical px, with `globalAlpha 1`. Then fade to `#4f6644` using a 120 px vertical gradient.
  - In portrait, also move the stage down by `this.oy * 0.35` (set `this.oy = (this.VH - LH) * 0.65 / 1` in `resize`, render.js:53). This puts more wall above the stage and fewer drawers below, and places Biscuit closer to the thumb.

### P1-3. iPhone landscape "Change Pictures": Done and Reset all are cut off, and the wall card overflows
- Screenshot: `scr_iphone_custom.png`.
- The grid wraps into 2 + 1 rows. The Biscuit and Leaves cards are wide because the `.shape` buttons use nowrap, so the panel's bottom buttons are clipped by the 94 vh max height. On the Kitchen wall card, Choose… and Reset stick out past the card's left and right edges. A child will not discover that the panel scrolls.
- **Fix** in `game/css/style.css`, inside `@media (max-height:430px)` (style.css:234–239), add:
  ```css
  .slot-grid{grid-template-columns:repeat(3,minmax(0,1fr)) !important}
  .slot,.slot:nth-child(n+4){grid-column:auto !important}
  .slot .shape button{padding:2px 6px;font-size:12px}
  .slot .btns .btn{padding-left:8px;padding-right:8px}
  #scrCustom .menu{margin-top:6px}
  ```
  The three cards then sit on one row, and Done is fully visible at a height of 390 px.

---

## P2: should fix

### P2-1. Steam is almost invisible, and the lift zone is not where the puffs are
- Screenshots: `motion_kettle.png`, `zone3_desk_t50.png`.
- `particles/steam.svg` is pure white at 0.35–0.75 opacity, and the column gradient is `rgba(255,255,255,.22)` (render.js:335). On the cream wall (#e8d7a2) neither is visible. The puffs come from the spout, `o.x + 50, COUNTER_Y − 82` (render.js:147), but the world's lift column is centred on `o.x` (from `COUNTER_Y − 120` up, ±40 px). The child sees steam on the right and gets lifted to its left.
- **Fix:**
  - render.js:147: emit puffs at `wx.steam(o.x + (Math.random() * 24 - 12), COUNTER_Y - 122)`, centred on the lid. Keep one puff in four at the spout for charm.
  - `steam.svg`: change the stop colours to `#eef6fb`, then add an outer ring circle with `fill="none" stroke="#9db8c9" stroke-opacity=".45" stroke-width="2"`.
  - render.js:335: make the column `rgba(225,240,250,.38)` → `rgba(225,240,250,0)` and add three small chevrons `^` that move upward (`#9db8c9`, alpha .5, 10 px, 2.5 px stroke) at `x`, spaced 60 px apart and scrolling up at 40 px/s.

### P2-2. Wind gust: the arrow is small and pale, and the wind streaks cannot be seen
- Screenshots: `motion_gust.png`, `gust_peak.png`.
- The arrow (render.js:450–451) is white with a `#5c8db8` 4 px stroke, about 36×42 px. It usually sits over the pink curtain or the cream wall, so it is easy to miss during the 1 s warning. The streaks (`particles/wind.svg`, white with a 3 px stroke, alpha 0.35–0.6, weather.js:163–165) do not show on the wall at all. The curtains sway well.
- **Fix:**
  - render.js:448: add `g.scale(1.6, 1.6)` after translate, and use `g.strokeStyle = '#1d6763'; g.lineWidth = 3.5`.
  - Before filling, add `g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 6 * this.px`, then reset it.
  - render.js:446: move the arrow to `x = w.pup.x + 110`.
  - `wind.svg`: change the gradient stop colour to `#6f9fc0`, at opacity 0.9 and 0.6, with stroke-width 4.
  - weather.js:165: set `a0: r.range(0.55, 0.8)`.

### P2-3. Night obstacle rims look like square debug or selection boxes
- Screenshots: `zone3_desk_t35.png`, `zone3_iphone_t35.png`, `xfade_2to3.png`, `custom_wall_zone3.png`.
- render.js:394–404 strokes the hit rects as rounded rectangles, so jars, mugs and kettles get a pale box around them that does not follow their shape.
- **Fix:** delete the hit-shape stroke loop. Instead, after `_night`'s darkness pass, redraw each on-screen stack, kettle and hanger sprite once with a silhouette glow:
  ```js
  g.shadowColor = 'rgba(255,230,170,' + (0.55 * k) + ')';
  g.shadowBlur = 10 * this.px;
  g.globalAlpha = 0.35 * k;
  // _stack/_kettle/_hanger draw calls
  g.shadowBlur = 0;
  g.globalAlpha = 1;
  ```
  The glow follows the sprite's alpha edge.

### P2-4. "+1" texts stack into "+11" or "+1+1"
- Screenshots: `zone0_desk_t25.png` (reads "+11"), `zone3_iphone_t35.png`, `motion_kettle.png` (400–800 ms).
- Leaves in an arc are caught 2–3 frames apart, and each `+1` is pushed at `e.y − 26` with almost the same x (render.js:115). A child reads the overlapping texts as "11".
- **Fix** (render.js:115): before pushing, look for a live `+N` text with `t < 0.35`. If one exists, replace it with `text = '+' + (n + 1)`, reset `t = 0`, and bump `size` by 2 (max 38). Otherwise push a new one at `y: e.y − 40`.

### P2-5. The flap ring sits over Biscuit's eye
- Screenshot: `motion_puff.png` (0–200 ms); also visible in the iPhone night shot.
- The ring is a circle at `(e.x − 8, e.y − 52)` that grows from r 10 to 36 (render.js:112 and 428). It sweeps across the face and reads as a white monocle.
- **Fix:** make it a flat downwash ellipse under the propeller. In `_juice`, use `g.ellipse(r.x, r.y, (r.r + k*26) * 1.7, (r.r + k*26) * 0.35, 0, 0, TAU)` for rings tagged `flat: true`. At render.js:112, push `{ x: e.x, y: e.y - 44, …, flat: true, col: '255,255,255', w: 3 }`.

### P2-6. The game-over panel hides Biscuit's nap and the "Zzz…"
- Screenshots: `motion_powerdown.png`, `scr_iphone_over.png`, `scr_desk_over.png`.
- The panel is centred, and Biscuit (x = 260 of 960, about 27–31% of the screen width) lies under its left edge. The cute "powered down" pose is never seen.
- **Fix:**
  - `game/css/style.css`: add `#scrOver{justify-content:flex-end;padding-right:max(3vw, env(safe-area-inset-right))}` and `#scrOver .over-panel{max-width:min(62vw, 720px)}` for landscape. Keep it centred in `@media (orientation:portrait)`.
  - Optionally delay `UI.showGameOver` by 0.6 s after `gameOver` (main.js `deadT > 0.5` → `> 1.1`) so the nap is seen first.

### P2-7. A custom wall is a still photo: no scrolling and no weather
- Screenshots: `custom_play_wall_cut.png`, `custom_wall_zone1.png`–`custom_wall_zone3.png`.
- `_customWall` (render.js:96–106) draws one cover-cropped image at a fixed position (render.js:197). With a custom wall only the counter moves, so the sense of flying is weaker, and rain, snow and outside leaves (the `outside` layer) disappear.
- **Fix:**
  - Scale the picture to height 540 (logical) and tile it horizontally with parallax `PAR.wall` (0.35), flipping every second tile with `scale(-1,1)` so the seams match.
  - Then draw `this._particles('outside')` over it at `globalAlpha 0.5`, so rain and snow still show.

### P2-8. HUD day bar and batteries have no backing and get lost on busy or dark wall areas
- Screenshots: `scr_desk_ready.png` (the bar runs over the clock), `zone2_desk_t25.png` (over the jar shelf), `hud_iphone_night.png` (empty batteries nearly vanish).
- **Fix** (render.js:458–476):
  - Before the batteries, draw a pill `roundRect(left - 8, top - 6, 176, 42, 21)` with fill `rgba(255,247,230,.72)` and stroke `rgba(122,66,34,.35)` 2 px.
  - Draw the same kind of pill behind the day bar: `roundRect(bx - 14, by - 7, bw + 28, 22, 11)`.
  - Make the inactive segments `globalAlpha 0.7` (now 0.45).

### P2-9. Page error on iPad landscape: `_bgCache` is undefined
- Seen once in the capture run: `TypeError: Cannot read properties of undefined (reading 'outside_rainy@1.0000')`.
- `prewarm()` can run from `setLevel` before the first `resize()` creates `this._bgCache` (render.js:59). In that case `_layer` (render.js:81) throws.
- **Fix:** add `this._bgCache = {};` to the constructor (render.js:39).

---

## P3: polish

1. **Tile seams.** A 1 px vertical line shows in the drawers and on the wall at non-integer scales (`zone3_ipadP_t35.png` at x≈678 in the drawers; the iPhone night shot at x≈1950). `_tile` (render.js:160–163) rounds each tile's x on its own. Fix: step by the layer's device width: `for (let X = Math.round((start + this.ox) * p); X < this.c.width; X += L.width) g.drawImage(L, X, yy);`.
2. **Hurt blink against stacks.** At 0.45 alpha (render.js:346), Biscuit almost vanishes over a blue bowl (`motion_bump_blink.png`). Fix: use 0.6, and draw a 2 px white rim around the hit circle during the blink.
3. **Bay leaf under deuteranopia.** The bay leaf (`#78c23c`) becomes pale khaki and is the weakest of the three leaves on the cream wall (`cb_deutan_zone2_t25.png`). Fix: darken it to `#5fae2e`/`#4a8f22` with outline `#2f6a1a` in `leaf_bay.svg`. The leaf glow (render.js:392) could also run at 0.12 alpha in daytime, not only at night.
4. **Batteries under colour-blind simulation.** Full and empty stay distinguishable by fill pattern in both simulations (`cb_protan_hud_desk.png`, `cb_deutan_hud_desk.png`). OK. At night, the empty battery `#8f99a4`/`#dde2e7` is low contrast. The P2-8 pill fixes this.
5. **How to Play wind icon is invisible.** The 4th card uses `particles/wind.svg`, which is white on cream (`scr_iphone_how.png`). Fix: use an inline arrow SVG (`#1d6763`), or fix `wind.svg` as in P2-2. Also, the pup icon in card 1 is noticeably smaller than the others. Give it `.how-ico img:first-child{width:calc(var(--u)*7)}`.
6. **Propeller on a custom photo pup is tiny.** It is 34×10 px on a 96 px sticker (render.js:353–356, `custom_play_photo_pup.png`). Fix: blade `rx = 46 * |cos|`, `ry = 7`, hub r 6, mast 6×16.
7. **Ready screen: "Sunny Morning" banner over the wall clock.** On desktop and iPhone the banner text crosses the clock (`scr_desk_ready.png`, `scr_iphone_ready.png`). It is readable thanks to the white outline, but busy. Fix: move the banner to y = 170 (render.js:485), or give it a soft pill `rgba(255,250,240,.75)`.
8. **Game-over stats alignment.** The "Score" and "Best" labels sit about 10 px lower than their big numbers (`scr_ipadP_over.png`). Fix: `.sc{align-items:center}` in style.css.

## What looked good (keep)
- Biscuit is clearly visible against all four zones. Under the night lamp he gets his own 80 px light hole, so he never disappears.
- Leaves versus sill herb pots: the pots are small, grey or terracotta, and static, with dull sage foliage. The leaves are about twice as large, saturated, spinning, and have a pale vein. They are never confused, including in the deuteranopia and protanopia simulations.
- The zone crossfade (`xfade_0to1.png`, `xfade_2to3.png`) is smooth, and the darkness ramps gradually.
- The puff squash and tilt, and the propeller frames, read well (`motion_puff.png`). Counter "Boing" bounce physics look soft. The power-down pose is cute, once it is visible (P2-6).
- The rotate card and the pause screen are fine at all sizes, and touch targets are at least 44 px.
