# Visual QA — Tofu's Volcano Melody (2026-11-14)

Capture: `node tests/visual/capture.js` (≈4 min, writes `tests/visual/out/`). It serves `game/`, freezes the loop with
`setSpeed(0)` and steps `Game.step()` + `renderer.update()` by hand, so every burst frame is deterministic.
71 images: every screen at 1280×720, 844×390 @3x touch and 1024×768 @2x touch (`scr_<view>_*`), the 4 seasons
(`season_N_play`), character/note line-ups per season with deuteranopia/protanopia/greyscale versions
(`lineup_N[_deutan|_protan|_gray]`), y-sorting (`ysort`), motion contact sheets (`burst_*`), safe-area/portrait
(`edge_*`) and custom pictures (`custom_*`). Every image was inspected.

**Overall:** clean, friendly, readable art. Tofu, crabs, notes and mango read on all four meadows, including winter snow
(the grey outline + charcoal patches carry Tofu). The HUD clears the HTML buttons at all three sizes and adapts to a
simulated 47 px notch. Walk cycle, catch sparkle, eruption arcs with landing rings, pinch knock-back and blink, and the
clear confetti all work. No P1. The P2s are about the hero getting covered and a few layout slips.

## P1 — must fix
None.

## P2 — should fix

1. **A palm hides Tofu completely when he walks behind it.** If Tofu stands within ~60 px above a palm's ground point,
   the 96×120 crown covers the whole panda. Only the ears show (`ysort.png` frame 1, and `season_3_play.png` top right
   in winter). A 4-year-old loses the hero. The volcano is less of a problem because the head still shows.
   *Where:* `game/js/render.js:350-354` (`_obstacle`). *Fix:* make the occluder see-through while it overlaps Tofu.
   Put this before drawing a palm:
   ```js
   const T = w.tofu, ty = T.y;
   const behind = o.kind === 'palm' && ty < o.y && o.y - ty < 120 && Math.abs(T.x - o.x) < 62;
   if (behind) g.globalAlpha = 0.5;   /* …draw… */  g.globalAlpha = 1;
   ```
   Use the same rule for the volcano (alpha 0.6, test `ty < 330 && ty > 160 && Math.abs(T.x-480) < 110`) and for crabs
   behind palms.

2. **The game-over panel covers napping Tofu.** `#scrOver` is pushed to the right (`css/style.css:404`) so the scene can
   show "beside the napping panda". Tofu naps wherever he was pinched, though, usually near the centre-bottom (x≈480).
   On every device he ends up under the panel (`scr_desk_over.png`, `scr_iphone_over.png`, `scr_ipad_over.png`). The
   child sees an empty island. *Fix* (`render.js` `draw()`, line ~254): when `mode === 'over'`, skip the normal
   `_tofu` and draw `tofu_sleep` at 2× (144×144) in the free strip on the left. Use logical x = `(panelLeft/cssScale - ox)/2`,
   which is about 160 on desktop (read `#scrOver .panel` `getBoundingClientRect().left` in `_measureHud`), and ground
   y = 430. Add the shadow `_shadow(x, 430, 44, 14, .24)` and the existing "z" puffs with offsets ×2. Alternative in
   `world.js:849` `_gameOver`: tween Tofu to (170, 430). That is uglier because he slides.

3. **A crab stays on top of the sleeping Tofu during the nap.** The crab that gave the last pinch stays overlapping him
   for the whole nap and game-over (`burst_nap.png` frames 1–11). *Fix* in `world.js:849` (`_gameOver`): for each crab
   within 70 px of Tofu, push it to 80 px away along the Tofu→crab direction, then
   `collide(k, k.r, this.obstacles); clampArena(k, k.r)`. Then set `state='dizzy', stateT=-99` (the same doze as
   `_clearLevel`, line 670).

4. **Coco covers Tofu's face while she circles him.** When she orbits in front (`sin(ang) > 0`), she is drawn at
   `T.y + 0.6·72 − 60 − 26 = T.y − 43`. That is exactly on Tofu's face, and Coco is always drawn on top
   (`burst_mango.png` frames 8–10). *Fix* in `world.js:903` and in CONFIG at lines 103–105:
   `cocoOrbitR: 96`, `cocoZ: 100`, and a vertical factor of `0.25` instead of `0.6` in
   `ty = T.y + Math.sin(co.ang) * c.cocoOrbitR * 0.25`. Her centre is then at most `T.y − 102`, a halo above his head.
   Dives to notes stay the same (`cocoDiveZ`).

5. **The combo badge's timer ring sits on the "C" of "Combo".** The ring is centred at x −34 with r 9. The 17 px text
   is centred at +8 and starts at ≈ −30, so it reads "Ↄombo ×2" (`edge_iphone_inset47.png`, `custom_play.png`,
   `season_1_play.png`). *Where:* `render.js:513-516`. *Fix:* `_pill(-62, -16, 124, 32, …)`, ring at
   `g.arc(-44, 0, 9, …)`, text at `g.fillText('Combo ×' + w.combo, 10, 1)`.

6. **The bush sprites are cut flat at the bottom (all 4 seasons).** The lower lobes plus a 4.8-unit outline reach
   y 82–87 in a viewBox of 0 0 100 80. The bottom outline is sliced off and the bush looks pasted on (a crop of
   `scr_iphone_playing.png` at 600,800; `season_*_play.png`). *Where:* `tools/art-environment/gen.py:603`. *Fix:*
   `lobes = [(28,46,20),(50,36,25),(72,46,20),(40,54,18),(62,54,18),(50,58,16)]`, which puts the bottom at 78.8.
   Shift the clip-path circles, highlights and flowers in the same function by −8 (or wrap everything except the
   contact-shadow ellipse at cy 77 in `<g transform="translate(0,-8)">`). Then regenerate `props/bush_*.svg`. The
   collider (r 28 at y−18) can stay.

7. **iPad held upright: the HUD is unreadably small and far from its buttons.** The rotate prompt only appears below
   600 px, so an iPad in portrait plays a 768-wide stage. The HUD hugs the island because of the clamp
   `top = max(−oy + sf.t, −64) + 8`. The pills end up 25 % smaller than in landscape: "2 / 10 notes" is ≈ 7 css px and
   the score is ≈ 14 px. The pause and sound buttons sit 280 px higher at the screen top
   (`edge_ipad_portrait_play.png`, also `edge_portrait_play.png` after "Play upright anyway"). *Where:*
   `render.js:475` and `render.js:262`. *Fix:* when `this.portrait`, use
   `hk = clamp(this.VH / LH * 0.55, 1, 1.8)`. Draw the HUD with
   `g.setTransform(p*hk,0,0,p*hk,(this.ox + LW*(1-hk)/2)*p, (sf.t+8)*p)` at the true screen top, with `top = 0`
   inside `_hud` and the meter pill shortened so the right pill ends at `LW/hk − 120`. That puts the HUD in the empty
   sea band next to the buttons and makes the text about 1.6× bigger.

8. **A custom photo meadow overpowers the characters.** The style guide says the ground is low contrast so the
   characters always win. A real photo is drawn at full saturation and contrast (`custom_play.png`: a dog's
   high-contrast face fills the island, and the volcano and crab sit on its nose and ear). *Where:* `render.js:118-119`
   (`_ground`, custom branch). *Fix:* `g.filter = 'saturate(0.55) contrast(0.7) brightness(1.1)'` before
   `drawImage`, reset to `'none'` after. Then, also for Safari < 18 where `ctx.filter` is a no-op, draw a wash
   `g.fillStyle = 'rgba(255,250,235,0.28)'; g.fillRect(bx, by, bw, bh)` inside the same clip.

9. **The props jump when a season changes.** The meadow crossfades over 1.2 s, but `w.obstacles` switches on
   `levelUp`, so palms, rocks and bushes teleport in one frame. Spring and summer meadows are both mid-green, so the
   prop jump is the most visible change in the transition (`burst_clear_crossfade.png`, t=3.0 → 3.2). *Fix:* in
   `render.js` `setLevel()` (line 85), keep `this._oldObs = world.obstacles.slice()` (taken in `onEvents` on
   `levelClear`). While `vis.k < 1`, draw the old props at alpha `1−k`. Draw the new ones at alpha `k` with a pop scale
   `0.6 + 0.4·easeOutBack(k)` around their ground point.

## P3 — nice to have

1. **Volcano notes fly up into the HUD band.** The apex is ≈ 200–230 px above ground, so a note heading north is drawn
   at screen y ≈ 35–60, under the song-meter pill and combo badge (`season_1_play.png` red note at 685,60;
   `season_2_play.png`; `burst_eruption.png` row 3). *Fix:* `eruptVz: [300, 360]` (`world.js:67`). Or in
   `_planVolcanoNote` (`world.js:532`), reject plans where `min over flight (y(t) − z(t)) − 22 < 96`.
2. **"+N" lands on Tofu's face for its first 0.15 s** (`burst_catch.png` frames 4–6). `render.js:189`: use
   `y: e.y - 84` (and `- 110` for the combo text on line 190).
3. **The half note (kind 3) needs a bigger hollow.** In greyscale, red ♩ and purple 𝅗𝅥 are nearly identical, and under
   deuteranopia blue ♪ and purple 𝅗𝅥 are both blue (`lineup_0_gray.png`, `lineup_0_deutan.png`). The hollow is only
   5.2×2.6 units, about 3×1.6 px drawn. Kinds are cosmetic (score does not depend on them), so this is polish:
   `tools/art-characters/gen.py:456` → `rx="6.4" ry="3.6"`, and lighten purple to `#a65fe6` with outline `#5e2590`.
   Shapes then separate cleanly: filled single, flag, beamed pair, open head.
4. **A crab overlaps Tofu for about 1 s before the pinch registers** (`hitForgive`). It looks like the crab is sitting
   on him with no reaction (`burst_pinch.png` frames 4–12). Either lower the forgiveness, or nudge a touching but
   not-yet-pinching crab out to `touch − 4` the way the safe branch already does (`world.js:840-845`).
5. **The autumn meadow (pale tan) is almost the same colour as the beach,** so the island edge disappears
   (`season_2_play.png`). In `levels/autumn/ground.svg`, deepen the meadow to about `#d9c48f`, or add a 3 px
   `#c9a96a` rim between the meadow and the sand.
6. **The summer meadow looks like spring** (`season_1_play.png` vs `season_0_play.png`). Give summer a warmer, more
   yellow green (≈ `#a9d46a` base) so the season change is visible even before the banner.
7. **The score pill is 168 px wide for a 1–3 digit score,** which leaves a lot of empty dark pill
   (`scr_iphone_playing.png`). `render.js:480`: width `max(110, 52 + measureText(score))`. The meter picks up the
   space automatically.
8. **The small Coco icon under the score** (`render.js:519-521`) sits on the island's corner at 40×33 and is
   unexplained (`burst_coco.png`). Either add a shrinking ring for her remaining time, or drop the icon.
9. **The Change Pictures previews are tiny on iPhone** (~50 px; `scr_iphone_custom.png`). Use
   `.slot .prev{height:min(26vh,120px)}` in a `max-height:430px` query, and put "Whole picture / Round" on one line
   with the Choose button.

## Checked and fine
- **HUD at all three landscape sizes:** the pills never touch the HTML pause and sound buttons (gap ≥ 10 px). With
  simulated insets (47/21 px) the HUD and buttons shift correctly (`edge_iphone_inset47*.png`).
- **Banners** sit at y 126–128 over the volcano top. They never cover Tofu at spawn or during the clear.
- **Y-sorting:** Tofu is correctly in front of and behind palms and the volcano. Flying notes draw over the volcano
  and smoke. Shadows shrink with height, and landing rings read well.
- **Invulnerability blink** (alpha 0.45) is clearly visible. The heart pop in the HUD fires on a pinch and on a mango.
- **Rotate prompt** on iPhone portrait works. The title screen in portrait is readable.
- **Custom hero and note stickers** (round, white rim) read well on both the default and the photo meadow.
- **Title, How to Play, Settings and Pause** are legible at every size, with large touch targets.
