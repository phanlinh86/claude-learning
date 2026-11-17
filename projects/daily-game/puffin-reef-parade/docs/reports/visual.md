# Visual QA report: Dottie's Reef Parade (2026-11-17)

Role: visual QA / art director. Report only: no game code or assets were changed.

## How it was checked
- `node tests/visual/capture.js [screens play events bursts lineup custom]`. Viewports were changed to the ones asked for: `960` (960×540), `iphoneL` (844×390, DPR 3, touch), `iphoneP` (390×844, DPR 3, touch) and `ipad` (1024×1366, DPR 2, touch). The bonk burst now skips the bonk when the parade is too short (that was a test crash, not a game bug).
- `node tests/visual/motion.js` (new). It makes these sheets:
  - `motion_turn`: turning left↔right, driven by the arrow keys.
  - `motion_dirs`: swimming up, down and on the diagonals.
  - `motion_wiggle`: the parade wiggle.
  - `motion_particles_0..3`: the particles in each season.
  - It also measures caustic flicker and sand colour from screenshot pixels.
- `node tests/visual/scorecard.js` (new) captures the Score Card. Set `GAME_URL=http://…` to run it over HTTP. Over `file://` the canvas is tainted, so the game shows "Could not make the score card". That happens only under `file://`: Pages (https) and the exe (http) are fine.
- All screenshots are in `tests/out/visual/`. No console errors were logged in any section.

## Passes (no action)
- **Letterboxing:** no black bars at any viewport. The canvas fills the screen in portrait and landscape.
- **Dottie's orientation:** she is never upside down while swimming. The tilt is clamped to ±0.5 rad and she is mirrored for left (`motion_dirs.png`, `motion_turn.png`). The only time she goes upside down is the flip somersault (`burst_flip.png` #4–#7, about 250 ms). That is intended and reads as a playful loop.
- **Dottie at phone size:** she is about 45–56 CSS px on phones and is never clipped by the reef or the HUD (`biome*_long_*.png`).
- **Golden star:** it stands out in every season and under every colour-blind filter (bigger, with glow, a ring and a face). Spawn, scoot, blink, burrow and catch all read clearly (`burst_gold_flee/hide/join.png`, `gold_*.png`).
- **Caustics are calm.** In arena patches, the frame-to-frame mean-luminance change is at most 0.17 / 255, and the total swing over 1 s is under 0.5 / 255.

  | Season | Mean luminance | Sand RGB |
  |---|---|---|
  | Spring | 211 | 232,209,170 |
  | Summer | 237 | 218,242,233 |
  | Autumn | 163 | 198,158,100 |
  | Winter | 158 | 143,159,196 |

  There is no strobing.
- **Season banners and crossfades** are clean. The banner sits at 0.3 × VH, away from Dottie's spawn point (`banner*_*.png`, `crossfade_*.png`).
- **HUD:** the hearts plate and the outlined score are readable over every reef band (`hud_biome*_*.png`).
- **Nothing scary:** the octopus, the seal pup, the jellies and the crabs are all smiling. A bonk shows "Boing!" with a pink flash.
- **Custom pictures:**
  - A photo background, a pet-photo hero, a drawn PNG hero and a low-contrast green star PNG all render correctly (`custom_*`).
  - The kind-coloured rings keep custom stars visible on a busy photo.
- **Screens:** How to Play, Settings, Change Pictures, Pause and Game Over all fit at all four sizes, with no overflow.

## P1 (blocks release)
None.

## P2 (should fix)

1. **Tagline and best score are stuck at about 14–16 px on touch devices, and the tagline touches the screen edges on iPhone portrait.**
   - Screenshots: `screen_title_iphoneP.png` (the tagline runs edge to edge with 0 px gutter), `screen_title_ipad.png` (the tagline is tiny under a 120 px logo).
   - Cause: `game/css/style.css:273`, `body.touch .tagline,body.touch .best-line{font-size:max(14px, 1em)}`. Here `1em` is the parent's size, so this rule replaces the `calc(var(--u)*2.2)` size and leaves the parent's 14–16 px. There is also no side padding.
   - Fix: replace line 273 with:
     ```css
     body.touch .tagline{font-size:max(14px, calc(var(--u)*2.2));padding:0 16px;max-width:calc(100vw - 32px);margin-left:auto;margin-right:auto;box-sizing:border-box}
     body.touch .best-line{font-size:max(14px, calc(var(--u)*2))}
     ```

2. **"+5!" and the "+points" pop-ups land on Dottie.**
   - Screenshots: `burst_join.png` #1–#4 ("+110" sits on her head), `biome3_long_960.png` ("+5!" touches her beak), `biome2_long_960.png`.
   - Cause: `game/js/render.js:271-272` place them at the catch point (`y - 62` and `y - 22`). Dottie is at that point and keeps swimming under the text. Normal stars (`render.js:285`, `y - 40`) also start on her head.
   - Fix: in `goldFx` (and the same for `case 'note'`), move the text behind Dottie and above her:
     ```js
     const h = this.world.hero.heading || 0;
     const ox = -Math.cos(h) * 46, oy = -Math.abs(Math.sin(h)) * 20;
     ```
     - Use `{x: x + ox, y: y - 78 + oy}` for "+5!".
     - Use `{x: x + ox, y: y - 44 + oy}` for "+points".
     - For normal stars use `y: e.y - 56`.

3. **Turning round shows Dottie as a paper-thin sliver.**
   - Screenshots: `motion_turn.png` #7 and #12, where `fx` is 0.19 and 0.04 and the sprite is 12 % wide. The same happens in `burst_bounce.png` #0–#1 and `burst_flip.png` #8–#9.
   - It happens on every left↔right reversal and every wall bounce, about 60–80 ms each time, and reads like a glitch.
   - Cause: `game/js/render.js:566` (`Math.abs(hv.fx) < 0.12 ? ±0.12`) and the slow smoothing at `render.js:355` (`dt * 10`).
   - Fix:
     - Smooth faster: `hv.fx += (f - hv.fx) * Math.min(1, dt * 18)`.
     - Clamp the minimum width at 0.45: `const fxs = Math.abs(hv.fx) < 0.45 ? (hv.fx < 0 ? -0.45 : 0.45) : hv.fx;`
     - The result is a quick squash-and-flip with no sliver.

4. **The "NEW!" badge is clipped or overflows on the Game Over card when there is no medal.**
   - Screenshots: `scorecard_iphoneL.png` (cut off by the panel edge at the right), `scorecard_iphoneP.png` (it sticks out of the inner box).
   - The text "Finish a season for a medal" widens the left column, which pushes the score into the badge's space.
   - Cause: `game/css/style.css:194`, `.new-best{right:calc(var(--u)*-5.6);top:calc(var(--u)*-1.6)}`.
   - Fix: `.new-best{right:0;top:calc(var(--u)*-2.4)}`. Also add `.sc{padding-right:calc(var(--u)*1)}` so the badge stays inside the stats box.

5. **The Score Card picture shows the HUD score "1234" ghosted behind the title "Dottie's Reef Parade".**
   - Screenshots: `scorecard_iphoneL.png`, `scorecard_960.png`.
   - Cause: `game/js/extras.js:128-130` draw the whole game canvas, HUD included, sharp and cover-fitted.
   - Fix: blur it by drawing small and scaling up. This works on every browser; iOS < 18 has no `ctx.filter`.
     ```js
     const t = document.createElement('canvas');
     t.width = 135; t.height = 169;
     t.getContext('2d').drawImage(gc, (135 - dw / 8) / 2, (169 - dh / 8) / 2, dw / 8, dh / 8);
     g.imageSmoothingQuality = 'high';
     g.drawImage(t, 0, 0, W, H);
     ```
     Then raise the top gradient stop to `rgba(12,30,48,.7)`.

## P3 (polish)

6. **"Original" label on Change Pictures is oversized in iPhone portrait.** It renders bigger than the slot title (`screen_custom_iphoneP.png`). The cause is the same `1em` bug at `game/css/style.css:274`. Fix: `.slot .tag{font-size:max(11px, calc(var(--u)*1.2))}`, and keep `.slot .shape button{font-size:max(11px, 1em)}` separate.

7. **Spring coral-spawn specks are almost invisible** on the pink-beige sand (`motion_particles_0.png`; only one or two specks can be spotted). Fix at `game/js/weather.js:52-53`:
   - Back layer: `size: [7, 12], alpha: [0.75, 0.95]`.
   - Front layer: `size: [13, 18], alpha: [0.55, 0.75]`.
   - If the `spawn` sprite colour is lighter than `#ff8fb1`, darken it to `#f2789e`.

8. **Golden glow is weak on autumn amber sand.** Additive yellow on `#c69e64` shows little (`biome2_long_ipad.png`, `lineup_colorblind.png` autumn row). The star still reads thanks to its outline, but the "it's special" halo is lost. Fix in `game/js/render.js` `drawWorld`, gold branch (about line 519), before the glow:
   ```js
   g.fillStyle = 'rgba(70,35,0,.22)';
   g.beginPath(); g.arc(x, y - 2, 24 * sc, 0, TAU); g.fill();
   ```
   This gives a dark halo base on every season, and on autumn it makes the glow pop. Also raise the ring alpha at `render.js:525` to `0.65 + 0.3 * sin`.

9. **"Golden star!" call-out is low-contrast on autumn and spring sand** (`biome2_long_iphoneP.png`, `gold_iphoneP_caught_374.png`; it looks washed out). Fix at `game/js/render.js:293`: `stroke: 'rgba(70,35,0,.95)', size: 26`. Optionally draw a `rgba(10,30,55,.35)` pill behind it, the same as the hearts plate.

10. **Colour-blind check: star kinds merge in pairs.** Under deuteranopia and protanopia, pink (0) and mint (2) both turn grey-beige, and blue (1) and lavender (3) both turn blue (`lineup_colorblind.png`). The white patterns (dots, stripes, ring, caps) are too fine to tell apart at 30 px. This does not affect gameplay, because every kind behaves the same and gold stays distinct, so it is P3. Fix:
    - `STAR = 30` → `34` at `render.js:24`.
    - In `star_1.svg` and `star_3.svg`, make the white patterns opaque (`fill-opacity` 1) and about 1.5× thicker, so stripes and caps read at phone size.

11. **"Swim!" can touch Dottie's head at 960×540** (`custom_play_summer_A_960.png`: the text bottom is at y≈277 and Dottie's top at y≈285). Fix at `game/js/render.js:323`: `y: this.VH * 0.66`, below Dottie's spawn point, and `size: 42`.

12. **Bounce puff covers Dottie's face for about 120 ms** (`burst_bounce.png` #6–#7). The sand puffs are drawn on top of her. Fix at `game/js/render.js:307`: spawn the puffs at `(e.x, e.y + 14)` with 4 instead of 5, or draw `k:'puff'` fx before `drawWorld`.

13. **Golden star blink is fast.** The alpha toggles 8×/s (`render.js:515`, `Math.floor(n.life * 8) % 2`), which is fine for a small object. For extra calm, use `* 5` and alpha `0.5`.

## Files
- Scripts: `tests/visual/capture.js` (viewports updated, bonk guard), `tests/visual/motion.js` (new), `tests/visual/scorecard.js` (new).
- Screenshots: `tests/out/visual/*.png`.
