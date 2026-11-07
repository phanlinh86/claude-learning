# Visual QA report: Nini's Sea Painting (2026-11-07)

**Scope.** I checked every screen in EN and VI on 6 device shapes, with notch insets emulated through `--sa-*` overrides on `:root` (read by `#safeProbe`).

| Key | Device | Size | Insets t/r/b/l |
|---|---|---|---|
| ip-p | iPhone 15, portrait | 393×852 | 59/0/34/0 |
| ip-l | iPhone 15, landscape | 852×393 | 0/59/21/59 |
| pad-p | iPad, portrait | 820×1180 | 24/0/20/0 |
| pad-l | iPad, landscape | 1180×820 | 24/0/20/0 |
| se-p | iPhone SE | 375×667 | 20/0/0/0 |
| pro-l | iPad Pro | 1366×1024 | 24/0/20/0 |

**Scripts.**
- `tests/visual/qa_full.js` produces 456 PNGs plus `geometry-*.json`, which holds the DOM and layout boxes and a text-overflow scan for every shot.
- `tests/visual/qa_extra.js` produces the `x-*` files: hint on a multi-step round, float/bob rise sequences checked against the bubble (`extra.json`), and @2 close-ups.

All PNGs are in `docs/reports/visual/` at deviceScaleFactor 1, quantised to 256 colours. The `x-*-vi-close-*` files are @2. There were no console errors on any device.

**Naming.** Files are `<dev>-<lang>-<NN>-<screen>.png`. Screens: 01 title · 02 settings · 03 banner · 04 colours · 05 brush-fly · 06 fill · 07 hint · 08 pause · 09 finish · 10 alive · 11-step-* · 12-season-* · 13-alive-<kind>(-b) · 14 pearl/fishy · 15-talk-<topic> · 16 done.

**What passed.**
- Nini is fully readable and the brush sits in her flipper (`x-ip-p-vi-close-nini.png`).
- The shells are clearly coloured and well clear of the canvas.
- VI diacritics are not clipped in the bubble, banner, buttons or Talk choices (the DOM overflow scan only flags the title logo spans, which look correct).
- Seasons read well (petals, rays, amber leaves, ice), and every answer colour stays distinguishable on every season.
- Particles are subtle.
- Nothing overlaps the HUD or the notch on any device.

---

## P1 (fix before release)

**P1-1. Talk time panel overflows on iPhone SE, so the mic button is cut off.**
- Screenshot: `se-p-vi-15-talk-initial.png`. The panel runs from y 108 to beyond 667, and the pink "Bé chạm hoặc nói đáp án nhé!" button is cut off at the bottom edge. It is the same on `se-p-en-15-talk-initial.png`.
- Cause: `.talk-panel` has `max-height:100%` but does not scroll. The show canvas is 300×180, the choices are 3 tiles in a 2+1 layout of 96 px each, and the mic button is 60 px.
- Fix in `game/css/style.css`:
  - Add `@media (max-height: 700px) and (orientation: portrait) { .talk-panel #talkShow { width: min(200px, 52vw); } .talk-choices button { min-height: 80px; min-width: 84px; } .mic-btn { margin-top: 8px; min-height: 48px; } }`.
  - Add the `scroll` class to `.talk-panel` in `index.html` as a safety net.
  - Better still, lay the 3 choices out in one row whenever `width ≥ 3×90+2×8` (`.talk-choices{flex-wrap:nowrap}` at `max-width:430px`). This removes the 2+1 stacking, which costs one extra row of about 104 px.

**P1-2. The session gallery is covered by Nini in landscape.**
- Screenshots: `pad-l-vi-16-done.png` (Nini, h≈300 logical, hides 2 of the 4 bottom-row pictures at x 200–500, y 520–660) and `pro-l-vi-16-done.png`. Portrait has a small version of this: Nini's beret touches the third row in `ip-p-en-16-done.png`.
- Cause: in `render.js _doneScene()`, the landscape grid height is `gh = ny - nh*0.35 - fy0`, so the grid runs down to 65 % of Nini's height.
- Fix:
  - In landscape, give Nini a left column. Use `const nW = nh*0.75; fx0g = fx0 + nW + 12;` for the grid, and draw Nini at `x = fx0 + nW/2`.
  - Or keep her centred and use `gh = ny - nh*1.0 - fy0` in both orientations, with portrait at `nh*1.02` (beret).

## P2 (should fix)

**P2-1. float/bob animals rise behind the DOM bubble and the HUD.**
- Screenshots: `x-ip-p-en-rise-float-0.7.png` shows the seahorse cut by the bubble, and its head appears above the ★ pill. Also `pad-p-vi-10-alive.png`.
- Geometry (`extra.json`): at t = 0.7·aliveMove the picture spans y −46…190 on ip-p while the bubble spans y 133…201. On pad-l, float covers y −230…152 while the bubble spans y 45…183 at x 27…665, which overlaps the canvas x 392+.
- Fix, either of these:
  1. In `main.js onEvent` `case 'alive'`, add the class `.bubble.fade{opacity:.15;transition:opacity .25s}` and remove it on the next `round`/`talk`.
  2. In `world.js _stepAlive`, for `float`/`bob`, add a rightward drift (`pc.x += A.dx*0.5*u*u`) so the picture leaves over the open water on the right.

**P2-2. iPhone landscape canvas is small, with about 230 px of empty water to its right.**
- Screenshots: `ip-l-*-04-colors.png` and `ip-l-vi-11-step-letters.png`.
- Geometry: the canvas is 292×200 CSS px at x 331–623, and the free water runs from x 623 to 793. Letter balloons are about 25 px in radius, and the letters are about 18 px.
- Cause: height-bound. The top is limited by the bubble/HUD (85) and the bottom by the shell row (shellY − r − gap).
- Fix in `world.js computeLayout`: in landscape with `H/W < 0.5`, put the shells in a vertical column right of the canvas (`slots x = canvas.x+cw+F+cfg.shellGap+r`, `y` spread between top and groundY). Then set `bottom = groundY - cfg.canvasGapBottomLand - F`. The canvas grows to about 270 px tall, roughly +35 %.

**P2-3. "shell" means two things.**
- Screenshots: `x-ip-p-en-hint-shell.png` ("Let's paint the shell yellow!" while the paint pots are clam shells) and `x-ip-l-en-hint-part.png` ("Now tap the shining shell!").
- A 3–4-year-old will tap a paint shell.
- VI is fine for the crab ("cái mai"), but the count spot `shell` → "vỏ sò" clashes with "Bé tìm vỏ sò màu …".
- Fix in `i18n.js` NAMES:
  - Crab `shell` → EN "back" or "body".
  - Snail `snailshell` → "snail shell".
  - Spot `shell` → "seashell" / "con ốc".
  - Or call the paint pots "paint" everywhere in EN, which they mostly already are.

**P2-4. The ghost hand is small and low-contrast on the sand and shells.**
- Screenshot: `x-ip-p-en-hint-shell.png`. The hand is about 50 CSS px, cream on a cream shell and sand.
- Fix:
  - In `render.js:340`, change `drawGhostHand(g, 92, …)` to `drawGhostHand(g, 130, …)`.
  - In `paint_art.js drawGhostHand`, add a 3 px navy `#33405E` outline and a soft dark shadow (`shadowBlur 8`, `rgba(0,0,0,.35)`).

**P2-5. The pickColor target glow is weak on large parts.**
- Screenshots: `pad-l-en-12-season-spring.png` (whale body: a thin gold dashed line along the navy outline) and `pad-l-en-12-season-winter.png` (jellyfish bell).
- Fix:
  - Raise `CONFIG.pickGlow` from 0.55 to 0.8 in `world.js`.
  - In `paint_art.js` glow rims (line ~164), also fill the part with `rgba(255,214,90,0.18*gl*pulse)` so the whole area shimmers, not just the rim.

**P2-6. The navy outline disappears on purple (and blue/red) fills.**
- Screenshots: `ip-p-en-09-finish.png` and `pad-p-vi-09-finish.png` (purple hull).
- Contrast against outline `#33405E`: purple 1.76, red 2.71, blue 3.03.
- Fix in `paint_art.js drawPicture`, outline pass: when the fill's relative luminance is below 0.2 (purple, blue, red), draw a 2 px inner `rgba(255,255,255,.6)` stroke just inside the outline, or darken the outline to `#1E2740` (purple 2.52, blue 4.34).

**P2-7. Settings is cut off on phones in portrait.**
- Screenshots:
  - `se-p-vi-02-settings.png`: only 2 of 4 toggles are visible, and "Nhạc nền" is half under the sticky Done button.
  - `ip-p-en-02-settings.png`: the parents' tip line is clipped under Done.
- The panel scrolls, but nothing shows that it does.
- Fix in `style.css`: `@media (max-width: 430px) { .settings-panel .set-grid { grid-template-columns: 1fr 1fr; } .settings-panel .toggle { font-size: 15px; padding: 6px 8px; } .settings-panel .small-note { margin-bottom: 18px; } }`. This uses 2-column toggles like the iPad layout and saves about 120 px.

**P2-8. The Talk "count" icon is tiny and does not look like bubbles.**
- Screenshots: `ip-p-en-15-talk-count.png` (2 dots, about 12 px) and `ip-l-vi-15-talk-count.png` (1 dot at the far left).
- Fix in `paint_art.js drawIcon 'dots'`: use `gap = s*0.8/Math.max(per, rows, 2)` and `r = gap*0.42`, and draw the bubble sprite style (light-blue fill `#A6CCF5`, white rim, highlight) instead of slate `#5B79B0`.

**P2-9. The paint shells show little colour.**
- Screenshot: `x-ip-l-vi-close-shells.png`. The blob fills about 35 % of the shell, and the cream lid dominates.
- Yellow is weak against the shell and sand (vs sand `#EAD7AE` 1.02, vs canvas 1.37).
- The selected ring is gold, which is the same hue as yellow.
- Fix in `paint_art.js drawPaintShell`:
  - Make the blob about 1.3× wider and taller, and add the dark-tone 2 px rim (`pal.dark`) around the blob.
  - Draw the selected ring in white with a navy outline instead of gold.

## P3 (polish)

- **P3-1. Unpainted parts are hard to tell apart from the canvas.** White `#FFFFFF` on canvas `#FFF8EC` has a contrast of 1.06, so parts read only through the navy lines (`ip-p-en-11-step-*`). Darken the canvas to `#FBEEDB` (1.14) or `#F6E7CF` in `drawCanvasFrame`.
- **P3-2. Portrait steps without shells leave a band of empty sand.** In `ip-p-en-11-step-*.png` (no palette) the sand from y 660 to 818 is empty. When `plan.n === 0`, let `bottomFree` use `groundY - cfg.canvasGapBottom` so the canvas moves down and grows.
- **P3-3. Orange and pink have equal luminance (1.00).** They are fine for normal vision but poor for colour-blind children. Add `orange+pink` to `CLASH` in `content.js` for all ages.
- **P3-4. On iPhone SE the done screen gallery thumbnails are about 25 px** (`se-p-vi-16-done.png`). Shrink the panel there (hide "Our pictures", buttons in one row) so the grid gets about 250 px.
- **P3-5. "Our pictures" / "Tranh của bé" sits under the title, far from the gallery** (`ip-p-en-16-done.png`). Move it to the canvas above the grid, or remove it.
- **P3-6. The Talk-time colour choices show the colour name under the blob**, which gives the answer away for readers (`*-15-talk-colors.png`). Hide the `small` label for `topic==='colors'`.
- **P3-7. Phone landscape settings use 14 px toggle labels** and "Trả lời bằng giọng nói" wraps into 2 tiny lines (`ip-l-vi-02-settings.png`). Use font-size 15 px and shorten the VI key `ui.mic` to "Nói để trả lời".
