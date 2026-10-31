# Spike's Dino Jam: Visual QA report

Date: 2026-10-31 · Reviewer: visual QA / art director (report only, no game code edited)

**How it was captured:** `node tests/visual/capture.js [screens play events bursts lineup custom]` (Playwright Chromium, file://, `--allow-file-access-from-files`), plus `node tests/visual/overflow.js` (DOM overflow and minimum font size per screen). 144 PNGs are in `tests/out/visual/`, and the fixture images are in `tests/out/visual/fixtures/`.
Viewports: 1280×720, 1920×1080, 800×600, iPhone 390×844 @3 (`iphoneP`), 844×390 @3 (`iphoneL`), iPad 820×1180 @2 (`ipad`). The three device contexts used `isMobile` and `hasTouch`. I also ran a 667×375 SE-size overflow check. No console errors in any run.

**Overall:** The art is cohesive and cute. All four biomes have distinct palettes, the notes read well on every ground, and the trail looks lovely when it is long (`biome1_long_1280`, `biome2_long_1280`). Menus fit on every viewport except one case (P1-2). The weak spots:
- the pillow telegraph,
- hero/board clarity in the 3/4 view,
- HUD size and contrast on phones.

---

## P1: fix before shipping

### P1-1. The pillow landing telegraph is invisible on Snowy Peaks and weak on phones
- **What:** The landing marker is a white 2 px dashed ellipse (30×15) plus a faint shadow. On snow, white on white is invisible: only a small grey blob is left. On iPhone portrait (scale 0.70) the ring is about 21×10 CSS px and easy to miss. This telegraph is the only warning for the game's twist mechanic.
- **Where:** `lineup_colorblind.png` (rows "biome 3 · none/grayscale": no ring visible), `burst_pillow.png` (rings only show from frame 4), `boss_iphoneP_hover_3p_437.png` (bottom, next to Spike).
- **Code:** `game/js/render.js:363-367`
- **Fix:** Use a two-tone, marching, larger ring and a stronger shadow:
  ```js
  const rx = 30 + 6 * (1 - k), ry = rx * 0.5, a = 0.45 + 0.5 * k;
  g.setLineDash([6, 5]); g.lineDashOffset = -this.time * 24;
  g.lineWidth = 4; g.strokeStyle = 'rgba(40,30,70,' + (a * 0.6) + ')';
  g.beginPath(); g.ellipse(p.x, p.y, rx, ry, 0, 0, TAU); g.stroke();
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.stroke();
  g.setLineDash([]); g.lineDashOffset = 0;
  this.shadow(g, p.x, p.y, 10 + 20 * k, 5 + 10 * k, 0.18 + 0.27 * k);
  ```

### P1-2. Change Pictures on landscape phones: the background-card buttons overflow and overlap the next card
- **What:** The 4 biome cards are 125 px wide, but their "Choose… / Reset" row is 137 px wide (on 667×375: 120 vs 134). Each Reset is clipped and sits under the next card's Choose…, so fingers can hit the wrong button.
- **Where:** `screen_custom_iphoneL.png` (bottom row: "Rese|Choose…"). `overflow.js` reports: `iphoneL scrCustom slot sw137/cw125` and `se slot sw134/cw120`.
- **Code:** `game/css/style.css:233-245` (the `max-height:430px` block). The later rule at `style.css:251` forces the font to 14 px.
- **Fix:** Append at the end of `style.css`. This saves about 18 px per card:
  ```css
  @media (max-height:430px){
    .slot .btns{gap:4px}
    .slot .btn{padding-left:6px !important;padding-right:6px !important;font-size:13px !important;min-width:0}
  }
  ```

---

## P2: should fix

### P2-1. Trail notes are drawn over Spike's board and feet
- **What:** Trail note 0 sits 24 px behind Spike, and the y-sort uses Spike's centre. When he skates up, the first one or two notes are drawn on top of his board and sneakers, so he looks like he is standing in a pile of notes. A custom hero loses the board entirely.
- **Where:** `play_meadow_1280.png`, `play_meadow_1920.png` (teal note over the board), `burst_kickflip.png` frames #8–#11, `custom_play_A_1280.png` (pink cat: no board visible).
- **Code:** `game/js/render.js:388`
- **Fix:** Bias Spike's sort key so notes within about 14 px below him are drawn under him: `const ty = i => i < 0 ? iq(s) + 14 : iq(w.trail[i]);`

### P2-2. The board looks like a pogo stick when Spike heads up or down
- **What:** The top-view board is rotated by the heading at full length, with no 3/4 foreshortening. Heading vertically, it becomes a 60–78 px vertical bar under Spike (78 px at kickflip scale 1.3), which reads like a stilt.
- **Where:** `burst_kickflip.png` #4–#7, `play_meadow_iphoneP.png`, `biome3_long_iphoneP.png`.
- **Code:** `game/js/render.js:419-420`
- **Fix:** Squash the ground plane before rotating:
  ```js
  g.translate(x, y - z); g.scale(1, 0.62); g.rotate(s.heading || 0);
  ```
  Keep the existing `k` / kickflip `cos` scale after the rotate.

### P2-3. The HUD is too small on phones, and Spike disappears under it at the top edge
- **What:** In iPhone portrait/landscape (canvas scale 0.70/0.72):
  - hearts are 24 logical px, about 17 CSS px;
  - the song counter "6/10" is 16 logical px, about 11 CSS px;
  - the score is about 21 CSS px.

  There is also no backing plate. When Spike skates along the top edge, his 64 px sprite rises into the HUD band, and hearts and the song bar sit on top of him.
- **Where:** `hud_all_phone.png`, `hud_biome0_iphoneP.png`, `play_meadow_iphoneL.png`, `screen_pause_iphoneL.png` (Spike under the hearts and song bar).
- **Code:** `game/js/render.js:481-495` (sizes) and `render.js:23` (`HUD_H`).
- **Fix:**
  - **Sizes:** In `drawHud`:
    - `const cs = this.cssScale || 1;`
    - `hs = Math.max(narrow ? 24 : 28, Math.round(24 / cs))`
    - counter text `Math.max(16, Math.round(15 / cs))`
    - bar height `Math.max(14, Math.round(11 / cs))`
    - score `Math.max(narrow ? 30 : 36, Math.round(26 / cs))`
  - **Backing plate:** Before drawing the hearts:
    ```js
    g.fillStyle = 'rgba(20,30,40,.30)';
    this.rr(g, x0 - 8, y0 - 6, 28 + bw + 64, hs + 8 + 30, 14);
    g.fill();
    ```
  - **Band height:** Raise `HUD_H` to `Math.max(64, hs + 46)`, i.e. about 80 on phones.

### P2-4. The Mumbles warning icon collides with the Pause button on iPhone portrait
- **What:** The blinking icon is placed at `cx + 50`, which lands on the pause button.
- **Where:** `hud_biome0_iphoneP.png`.
- **Code:** `game/js/render.js:507`
- **Fix:** On narrow screens put it under the score. Touch has no flip meter there, so the space is free.
  ```js
  const wx = narrow ? cx - 28 : cx + 70, wy = narrow ? y0 + 40 : y0 + 2;
  ```

### P2-5. Floating texts ("Boing!", "+66", "Poof!") are not clamped vertically and land on the HUD
- **Where:** `bonk_1280.png` ("Boing!" over the song bar).
- **Code:** `game/js/render.js:476`
- **Fix:**
  ```js
  this.text(g, t.text, clamp(t.x, 90, this.VW - 90), Math.max(t.y, this.layout.arena.y0 + t.size * 0.6), Math.round(t.size * sc), t.color);
  ```

### P2-6. Snowy Peaks: empty hearts and the HUD buttons have low contrast
- **What:** `heart_empty` is pale pink on white snow and nearly invisible. The white icons on the 45 % translucent buttons turn light-grey on snow.
- **Where:** `hud_all_1280.png` (last row), `hud_biome3_iphoneP.png`, `biome3_long_1280.png`.
- **Code:** `render.js:484`, `style.css:73-77`.
- **Fix:**
  - The plate from P2-3 fixes the hearts.
  - In CSS: `.icon-btn{background:rgba(30,45,70,.62)}` and `.icon-btn svg{filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.55))}`.

### P2-7. The toast covers the "Reset all / Done" buttons on Change Pictures
- **Where:** `custom_screen_A_1280.png`.
- **Code:** `render.js:81` (toast pinned at the bottom), `style.css:145`.
- **Fix:** Append to the CSS. `#scrCustom` comes before `#toast` in the DOM, so the sibling selector works:
  ```css
  #scrCustom:not(.hidden) ~ #toast{bottom:auto !important;top:calc(env(safe-area-inset-top,0px) + 12px)}
  ```

### P2-8. Custom pictures: note stickers vanish on a similar-coloured photo, and photo backgrounds are too busy
- **What:**
  - A pet-photo note with an orange ring on a brown/orange photo background is nearly invisible: the ring stroke is only 2 px at `rgba(0,0,0,.25)`.
  - Colourful photos (flowers in note colours) camouflage the notes.
- **Where:** `custom_play_swamp_A_1280.png` (notes at the left and right), `custom_play_A_1280.png`, `custom_play_A_iphoneP.png`.
- **Code:** `render.js:341-343` (note ring), `render.js:132-135` (custom background).
- **Fix:**
  - **Ring:**
    ```js
    g.lineWidth = 3; g.strokeStyle = 'rgba(40,30,50,.6)'; g.stroke();
    g.beginPath(); g.arc(x, y, r + 2.5, 0, TAU); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
    ```
  - **Background:** After the custom-ground `drawImage`, add a calming wash: `g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(0, 0, c.width, c.height);`

### P2-9. The small menu buttons are 10.9 px on iPhone portrait
- **What:** "How to Play" and "Settings" use `.btn-small` at 1.8u, which is 10.9 px with portrait `--u` ≈ 6 px. The tagline and best line are about 12–13 px.
- **Where:** `screen_title_iphoneP.png`, and `overflow.js` minFont 10.88 on `iphoneP scrTitle`.
- **Code:** `style.css:50`, and the `pointer:coarse` block at `style.css:249-258`.
- **Fix:** Inside `@media (pointer:coarse)` add `.btn-small{font-size:max(15px, calc(var(--u)*1.8))}` and `.tagline,.best-line{font-size:max(14px, calc(var(--u)*2.2))}`.

### P2-10. Decor props stick 36–43 px into the playfield and look like obstacles
- **What:** The side props are centred at `x0 − 6` with an 84 px width, so they reach `x0 + 36`. The bottom props reach `y1 − 43`. Spike and the notes skate "through" the sleepy dino and the rocks, which reads as a collision bug.
- **Where:** `play_meadow_800.png` (Spike over the sleepy dino), `loose_blink_b_1280.png` (loose notes on the swamp dino), `biome2_long_1280.png`.
- **Code:** `render.js:184-185, 192, 195-196`
- **Fix:**
  - left `ar.x0 - 30`
  - right `ar.x1 + 30`
  - bottom `ar.y1 + 50`
  - top `ar.y0 - 18`

  This puts the props on the 72 px bush strip.

---

## P3: polish

1. **A newly picked note teleports to the end of a long train.**
   - **What:** `joinTime` is 0.25 s with an ease-out, so on a 15+ note trail the note crosses about 300–700 px in 1–2 frames.
   - **Where:** `burst_join.png` #1→#2.
   - **Code:** `world.js:67, 541-545` (mechanics).
   - **Fix:** Make the duration depend on distance, `clamp(0.22 + dist / 900, 0.25, 0.6)`, with an ease-in-out, and draw it on a small arc.
2. **Colour-blind check.** Colour carries no rule, except gold (×3), so the impact is low.
   - **What:**
     - Pink (0) and orange (3) are the same eighth-note shape, and they merge under tritanopia.
     - Orange and gold are both yellow under deuteranopia/protanopia.
     - Gold and mint are both beamed notes; in greyscale only the small sparkle separates them.
   - **Where:** `lineup_colorblind.png`.
   - **Code:** `render.js:379` (idle halo).
   - **Fix:** For gold notes draw a pulsing ring: `g.strokeStyle='rgba(255,236,140,.95)'; g.lineWidth=2.5; arc r = 17 + 2*Math.sin(t*6)` (instead of the plain white halo). Optionally make `note_3.svg` a sixteenth note so no two kinds share a shape.
3. **The biome crossfade midpoint looks muddy.** Swamp and canyon at 50/50 desaturate the whole field.
   - **Where:** `crossfade_1to2_1280.png`.
   - **Code:** `render.js:262`
   - **Fix:** Shorten it to `dt / 0.7`, and add a 0.12 white flash (`this.flash = 0.25`) on the `biome` event when `level > 0`.
4. **The kickflip button hides trail notes under it.**
   - **Where:** `biome1_long_iphoneL.png`.
   - **Code:** `style.css:184`
   - **Fix:** Make the fills more see-through: `rgba(255,211,77,.80)` and `rgba(98,67,191,.62)`.
5. **The edge-bounce feedback is tiny.** Three 6–12 px puffs are barely visible.
   - **Where:** `burst_bounce.png`.
   - **Code:** `render.js:217`
   - **Fix:** Use `this.puffs(e.x, e.y, 6, ...)` and add `this.weather.burst('leaf', e.x, e.y, 2)` in the meadow and swamp.
6. **The swamp ground's dark water ovals read like holes or obstacles to a young child.**
   - **Where:** `biome1_long_1280.png`.
   - **Code:** `assets/default/biomes/swamp/ground.svg`
   - **Fix:** Lift the puddle fill to about 15 % lighter and reduce their opacity to 0.55 so they read as wet patches.
7. **Desktop 800×600 Change Pictures:** the shape buttons and tags are 9.6 px.
   - **Code:** `style.css:139-141`
   - **Fix:** Add `.slot .shape button,.slot .tag{font-size:max(11px, calc(var(--u)*1.2))}`.
8. **The game-over panel on iPhone portrait sits low.** Its top edge is at 34 % of the height, and Spike is visible above it, which is fine. No change needed. Note that the medal/zone text in my test shots comes from forced test state, not a bug.

## Checked and OK
- **Notes against every ground:** all four kinds and gold are clearly outlined on meadow, swamp, canyon and snow. Orange on canyon is the weakest but still fine thanks to the outline and halo (`lineup_colorblind.png`).
- **Spike against grounds:** OK in all biomes and under all the colour-blind filters.
- **Banners:** all four biomes and lap 2 render, on desktop and phone.
- **Song-complete / cleared / out-of-hearts texts:** they render.
- **Bonk:** the red flash and blinking invulnerability work.
- **Loose notes:** the blink is clearly visible (`loose_blink_a/b`).
- **Mumbles and the pillows:** they read well and are cute (`boss_*`).
- **Menus:** title, How to Play, Settings, Pause and Game Over fit at all six viewports (no overflow).
- **Custom pictures:**
  - a transparent PNG hero works;
  - an opaque JPEG hero becomes a round sticker;
  - a low-contrast PNG note is saved by the coloured ring.
