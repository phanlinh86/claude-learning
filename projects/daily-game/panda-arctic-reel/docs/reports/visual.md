# Visual QA: Bao's Arctic Reel (2026-11-02)

Captured with `NODE_PATH=$(npm root -g) node tests/visual/capture.js`. All images are in `tests/out/visual_*.png`: 78 files, including 5 contact sheets and 8 colour-blind simulations. No console errors.
Viewports: 1280×720, 1024×768, iPhone 390×844 @3x (touch), iPad 1024×1366 @2x (touch). In-game time is frozen (`setSpeed(0)`) and advanced with `PR.Game.step`, so every frame can be reproduced.

**Overall:** the game is already polished. Art style is consistent: soft dark outlines on Bao, the gems, puffers, fish, ice and reef, and nothing looks pure-black. Bao is cute, not scary, and on-brand. The 4 zones look clearly different. The zone crossfade (`visual_xfade_0..2`) is smooth, and the banner stays out of the hook column. The sinking hook (`visual_sheet_sink`) speeds up and looks heavy. Puffers (orange) stand out on every water colour. The golden gem shows up well: twinkle, `+50` at 40 px, a gold wash and a little shake.

## Colour-blind check (`visual_cb_deutan_zone*`, `visual_cb_protan_zone*`)
**Passes on shape.** Each gem has its own outline, so all 4 types can be told apart under deuteranopia and protanopia: round brilliant, rectangle step-cut, heart, star. Colour alone does not separate them, though. Emerald and ruby both turn olive/khaki, and gold and emerald are both yellowish. Shape carries the information, which is fine; P3-4 makes the difference stronger.

---

## P1: fix before release

**P1-1. The caught gem flies across Bao's face.**
Screenshots: `visual_gold_catch_b.png` (the star covers his eye), `visual_sheet_catch.png` (frames 120–360 ms).
What's wrong: the arc peak is `mid − 90`. With the hole at y≈186 and the bucket at y≈130, the peak is at y≈68 and x≈holeX−75, which is exactly Bao's head (y 30–95). Caught gems are drawn on the top layer (render.js:271), so the happy face is hidden at the best moment.
Fix:
- world.js:617: change the arc `M.sin(M.PI * k) * 90` to `* 150`. The peak becomes y≈8, so the gem passes over the hat bobble.
- render.js:402: keep the gem full size while it is over his head. Shrink only near the bucket: `scale = 1 - clamp((k - 0.6) / 0.4, 0, 1) * 0.45`.
- Optional: raise `catchFly` (world.js:54) from 0.65 to 0.75 s so the higher arc does not feel rushed.

**P1-2. Phone portrait: the score/lines plate covers the shallow play band.**
Screenshots: `visual_phone390_reel.png` and `visual_phone390_zone1..3_play.png` (an amethyst is hidden under the plate).
What's wrong: render.js:516 puts the plate at `y0 = waterTop + 22` in portrait. That is right where shallow gems swim. The plate is 156×99 logical px at K = 1.3, so it hides about a quarter of the shallow band's width.
Fix (render.js:515–518): in portrait, put the plate back in the sky:
- `y0 = I.top + 10` and `K = Math.min(this._hudK, 1.1)`.
- The plate is then ≈132×84, from x 12–144 and y 10–94. That is left of the bucket (bucket top y≈106, x 108–152) and of Bao's scarf (x≥170).
- If it still touches the bucket, draw the spools in a row to the right of the score: plate 190×44, with score at `x0 + 6` and spools from `x0 + 60`.

**P1-3. The first-zone hint is hard to read on phone and in Sunny Shallows, and its arrow points at nothing.**
Screenshots: `visual_phone390_start.png` and `visual_sheet_sink.png`.
What's wrong:
- render.js:497 pulses the alpha between 0.5 and 1. The text is white on pale cyan water, so at the low point it almost disappears.
- render.js:500: 17 logical px is ≈11.8 CSS px on iPhone.
- render.js:503: the arrow is drawn at `holeX + 26..38`, about 32 px right of the hook, so it is not under anything.

Fix:
- Alpha: `a = 0.9 + 0.1 * Math.sin(this.time * 5)`.
- Size: `const fs = Math.round(17 * (this._hudK || 1))`.
- Draw a backing pill first: `g.fillStyle = 'rgba(16,34,70,.55)'`, `this.rr(g, holeX - tw/2 - 12, ty - fs*0.8, tw + 24, fs*1.6, fs*0.8)`, where `tw = measureText(msg).width`.
- Arrow under the hook: `moveTo(hx - 7, ay); lineTo(hx + 7, ay); lineTo(hx, ay + 10)` with `ay = hy + 24 + Math.sin(this.time * 5) * 4`.

## P2: should fix

**P2-1. In Twilight and Aurora the water tint dims the gems, and the "gems glow" promise doesn't show.**
Screenshots: `visual_land1280_zone3_lineup.png` and `visual_land1280_zone3_play.png`.
What's wrong:
- render.js:274 draws `ambient.tint` (aurora `rgba(10,20,60,.18)`, twilight `rgba(120,60,160,.10)`) after the items. It darkens the gems, puffers and hook by 10–18%.
- The glow ring (render.js:379) has radius `s * 0.78 = 31`, which equals the bubble radius (31). The bubble (alpha .95) is drawn over it, so the glow never shows outside the bubble.

Fix:
- Move line 274 to just after `drawParticles(g, 'back')` (line 266), so the tint sits under the items.
- At line 379, use `r = s * 1.1` (44 px) with `gr.addColorStop(0.45, col)` and outer stop 1 transparent.
- Use `ga = Math.max(glow * 0.75, …)`.

**P2-2. The "Reel" / "TAP!" label sits on the meter arc.**
Screenshots: `visual_reel_good.png` and `visual_sheet_slip.png` (TAP! sits on the green/gold zone).
What's wrong: render.js:468 draws the label at `cy − R − 2`. The arc band is 16 px wide (`R ± 8`), so the label covers the zone the child must watch.
Fix:
- Label at `cy - R - 24`.
- Plate at render.js:445 becomes `this.rr(g, cx - R - 16, cy - R - 42, 2*R + 32, R + 86, 22)`.
- Change the clamp at render.js:438 to `L.waterTop + R + 50`.

**P2-3. A Good tap gives almost no feedback, and a slip is weak.**
Screenshots: `visual_reel_good.png` and `visual_sheet_slip.png`.
- render.js:197–201: on a Good tap (not perfect), add `this.say('Good!', hk.x - 70, hk.y - 30, '#9dffbf', 20)` and `this.ring(hk.x, hk.y + 18, '#53d88a', 0.35, 34)`.
- render.js:203:
  - "Oops!" colour `#ffc8a0` is low-contrast on Shallows; use `'#ff8a7a'`, size 22.
  - Add `this.reelFlash = 0.3`. In `update`, decay it with `this.reelFlash = Math.max(0, (this.reelFlash||0) - dt)`.
  - In `drawReel` (line 445), use plate fill `rgba(150,40,50,.8)` while `reelFlash > 0`, and nudge the plate by `Math.sin(reelFlash*60)*3` px horizontally.
  - Draw the slip dots (line 465) at radius 5 instead of 4.

**P2-4. "Perfect!" / "Oops!" text overlaps the reel plate, and the Perfect ring stays behind.**
Screenshots: `visual_land1280_zone0_play.png`, `visual_sheet_tug.png`, `visual_sheet_slip.png`.
What's wrong:
- The texts are placed at `hk.x + 60` (render.js:199, 203). The plate's left edge is at `holeX + 90`, so a 100 px wide "Perfect!" covers the plate.
- The ring is drawn at the old `hk.y + 18`. The gem then jumps 2 steps up, leaving the ring floating in empty water.

Fix:
- Place these texts on the side away from the meter: `const sx = this.reelPos(w)[0] > hk.x ? hk.x - 70 : hk.x + 70`.
- Draw the ring at the target: `this.ring(hk.x, e.y + 18, …)`.

**P2-5. A snapped line can't be seen in the water: the hook vanishes instantly.**
Screenshot: `visual_sheet_snap.png`.
What's wrong: render.js:351–355 returns early when `hk.lost`. Only a 36 px curly line under the rod tip is drawn, up in the sky. The world sinks the cut hook for 1 s (world.js:578), but it is never drawn.
Fix: in the `hk.lost` branch, also draw the hook sprite at `(hx, hy)`:
- alpha `clamp(w._snapT / 1.0, 0, 1)` and rotation `hk.tilt`;
- a 40 px wavy line above it: 8 segments, `x + sin(i*1.3 + time*4)*4`;
- a loose end at the rod of 18 segments × 3 px instead of 12.

**P2-6. iPad/phone title tagline is too small (≈14 CSS px on a 1024 px-wide iPad).**
Screenshot: `visual_ipad1024_title.png`.
What's wrong: style.css:273 `body.touch .tagline, body.touch .best-line { font-size: max(14px, 1em) }` overrides `calc(var(--u)*2.2)` (=22 px on iPad).
Fix: `font-size: max(15px, calc(var(--u)*2.2))` for `.tagline` and `max(15px, calc(var(--u)*2))` for `.best-line`.

**P2-7. The title demo draws the reel meter and floating texts under the logo.**
Screenshots: `visual_ipad1024_title.png` and `visual_phone390_title.png` ("Hooked!" and the meter show through between the logo lines).
Fix: render.js:278 `if (w.reel && w.reel.active && mode !== 'title')`, and render.js:280 `if (mode !== 'title') this.drawTexts(g)`.

**P2-8. The empty gem slots in the zone pill are almost invisible on the bright sky.**
Screenshots: `visual_land1280_play.png` and `visual_phone390_play.png`.
Fix (render.js:542): fill `rgba(255,255,255,.55)`, then stroke `rgba(16,34,70,.5)` at `lineWidth 1.5`, radius `5 * K`. Also raise the pill background (render.js:534) from `.45` to `.55`.

## P3: polish

1. **Kelp Garden: emerald (green) on green-teal water in front of green kelp is the lowest-contrast pair** (`visual_land1280_zone1_lineup.png`). Raise kelp `glow` from 0.15 to 0.35 (weather.js:23); with P2-1 this gives a soft green halo. Or add a 2 px `#eafff4` rim to `gem_emerald.svg`.
2. **The zone-pill progress always shows amethyst icons**, even for a golden catch (render.js:541). Keep a `caughtTypes[]` list in the renderer from `catch` events and draw `gem_<type>`.
3. **Portrait phone: about 1000 logical px of water holds only 3–5 items** (`visual_phone390_zone*_play.png`). It feels empty, and the bot scored 0 in 4 s on phone. Scale gem/fish caps by `VH / 540` (cap 1.6×) in portrait, or add fish schools in portrait.
4. **Colour-blind margin.** Make ruby clearly lighter than emerald so the two differ in brightness too, for example ruby `#ff5a6e` and emerald `#2fb873`. Shapes already pass.
5. **style.css:276–279 contains "Kit's Toybox Beat additions"** copied from another game. `.best-line` gets a purple pill `rgba(60,40,90,.6)` that is off the arctic palette. Use `rgba(16,34,70,.55)` and text-shadow `#173a66`; also drop the unused `.set-offset` / `.offset` rules.
6. **The game-over title "Game Over" is in alarm red** (`visual_*_over.png`). For ages 4–8, use something kinder like "Nice fishing!" in `#1d5f86`, and keep the red for a NEW best. The score numbers (white with a brown outline on cream) read as outlines on the phone; use fill `#ffb02e`.
7. **The hole's back wall shows as a hard-edged dark block in Twilight/Aurora** (`visual_land1280_zone2_play.png`). At render.js:145–147, end the gradient at `info.back[1]` with alpha 0.85, and soften the rectangle edges with a 6 px gradient.

## Test harness notes
`tests/visual/capture.js` adds a few helpers on top of `PR.debug`: `VQ.freeze` / `adv`, `hookGem(type, depth)`, `waitNeedle('good'|'perfect'|'miss')`, `lineup()` and `place()`.
After the frames are captured, an inline Pillow script composes the contact sheets (`visual_sheet_{sink,tug,slip,catch,snap}.png`) and the colour-blind simulations (Machado 2009, severity 1).

## Applied by the integrator (2026-11-02)
- P1-1, P1-2, P1-3 and P2-1 … P2-8 applied as specified (arc 150 px + catchFly 0.75 s, portrait plate in the sky at K ≤ 1.1, hint pill + arrow under the hook, tint under the items, glow r = 1.1·s, reel label above the arc with a taller plate, Good/slip feedback, side-placed texts, visible cut hook, tagline sizes, title demo without meter/texts, stronger empty gem slots).
- P3: kelp glow raised to 0.35, Game Over title is now "Great Fishing!", score outlines navy, leftover purple best-line colours replaced. Not done: portrait density, ruby/emerald brightness, hole edge in dark zones.
