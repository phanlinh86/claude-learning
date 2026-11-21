# Visual QA / art direction: Bristle's Moon Pop

Date: 2026-11-21. This review only reports problems. No game files were edited.

**How to reproduce:** run `node tests/visual/capture.js [screens zones crossfade motion seam custom]`, `node tests/visual/bonk_seq.js`, `node tests/visual/skate_seq.js` and `node tests/visual/events_seq.js`. All screenshots go to `tests/out/visual/`.

**What was covered:** every screen (title, How to Play, Settings, Change Pictures, pause, game over, Score Card) at five sizes: 960×540, 1280×720, iPhone landscape 844×390, iPhone portrait 390×844 and iPad 1024×768 (the phone and iPad runs use touch). The four zones were checked on desktop, phone and iPad, along with a test lineup on every sky with deuteranopia, protanopia and greyscale versions. Other checks:
- the level crossfade and banner
- contact sheets for jump → ball → air pop → chain → landing, skate and push, crater puff → emerge, escape, magnet, pebble shadow → bonk, and box full → cleared
- the sky seam on wide screens, measured column by column
- custom photos used for the hero and the cupcake

No page errors were logged in any run.

**What works well:**
- The bubble rim reads on noon (`noon_rim_2x.png`).
- Under colour-blind simulation you can still tell a cupcake bubble from a magnet bubble from a pebble, because their shapes differ (the horseshoe and the extra ring) (`lineup_deut/prot/grey.png`).
- The zone banner never covers Bristle.
- The crossfade is smooth.
- The HUD reads on every sky.
- Custom pictures show up correctly in bubbles and on Bristle.
- Bristle looks cute and consistent in every frame.

## P1: fix before shipping

1. **The pebble warning ring is hidden under Bristle exactly when the pebble is aimed at him.** See `m_bonk2.png`: before the hit, only a faint coral tint shows under the board. `drawShadows()` (render.js:589-604) runs before `drawHog()` (render.js:515 vs 518), so the board and the body cover the ring. This is the only warning a child gets.
   **Fix:** move the ring stroke into a new `drawPebbleWarn()`. Call it after `this.drawHog(mode)` and before `this.drawPebbles()` at render.js:518-519. Keep only the dark ellipse fill in `drawShadows`. Also, when `Math.abs(it.lx - s.x) < 40`, draw a small bobbing down-chevron above his head at `(s.x, s.y - 62)` in `rgba(255,140,120,0.35+0.45*k)`.

2. **The board tips with the cruise lean, so one wheel floats about 7 px above the floor and the other sinks into it while he skates at a steady speed.** See `m_skate2.png`, rows 2–4. The cause is that `b.rot = s.tilt` on the floor (world.js:511), and tilt follows *velocity* (world.js:490, `tiltMax 0.2` at world.js:68). At full speed that is a constant 11° rotation about the deck centre.
   **Fix:** on the floor the board must stay flat. Change world.js:511 to `b.rot = 0;` and leave the body lean alone. Better still, lean the body with acceleration and only a little with speed: `var tt = clamp(0.06 * s.vx / c.maxSpeed + 0.12 * clamp(s.ax / 2000, -1, 1), -c.tiltMax, c.tiltMax);`. If the board should still react, give it at most ±0.03 rad and pivot it at the wheel line, not at the deck top (render.js:715).

## P2: should fix

3. **The faint 1 px vertical line on wide screens is confirmed.** See `seam_d1280w_z1.png` and `seam_zoom_noon_right.png`. On noon at y 100, the column at x = SX+959 has a summed brightness of 605 against about 563 for its neighbours. The cause is render.js:350: the averaged edge column is stretched from `dx + sw - 1`, which paints over the last real sky column. The 96 px average includes the noon sun, so that column comes out brighter. The feather at render.js:365 starts at `dx + sw`, so it never covers that column. Line 349 has the same off-by-one on the left (`dx + 1` wide).
   **Fix:**
   ```js
   g.drawImage(col(0), 0, 0, 1, sh, 0, dy, dx, sh);
   g.drawImage(col(sw - Math.round(96 * this.px)), 0, 0, 1, sh, dx + sw, dy, c.width - dx - sw, sh);
   ```

4. **On iPad and in portrait there is a horizontal seam along the top edge of the scene.** See `zone0_ipad.png` and `scr_play_ipad.png`: a straight line across the full width at screen y ≈ 192, which is scene y = 0. render.js:369-372 averages six rows down to **one** 1×1 colour. The real sky's top row changes from left to right (glow and haze), so a flat band meets it with a hard edge.
   **Fix:** stretch the real top row instead of averaging it, then blend `skyTop` in over it:
   ```js
   g.drawImage(c, 0, dy + 2, c.width, 1, 0, 0, c.width, dy + 2);
   const gr = g.createLinearGradient(0, 0, 0, dy + 2);
   gr.addColorStop(0, pal.skyTop);
   gr.addColorStop(1, 'rgba(0,0,0,0)');  // fade to transparent
   ```
   Also draw a 40 px feather at the join: copy the sprite's top 40 px over `dy..dy+40` with a `destination-in` vertical alpha ramp.

5. **During chains, popup texts pile on top of each other and on the HUD streak pill.** See `m_jump_chain.png`, rows 3–4: "Sky pop! ×3 / +50 / Chain ×3! / +40 / Chain ×2!" overlap, and "Sky pop" sits under the streak bar (y 61–85). Air popups are clamped to y ≥ 90, and labels sit 26 px above that (render.js:152-156, 160-161). `ceilY 110` (world.js:54) lets the ball's top reach y ≈ 72, behind the streak pill.
   **Fix:**
   - Make every popup's floor `py = Math.max(py, 124)` (label at `py - 26 ≥ 98`).
   - Before pushing a text, nudge it up while another live text is within 70 px in x and 30 px in y: `while (this.texts.some(t => t.life < t.max*0.6 && Math.abs(t.x-px)<70 && Math.abs(t.y-py)<30)) py += 30;` (downwards, away from the HUD).
   - Raise `ceilY` to 124.

6. **"Cupcake box full!" and "Level clear!" overlap.** See `m_boxfull2.png` at 1.25–1.5 s. The box-full text sits at y 190 for 1.6 s, and "Level clear!" appears at y 240 with a size of 46 (render.js:189, 193).
   **Fix:** in `case 'cleared'`, first run `this.texts = this.texts.filter(t => t.text !== 'Cupcake box full!');`, or move the box-full text to y 150 with `max: 1.1`.

7. **The "NEW!" badge on the game-over panel is clipped on iPhone landscape and sticks out of the stats box on desktop** (`scr_over_iphL.png`, `scr_over_d960.png`). The badge uses `right: calc(var(--u)*-3.2)` and then `-5.6` (style.css:98, 191).
   **Fix:** use `.scores{position:relative;padding-right:calc(var(--u)*4.5)}` and `.new-best{right:0;top:calc(var(--u)*-1)}`, and delete the override at line 191.

8. **The Volume "+" button runs past the settings row in portrait** (`scr_settings_iphP.png`). The CSS is in extras.js:259-262.
   **Fix:** add this rule: `'@media (max-width:480px){.set-volume input[type=range]{width:22vw}.set-volume b{min-width:2.6em}.vol-step{width:30px;height:30px;font-size:17px}.set-volume .vol-wrap{gap:4px}}'`.

9. **In portrait, the tagline pill runs edge to edge with no side margin** (`scr_title_iphP.png`, where "Skate" touches x = 0). See style.css:164.
   **Fix:** add `max-width:calc(100vw - 32px);box-sizing:border-box;border-radius:18px` and `.title-wrap{padding:0 16px}`.

10. **The toast "Picture saved on this device!" covers the "Reset all" and "Done" buttons** (`custom_screen_d960.png`). The toast is pinned 30 px from the bottom (render.js:91, style.css:145).
    **Fix:** while any `.screen.dim` is visible, show the toast at the top: in `UI.toast` set `t.style.top = '16px'; t.style.bottom = 'auto'`, and reset both when it hides.

11. **The magnet field is nearly invisible on pale skies** (`m_magnet2.png`, `m_magnet_noon.png`): a dashed ring at α 0.4, 3 px wide, with pull lines at 1.5 px and α ≤ 0.35 (render.js:664, 670-675). Only the HUD timer shows that the power-up is on.
    **Fix:**
    - Before the coloured ring, stroke the same arc in `rgba(255,255,255,0.45)` at lineWidth 6.
    - Draw the coloured ring at `globalAlpha = 0.75*fade*warn`, lineWidth 3.5.
    - Make the pull lines lineWidth 2.5 at `0.6*fade*(1-d/R)`.

12. **The crater puff telegraph is weak on dawn and noon** (`m_emerge.png`, 0–600 ms). The light-cyan glow at α 0.35–0.85 almost disappears on the pale floor (render.js:574-575). This is the cue that tells a child where to go.
    **Fix:**
    - Change the glow colour to `rgba(120,200,255,0.9)` with `globalAlpha = 0.55 + 0.45*p`.
    - Add a pulsing ring at the crater mouth: `g.strokeStyle = 'rgba(255,255,255,'+(0.5+0.5*p)+')'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y + 16, 30 + 6*pulse, 8 + 2*pulse, 0, 0, TAU); g.stroke();`

13. **Colour-blind check: the coral pebble warning ring disappears on the floor** under protanopia, deuteranopia and greyscale (`lineup_deut.png`, `lineup_grey.png`; render.js:602-603). It is coral on a pale grey floor.
    **Fix:** before the coral stroke, draw a dark one with the same ellipse: `rgba(50,25,80,0.5)`, `lineWidth = 4 + 1.5*k`. That gives a luminance edge on every floor. The bubbles themselves pass: magnet and cupcake are told apart by shape, and the pebble has no film.

## P3: polish

14. **Things show through behind the Score Card.** The Game Over panel's edges and the red "NEW!" badge are visible behind the modal (`scr_scorecard_d960.png`, `scr_scorecard_iphP.png`).
    **Fix:** add `'.sc-screen{z-index:60;background:rgba(20,18,50,.6)}'` to extras.js:254, or add `#scrOver .panel{visibility:hidden}` while `#scScreen` is open.

15. **The background card titles on Change Pictures are cut off** ("Sunset — Ringed …", "Night — Starry Ba…") on desktop and phone (`scr_custom_d960.png`, `scr_custom_iphP.png`; style.css:154).
    **Fix:** use the short names (Dawn / Noon / Sunset / Night) for `kind:'bg'` slot titles in ui.js:150, or set `white-space:normal;line-height:1.1` and allow 2 lines.

16. **On iPhone landscape, How to Play overflows by 36 px**, so "OK, let's pop!" starts below the fold (`scr_how_iphL.png`). It does scroll (`_bottom.png`).
    **Fix:** under `@media (max-height:420px)`: `.how-grid{gap:calc(var(--u)*1)}`, `.how p{font-size:13px;line-height:1.25}`, `.weather-line{display:none}`.

17. **The bubble film is rasterised at 60 px but drawn at 65 px on desktop and 78 px on phones**, so the rim is softly upscaled (render.js:615 vs 649).
    **Fix:** request the film at its drawn size: `A.sprite('bubble', Math.round(BUBBLE_R*phone*80/37), Math.round(BUBBLE_R*phone*80/37))`.

18. **"+1 heart" drifts up into the hearts pill** (`m_boxfull2.png` at 2 s; render.js:184).
    **Fix:** add `big: true` (so it does not drift), at `y: 96`.

19. **Pebbles near x ≈ 480 start behind the HUD score and streak bar** for about 0.5 s (`m_bonk.png`, rows 1–3). The world spawns them at `pebbleSpawnY`.
    **Fix:** spawn at y ≥ 96 (just under the HUD), or stop the planner from choosing x in 380–580 for its first 0.5 s.

20. **The title icon is a hard-edged square that bobs and tilts like a photo card** (`scr_title_*`). DESIGN §4.1 asks for a round badge.
    **Fix:** add `border-radius:50%` to `.title-icon` (style.css:59). The art already has a ring at r = 120.

21. **On short landscape screens the title menu and the "Best score" pill sit on top of the demo Bristle** (`scr_title_d960.png`, `scr_title_iphL.png`). This is cosmetic.
    **Fix (optional):** run the title demo bot with `w.cfg.xMin = 620`, so he skates in the clear right third.

22. **The "Full screen" toggle shows on iPhone** (`scr_settings_iphP.png`), where Safari has no Fullscreen API.
    **Fix:** hide `#rowFull` when `!document.fullscreenEnabled`.
