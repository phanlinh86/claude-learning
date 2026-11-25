# Visual QA — Mossy's Egg Grove (2026-11-25)

Art-director review for a 3–7-year-old audience. Report only: nothing in `game/` was changed.

**How it was captured:** `node tests/visual/capture.js` (about 100 s; `ONLY=screens,seasons,wind,events,views,custom` runs a subset). It serves `game/` on a local http server and opens Playwright Chromium at desk 960×540, iPad 1366×1024 (touch), iPhone portrait 390×844 and landscape 844×390 (touch, simulated notch and home-bar insets, shown as faint magenta strips). The sim is frozen with `setSpeed(0)` and advanced by hand, so the contact sheets are exactly 80 ms apart (`sheet_drop` uses 50 ms). Output goes to `tests/out/visual/`: 128 PNGs plus `metrics.json`. There were no console errors.

**Measured (`metrics.json`)**
- Jitter: a settled half-full nest moved **0.000 u** and **0 rad** over 1 s. Rock steady, no fix needed.
- Egg vs nest back (#4f3c2f) contrast: Dewdrop 7.8, Sky 5.4, Berry 5.1, Moon 4.4, Fern 5.2, Sunset 4.2, **Starry 2.3** (a dark egg on a dark back; its white stars and outline save it, see P3-6), Golden 6.2.
- Mossy against the sky behind him: body #6cbb4a gives only 1.2 (spring) / 1.3 (summer) / 2.5 (autumn) / 1.6 (winter). The #336628 outline gives 3.5 / 3.8 / **1.2 (autumn)** / 2.6. He still reads in every season (see `read_*_mossy.png`) because of his dark eyes and belly. Autumn is the weakest (P3-7).

What works well: the egg art is charming and clearly different by pattern + size (it survives the deuteranopia/protanopia simulation). The merge ring + sparkles read well. The dotted guide bends visibly in a gust. The season banner is legible. Crossfades are smooth. The nest back is calm and makes pale eggs pop.

---

## P1: fix before shipping

### P1-1 iPhone portrait: during a LEFT gust the windsock covers the Next bubble
- Screenshot: `wind_phoneP_gust_left.png` (also `custom_phoneP_photo_play.png` and every portrait gust). The flipped sock is drawn right over the "Next" egg, so the child cannot see the next egg exactly when the wind makes aiming hard. On iPhone, the main device.
- Cause: `game/js/render.js:329`, where the portrait sock sits at `VW/2 + 70` (x 350 of 560). The sock is W = 1.9·u·1.45·0.75 ≈ 108 px and flips leftwards to x ≈ 230. The Next bubble is at x 226 ± 54.
- Fix (render.js:329): `sock: [this.VW - I.right - 112, y + 4, 1.45]`. The pole lands at ≈ 415 px, a left sock ends at ≈ 322 (clear of the bubble's right edge at 280), and a right sock ends at ≈ 508 (< 560). Also draw a backing badge so the pole no longer "stands on air" (see P2-1).

### P1-2 Hatch (the biggest reward) is muddled: text sits on the baby, there's no crack beat, and the baby flies under the HUD
- Screenshots: `hatch_frame12.png` ("Hatched!·100", the baby dragon covers "+"), `sheet_hatch.png` (the gold eggs vanish between 0 and 80 ms; from 2320 to 2720 ms the baby slides *under* the score card).
- Causes:
  - render.js:442 puts the text at `Y − 1.6u`, and the baby path (render.js:531) starts at `h.y − 0.6u` and bobs ±0.3 u, so they overlap for about 1.3 s.
  - `egg_crack.svg` is loaded (assets.js:10) but never drawn. DESIGN §5 asks for a 0.4 s cracking pause.
  - render.js:505 draws the hatches, then render.js:509 draws the score on top.
  - The baby is only 1.8 u (≈ 64 px on 960×540).
- Fix:
  1. render.js:439: `this.hatches.push({ x: X, y: Y, t: -0.45 });` and move the `wx.burst('hatch')`, `flash` and `shake` lines into `update()` at the moment `h.t` crosses 0.
  2. In `drawHatches` (render.js:521+), for `t < 0` draw the egg at the start of both branches: `this.drawEgg(g, 8, h.x + Math.sin(this.time*60)*2*this.sc, h.y, 2.1, Math.sin(this.time*40)*0.05, 1 + 0.06*(1 + t/0.45)); this.drawSpr(g, 'egg_crack', h.x, h.y, 2*2.1*EGG_K*u, 2*2.1*EGG_K*u, 0.5, 0.5); continue;`
  3. Text: render.js:442 → `this.text('Hatched! +100', X, Math.min(this.sy(0.8), Y + 1.7 * u), '#ffe08a', 1.5, 2)` (below the baby, which flies up and away).
  4. Baby size: render.js:530 `1.8 * u` → `2.6 * u`.
  5. Z-order: move `this.drawHatches(g, false);` from render.js:505 to after `this.drawScore(g); this.drawBanner(g);` at render.js:509 (inside the `mode !== 'title'` block, plus an `else this.drawHatches(g, false)` for the title demo). The baby and the rescue fairy then fly over the HUD.

---

## P2: noticeably hurts clarity or polish

### P2-1 The windsock (the game's twist) is too small and blends into the scenery; its warning is nearly invisible
- Screenshots: `wind_desk_warn_right.png`, `wind_phoneL_gust_right.png`, `view_ipad_winter.png`, `season_1_summer_half.png`, `wind_phoneP_warn_right.png`.
- Landscape: the sock stands on the ground among the lantern posts and mushroom houses of the near layer (`render.js:334`, foot at `groundPx + 0.15u`). It is about 60 px wide in the warning state (flutter 0.45, render.js:369). The warning arrow pulses down to alpha 0.1 (render.js:374).
- Portrait: a pole floating in the sky with nothing under it.
- Fix:
  - Landscape (render.js:334): `sock: [rcx + 0.4 * u * sw, this.sy(5.4), sw]`. That is in the right panel under the score card / fairy row (at 960×540: centre y ≈ 325; the score block ends at ≈ 200).
  - Both layouts, at the start of `drawSock`, draw a badge behind the sock: `g.fillStyle='rgba(15,35,28,0.42)'; this._pill(g, x - W*0.62, y - H*0.75, W*1.24, H*1.5)` with radius 18·sc (use roundRect with r = 18*this.sc, not the pill radius).
  - render.js:369: warning flutter `0.45 + 0.2·sin` → `0.7 + 0.15 * Math.sin(this.time * 22)`.
  - render.js:374: warning alpha `0.55 + 0.45·sin` → `0.75 + 0.25 * Math.sin(this.time * 12)`. In landscape, put the arrow BELOW the sock as portrait does (`ay = y + H*0.5 + 22*this.sc`) and the label at `ay + 28*this.sc`.
  - render.js:377: arrow half-length `26*sc` → `38*sc`, half-height 12 → 16.

### P2-2 Phone landscape: the score card collides with the Pause button; HUD text is ~9 css px on phones
- Screenshot: `view_phoneL_summer.png` (the lower rim of the pause button overlaps the top of the score pill by about 3 css px). In all `view_phone*` shots, "best 0" is 13 logical px × 0.72 ≈ 9.4 css px, and the season name is ≈ 11 css px.
- Cause: render.js:393 `y = Math.max(I.top + 64, …)` assumes a 54 logical px button row. On a phone the DOM buttons are 44 css px = 61 logical px (+10 top).
- Fix:
  - In `resize()` (render.js:95), after positioning the hud: `this.hudBottom = I.top + 10 + 48 / S;` (44 px button + 4 px slack).
  - render.js:393: `y = Math.max(this.hudBottom + 8, this.sy(12.9))`.
  - Scale the score card: `const z = clamp(0.95 / this.cssScale, 1, 1.4)`. Multiply W (220), the pill heights (46, 40), the row offsets (25, 54, 13, 24, 62) and the font sizes (30, 13, 15) by `z`, and make "best" `800 ${Math.round(14*z)}px` with fill `rgba(255,255,255,0.85)`.

### P2-3 Event texts sit on Mossy's held egg, and the coral warning text sits on coral eggs
- Screenshots: `full_warning.png` ("Uh-oh, too high!" crosses the held egg and the Sunset eggs, #ffb3a6 on #f4885c), `rescue_frame_mid.png` ("Fairy rescue!" covers the held egg and the fairy).
- Cause: render.js:453 uses `sy(DANGER_Y + 0.9)` (y 10.7) and render.js:449 uses `sy(10.6)`. The held egg spans y 10.5–12.1.
- Fix:
  - Draw these two texts with a backing pill. Add a `pill` flag to `text()`, and in `drawJuice` before `strokeText`: `const tw = g.measureText(t.s).width; g.fillStyle='rgba(40,20,25,0.72)'; this._pill(g, t.x - tw/2 - 14, y - 20*this.sc, tw + 28, 40*this.sc); g.fill();`
  - Move warnOn to `this.sy((C().DANGER_Y||9.8) - 1.3)` and rescue to `this.sy(6.2)`.
  - Warning colour `#ffb3a6` → `#ffd6cf` (it stays distinct from Sunset on its dark pill).

### P2-4 Rescue reads backwards: eggs vanish first, then a tiny fairy arrives
- Screenshot: `sheet_rescue.png`. At 1200 ms the 4 top eggs blink out with no effect. The fairy only arrives 0.6 s later from off-screen and is about 30 px visible (1.4 u sprite, mostly wing). The white `rescue` glows it drops leave a fog over the Next bubble (1360–2000 ms).
- Fix:
  - In `drawEggs` (render.js:257) keep `this._eggPos = new Map(id → {x,y,kind,r})`.
  - On `rescue` (render.js:446): for each `e.ids` push a ghost `{x,y,kind,r,t:0}` that is drawn for 0.5 s rising 1 u with alpha `1 − t/0.5` and scale `1 + 0.3t`, plus `wx.burst('merge', gx, gy, 8, {color:'#e8d4ff'})` at each.
  - Fairy: start at `f.x − 3u` (not −1.5 u off-screen), fly in over 0.25 s (render.js:537 `0.6` → `0.25`), size `1.4*u` → `2.4*u` (render.js:539).
  - Trail: render.js:540 `Math.random() < 0.5` → `< 0.2`.

### P2-5 How to Play: the icons are clipped and tiny on phones
- Screenshots: `screen_phoneL_how.png`, `screen_phoneP_how.png`. The 3-egg row is cut at both sides (half eggs), Mossy is ≈ 20 css px, and the windsock and vine icons are hairlines.
- Cause: `game/css/style.css:280` (`.how-ico{flex:0 0 8u; overflow:hidden}`) fights with :316–318 and :338–339 / :372–373.
- Fix: append at the end of style.css:
  ```css
  #scrHow .how-ico{flex:0 0 calc(var(--u)*11);overflow:visible;gap:2px}
  #scrHow .how-ico img{width:calc(var(--u)*4.6)}
  #scrHow .how-ico img:nth-last-child(3):first-child,#scrHow .how-ico img:nth-last-child(3):first-child~img{width:calc(var(--u)*3.4)}
  #scrHow .how-ico img.wide{width:calc(var(--u)*6)}
  #scrHow .how-ico img:only-child{width:calc(var(--u)*7.5)}
  ```

### P2-6 Title screen: the demo Mossy, egg and drop guide collide with the logo and the buttons
- Screenshots: `screen_desk_title.png` (Mossy + egg touch "Egg" and the icon), `screen_phoneL_title.png` (the held egg sits behind the "g" of Egg), `screen_phoneP_title.png` (a lone windsock floats in the sky above the logo).
- Fix:
  - render.js:495: `if (mode !== 'title') this.drawGuide(g, a);`
  - render.js:501: `if (mode !== 'title') this.drawSock(g, P.sock);`
  - style.css:58: `.title-wrap{…;background:rgba(20,45,35,.42);border-radius:24px;padding:12px 22px 14px}`. This gives the logo and tagline a calm card over the busy demo.

### P2-7 Custom photo eggs lose their kind pips, so kinds differ only by ring colour
- Screenshots: `custom_desk_photo_zoom.png`, `custom_phoneP_photo_play.png`. The white pips (render.js:247, at radius 0.78 R) fall under the white sticker border (sticker ≈ 0.85 R). The drawing version shows them (`custom_desk_drawing_zoom.png`). This breaks the CLAUDE.md rule "pattern + size, not only hue".
- Fix:
  - render.js:242: fit `R * 1.7` → `R * 1.56`, so the sticker ends at 0.78 R.
  - render.js:247: pip radius `R*0.78` → `R*0.93` (on the colour ring), dot size `Math.max(2, R*0.075)`, and add `g.strokeStyle='rgba(30,30,40,0.55)'; g.lineWidth=1; g.stroke();` after each fill.
  - Pip spacing 0.32 rad → `Math.min(0.32, 2.4 / Math.max(1, kind - 1))` so 8 pips still fit on the top arc.

---

## P3: nice to have

1. **Egg ladder has no backing.** Pink and red ladder eggs sit on the red mushroom roofs, and unreached slots (dark ovals at alpha 0.45) vanish on dark ground (`view_ipad_winter.png`, `screen_ipad_play_hint.png`, `wind_phoneP_warn_right.png`). In `drawLadder` (render.js:346) draw a pill `rgba(15,35,28,0.38)`, `x ± 0.75u`, from `y0 − 0.6u` to `y1 + 0.6u` (portrait: `x0 − 18 … x1 + 18`, height `h + 12`). For unreached slots use fill `rgba(255,255,255,0.12)` + stroke `rgba(255,255,255,0.55)` at 2 px (render.js:356).
2. **Portrait ground pebbles look like ladder slots.** The second ground band (render.js:186) draws big grey pebbles behind the ladder (`view_phoneP_spring.png`). Under the ladder, draw only the plain `pal.ground` fill, or draw the repeated rows at alpha 0.5.
3. **The HUD fairy "rescues left" icon** is 28 logical px (≈ 20 css px on a phone) and reads as a bug (`read_*_hud.png`). render.js:412–413: size 28 → 36, spacing 30 → 38, and add a small backing `rgba(15,35,28,0.4)` pill behind the row.
4. **Nest base cropped at the bottom** on desk and iPad (`season_*_half.png`, `view_ipad_*`). The base needs 1.3 u under the floor and gets 0.6 u. render.js:87–88: `unit = Math.min(v.VH / 15.7, v.VW / 22)`, `groundPx = Math.round(v.VH - 1.25 * this.unit - …)`. Phone landscape ignores `I.bottom` (the home bar covers the floor lip and the bottom ladder egg in `view_phoneL_*`): subtract `I.bottom * 0.6` there.
5. **The moon peeks out from behind the score card** in autumn and winter (`season_2_autumn_half.png`, `view_ipad_winter.png`). Either move the moon in `levels/autumn|winter/sky.svg` to x ≈ 180–220 (the left panel's sky), or accept it.
6. **Starry egg (kind 7) on the dark nest back is only 2.3:1.** Raise its outline to `#9fb0ff` at 4 px viewBox, or lighten its body to `#6a80e0` (keep the star sprinkles) in `tools/art-characters/gen.js`.
7. **Mossy vs autumn sky:** his outline (#336628) is 1.2:1 against #6c5f84. Add a 2 px `rgba(255,255,255,0.35)` rim stroke in the mossy_* generator, or brighten the autumn sky top behind the nest (`#5a4a6e` → `#6d5c82`).
8. **CVD:** Sunset, Fern and Golden all collapse to olive (`cvd_deut_*.png`, `cvd_prot_*.png`). In the pile the patterns separate them. In the 30 px ladder and the Next bubble, Sunset's stripes are too faint, so make them `#fff3e6` at 1.4× width. The Next bubble shrinks big eggs to one size (render.js:343), so size gives no cue there. Consider showing the kind's pip count under the bubble.
9. **Change Pictures (portrait)** has an uneven grid (3 / 2 / 1 cards) and "Blossom Gl…" is truncated (`screen_phoneP_pictures.png`). Add `@media (max-aspect-ratio:1/1){ .slot-grid{grid-template-columns:repeat(2,1fr)} .slot h3{font-size:max(14px,calc(var(--u)*1.5));white-space:normal} }`. The disabled "Reset" (white on #c9c3b8) is ≈ 1.6:1, so use text `#6f6a62`.
10. **The combo text** is 27 px pale peach at a fixed y 8.6 and runs over the guide dots (`combo_injected.png`). For pre-readers make it 1.4× (render.js:436, size `1.15` → `1.45`), and anchor it at the merge position (`Y − r − 0.8u`) rather than mid-nest.
11. **Game over "NEW!" badge** is still faint at 0.5 s on desk (`screen_desk_over.png`) but fully visible on the phone (`screen_phoneP_over.png`). This is just its intro animation, so no action, unless you want it to start at opacity 0.6.
12. **Season crossfade** (`sheet_levelup.png`) draws the whole previous season (sky included) at 1 − t, so the scene looks foggy around 0.5 s. That's acceptable. To make it crisper, crossfade only the far/near layers and blend the sky gradient separately.
