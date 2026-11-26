# Visual QA: Wisp's Rooftop Bounce (2026-11-26)

Report only, no game code was changed. The captures come from `node tests/visual/capture.js`, extended with an iPad Pro size (`pro`, 1366×1024), iPad landscape in the zone and descend runs, and a protanopia filter. A new `node tests/visual/extra.js` adds the pearl-lost burst, close-ups, HUD top-band crops per zone and size, the iPad-portrait rotate check and the double-magnet popup. All images are in `tests/out/visual/`. I opened each one. The crops are in `tests/out/visual/crops/`.

Overall the game looks good. Wisp is cute and readable, and the four zones have clearly different moods. Bricks stand out from every sky. The magnet field, ring timer and pull streaks read well. The net save and Wisp's squash feel soft and physical. Nothing is scary. The problems are mostly about **layout collisions** (HUD vs the top brick row, text vs the aim guide) and a few **contrast** issues.

## P1: fix before release

### P1-1 The zone-name pill covers the top-left block (Lantern Lane, all 16:9 desktops)
- Screenshots: `x_top_desk3.png`, `crops/desk_zone3_0.png`, `desk_zone3.png`. Rooftop Gardens just touches it: `crops/desk_zone2_0.png`.
- Problem: on a 16:9 screen the field is as wide as the canvas (`ox` ≈ 12 px), so brick column 0 starts at x ≈ 29 logical px. Lantern Lane's top row is full, and its first lantern sits right under the "Lantern Lane" pill (logical y 46…66 vs the brick at y ≈ 51…77). About 60 % of that block is hidden behind a dark pill. The HUD fade (`render.js:674`) only reacts to the pearl, so the block never shows through. Phones (wider, ~19.5:9) and iPads (4:3, field lower) are not affected.
- Fix (`render.js:700-706`): put the zone name **on the same row, to the right of** the main pill, inside the free band above the wall:
  ```js
  const zw = g.measureText(zn).width + 20 * s, zh = 22 * s;
  const zx = x0 + W + 8 * s, zy = y0 + (h - zh) / 2;
  this.pill(g, zx, zy, zw, zh, 'rgba(20,22,60,0.62)');
  g.fillStyle = '#e6e9ff'; g.fillText(zn, zx + 10 * s, zy + zh / 2 + 1);
  ```
  Then also set `this._hudW = x0 + W + 8 * s + zw` and use that in the fade test (`render.js:674`: `bx < this._hudW + 20 && by < y0 + h + 16`). Measure `zw` before line 674, so the font must be set first.

## P2: should fix

### P2-1 The pause/mute buttons overlap the top-right block on 16:9 desktops
- Screenshots: `crops/desk_zone3_1000.png`, `x_top_desk3.png` (and every zone with a block in column 9 of the top row).
- Problem: `.icon-btn` is `--u*5` = 64 px at 1280×720, and `#hud` top is 8 logical px (10.7 css). The button bottom is at ≈ 75 css px, but the top-row brick band starts at ≈ 65 css px, so the pause button sits on the lantern's gold band.
- Fix (`style.css`, append): `#hud .icon-btn{width:max(44px,calc(var(--u)*4));height:max(44px,calc(var(--u)*4))}` (51 px at 1280×720). In `render.js:87`, change `(I.top + 8) * S` to `(I.top + 5) * S`. The bottom of the buttons then lands at ≈ 58 css px, clear of the bricks.

### P2-2 Hint text and stacked "Magnet!" popups sit right on the stuck pearl's aim guide
- Screenshots: `x_magnet_twice.png`, `desk_magnet_stuck.png`, `phone_magnet_stuck.png`, `sheet_stick_release.png`.
- Problem: "Aim · click or Space to let go!" is drawn centred on Wisp at `sy(paddle.y + 1.35) + 0.4u` (`render.js:724`). That is exactly where the dotted aim line starts and where the pearl flies on release, so the dots run through the letters. A second magnet (or a refresh) adds another "Magnet!" only 0.5 u lower (`render.js:296`), while the text is 0.57 u tall, so the two words overlap into an ugly double word.
- Fix:
  1. `render.js:724`: put the hint on the side *opposite* the aim, and lower it:
     `const side = (w.ball.stuckOff || 0) >= 0 ? -1 : 1; say(msg, clamp(x + side * 3.4 * u, 3 * u, this.VW - 3 * u), this.sy(w.paddle.y + 1.0) + bob, size * 0.85, '#ffd6dc');`
  2. `render.js:290-298` popup(): if a popup with the **same text** is younger than 0.6 s, reset its `t` to 0 instead of pushing a new one. Change the push step from `0.5 * u` to `0.42 * u * (sc || 1) * 1.2`.
  3. `render.js:268`: draw "Magnet!" at `this.sy(3.4)` (not 2.6) so it is clear of the arc of aim dots.

### P2-3 A lost heart looks almost the same as a full heart (colour-blind and greyscale)
- Screenshot: `crops/cb_hud_hearts.png` (from `cb_zone0_norm/deut/prot/grey.png`).
- Problem: `heart_empty` is a filled lavender-grey heart, not an outline. Under protanopia and deuteranopia the full hearts turn grey-olive, and the 3 full + 1 empty hearts look the same. Gems, magnets and tough blocks are fine: they differ by shape (glass + gem, dark-blue magnet plate, bands and rivets, cracks), see `cb_bricks.png`.
- Fix (`render.js:685`): draw empty hearts smaller and faded:
  `this.drawSpr(g, full ? 'heart' : 'heart_empty', hx + 10 * s, y0 + h / 2, full ? sz : sz * 0.78, full ? sz : sz * 0.78, 0.5, 0.5, 0, 1, 1, full ? 1 : 0.55);`
  Or in the art, make `heart_empty.svg` a white outline with `fill-opacity="0.12"` instead of 0.35.

### P2-4 The "turn your phone sideways" card appears on an iPad held upright
- Screenshots: `ipadp_over.png`, `x_ipadp_start.png` (the extra.js log printed `iPad portrait rotate card shown: true`). Because of this, the capture never reached game over on `ipadp` (`errors.txt`).
- Problem: DESIGN §2 says "portrait iPads play letterboxed". `syncRotate` (`main.js:61`) blocks every portrait touch screen, and the text says "phone" on an iPad.
- Fix (`main.js:61`): add `&& Math.min(window.innerWidth, window.innerHeight) < 600` so the card only shows on phones.

### P2-5 HUD text is too small on phones
- Screenshots: `phone_hud0.png`…`phone_hud3.png`, `phone_zone3.png`.
- Problem: in `drawHud` the scale `s = max(0.8, min(1.15, VH/540))` is always 1 in landscape. It ignores the CSS scale (0.72 on an 844×390 phone), so the zone name is 13 logical px ≈ **9.4 css px**, the gem count is 12 css px and the score is 16 css px. That is too small for a 5-year-old on a phone.
- Fix (`render.js:663`): `const s = Math.max(0.8, Math.min(1.15, this.VH / 540)) * (this.portrait ? 1.25 : 1) * Math.max(1, Math.min(1.4, 0.95 / (this.cssScale || 1)));` This gives the phone s ≈ 1.32 (zone name ≈ 12.4 css px, score ≈ 21 css px). The phone canvas is 1168 logical px wide, so the wider pill still fits.

### P2-6 White text on grey buttons is hard to read
- Screenshots: `phone_scrCustom.png` ("Reset", "Reset all"), `phone_over.png` / `desk_over.png` ("Menu"), `pro_pause.png` ("Main Menu"), `port_play_banner.png` ("Play upright anyway"), `phone_scrSettings.png` ("Reset").
- Problem: `--grey:#b9b3a8` with white text has a contrast of about 2:1. The selected "Whole picture" shape button (white on the light `--blue`) is also weak.
- Fix (`style.css:8`): `--grey:#7d7690; --grey-d:#5a5470;` (white contrast ≈ 4.5:1). On the dark rotate card, give the button `class="btn btn-blue btn-small"` in `index.html:133`, or add `#rotate .btn{--c:#6f7ee8;--d:#4b56b8}`.

## P3: polish

- **P3-1 Sparkles look like grey dust.** Screenshots: `sheet_gem_catch.png`, `desk_magnet_pull.png`. The pale-yellow `p_sparkle` fades by alpha over indigo, so it turns beige-grey, and `sparkle(x, y, n)` ignores its colour argument (`render.js:300`). Fix: in `drawFlyers` (`render.js:631`), draw `p_sparkle` with `g.globalCompositeOperation = 'lighter'` (wrap it in save/restore), so the sparkles glow instead of greying.
- **P3-2 Descend "cloud stream" puffs look like smoke over the new bricks.** Screenshots: `phone_zone1_banner.png`, `sheet_*_descend.png`. The puffs are 0.45 alpha lilac over dark blue. Fix (`render.js:344`): set `fade: 0.3`, a size of `(0.35 + Math.random() * 0.4) * u` and `_streamT = 0.1`, and stop spawning them once `v.t > 0.8`.
- **P3-3 Losing the pearl has no effect where it leaves the screen.** Screenshot: `x_sheet_pearl_lost.png`. The pearl just sinks into the roof, and "Oops!" appears at y 1.9. Fix (`render.js:278`): add `this.puffs(this.sx(clamp(e.x, 0.5, 15.5)), this.sy(0.05), 3, 0.6); this.rings.push({ x: this.sx(clamp(e.x, 0.5, 15.5)), y: this.sy(0.05), r0: 0.1 * u, r1: 0.9 * u, t: 0, life: 0.4, col: '#ffd0d8' });`
- **P3-4 The serve hint covers falling gems.** Screenshot: `x_sheet_gem_close.png`. The two-line "Click or Space to serve!" and "move the mouse…" is drawn at 1.35 u above Wisp, right where gems fall. Fix (`render.js:721-722`): give the text `globalAlpha 0.75` while `w.gems.length > 0`.
- **P3-5 The moon sits behind bricks or the HUD in Spires and Gardens.** Screenshots: `desk_zone1.png` (the crescent behind the zone pill and a block) and `ipad_zone2.png` (the full moon behind a planter). It is readable, but busy. For the environment artist: move the moon in `levels/spires/sky.svg` and `levels/gardens/sky.svg` toward x ≈ 800–880 and keep it below art y 60 or above the wall.
- **P3-6 On the phone title, the "Best score" pill covers the demo Wisp's face.** Screenshot: `phone_title.png`. Fix (`style.css`): `@media (max-height:430px){ #scrTitle .best-line{margin-top:4px; position:absolute; right:16px; bottom:12px} }`. Or keep the demo bot's paddle away from x 6…10 while on the title.
- **P3-7 Playing upright on an iPhone uses only the bottom third of the screen** (`port_play_upright.png`). That is acceptable as a fallback, because the rotate card is the main path.
- **P3-8 The custom hero cloud is bigger and puffier than Wisp's default footprint** (`phone_custom_play.png`). The puffs rise about 0.3 × body height above the bounce line, so the pearl appears to sink into the cloud. Fix (`render.js:588`): scale the puff `fy` values by 0.85, or lower the `fr` values to `[0.65, 0.9, 1.0, 0.85, 0.6]`.

## What is good (no change)
- Bricks vs sky: high contrast in all four zones (`desk_zone0…3.png`, `ipad_zone*.png`, `phone_zone*.png`). Special blocks pop thanks to the magnet pulse ring and the gem glint.
- Wisp: the frames match (idle, cheer, oops, magnet), and the squash reads clearly in `sheet_wisp_squash.png`. The shadow is visible on the Cloud Deck and Spires roofs. It is faint on the Lantern Lane cobbles, which is fine.
- Magnet: the red/blue ring timer, the inward dashed arcs and the gem pull streaks are lovely (`desk_magnet_pull.png`). The aim guide is clear (`desk_magnet_aim_left.png`).
- Net save (`sheet_net_save.png`): a nice beam, a bead per save left, and a bounce-up sparkle.
- Descend (`sheet_desk_descend.png`): a smooth slide and crossfade. "Zone cleared! / Floating down…" is readable and is followed by the new zone banner.
- Menus at every size: no overflow. The Score Card button fits inside the game-over panel on the phone.
- Colour-blind: the block kinds can be told apart by shape under deuteranopia, protanopia and greyscale (`cb_bricks.png`, `cb_zone*_deut/prot/grey.png`). Only the hearts have a problem (P2-3).
