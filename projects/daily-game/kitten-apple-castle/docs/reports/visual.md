# Visual QA: Ziggy's Apple Castle (2026-11-19)

Captured with `node tests/visual/capture.js` (it serves `game/` over `python3 -m http.server` on a free port). Screenshots are in
`tests/out/visual/`, which is gitignored. Viewports: `land` 960×540, `phone` 390×844 (isMobile, DPR 3), `ipad` 1366×1024 (DPR 2).
Sections: `screens`, `zones` (every time of day early / late / late with lanterns, plus deuteranopia and protanopia simulations),
`goal` (Granny Boo's show, travel, next banner), `motion` (contact sheets), `custom`. No console errors.

## Overall verdict
The art style is consistent: flat cartoon, warm crates, a friendly ghost, a castle that stays cosy. **Night is never black.**
At the darkest point (night late, light 0.24) the frame's mean luma is 58/255 and its minimum is 19. Crates, castle windows,
stars and the moon stay readable. Lanterns are hung in the right places (alternating sides, on the hook, with a soft warm
halo), and they really do light the tower in the dark. Portrait (phone) is clean.

The main problem is **landscape and iPad HUD overlap**: Ziggy's swing passes under the HUD panels most of the time, so the
panels keep fading to 30 %.

## P1: must fix

### P1-1. In landscape and on iPad, Ziggy flies under the HUD, so the HUD is faded most of the time
- Screens: `land_play.png`, `land_banner.png`, `ipad_play.png`, `land_zone_*_early.png`, `sheet_dawn_apple_pie.png`,
  `land_custom_play_night.png`
- Measured over 6 s of normal play, the centre panel (time of day, crates x/goal, apple pips) is faded **69 % of the time at
  960×540, 74 % at 1280×720 and 87 % on iPad 1366×1024**. The score/hearts panel is faded 28–43 % of the time. On phones it
  is 0 %.
- At 30 % alpha a child can't read the crate count or see the apple pips. Ziggy's ears also sit inside the panel band.
- Cause: `game/js/world.js:196` sets `saucerScreenY: 0.17*h + 34`, which is 126 at h 540 and 156 at h 720. Ziggy's top is
  `saucerY − 0.755·unit` ≈ 50–80, but the HUD panels reach y = `I.top + 110` (`render.js:756-779`, heights 98 and 78).
- **Fix** (`world.js:196`):
  `saucerScreenY: portrait ? 0.20 * h + 34 : M.max(0.17 * h + 34, 1.95 * unit),`
  This gives 195 at unit 100. The held crate's bottom lands at about 312, which is still above the tower top at about 397
  (topLine 0.60·h + one crate), so there is still a clear drop. Re-run the unit tests and sims afterwards: the drop height
  shrinks by about 70 px, so the landing speed and the bot's timing change slightly.
- Also change `render.js:749`: `? 0.3 : 1` → `? 0.55 : 1`. When the panel does overlap Ziggy, its text then stays readable.

## P2: should fix

### P2-1. Lantern halos blow out to white on a light sky (late noon, early sunset)
- Screens: `land_zone_noon_late_lanterns.png` (white flare at the tower top), `ipad_zone_noon_late_lanterns.png`
- At noon late, light is 0.56, so `glowK` is 0.8 and the halo alpha is about 0.65. It is drawn with `'lighter'` (additive)
  over a pale blue sky, which saturates to pure white. It reads as a camera flare, not a warm lantern.
- **Fix** (`render.js:519-520`): change `g.globalCompositeOperation = 'lighter'` to `'screen'`, and change the alpha
  `(0.25 + 0.5 * gk)` to `(0.15 + 0.55 * gk * gk)`. At night (gk 1) the alpha stays 0.7, and on a bright sky it drops to
  about 0.5 and stays warm.

### P2-2. "Apple pie! +1 ♥" toast lands on top of the HUD (landscape)
- Screen: `sheet_dawn_apple_pie.png`, frames t=30.67–31.02. The text is drawn on the faded centre panel.
- `render.js:253` puts the toast at `s.y − L.unit*1.0`, which is about y = 26 on screen, inside the HUD band.
- **Fix** (`render.js:253`): use
  `const py = Math.max(s.y - L.unit * 1.0, w.cam.y + this.ins.top + (L.portrait ? 225 : 140));`
  and pass `py` as the y argument. This keeps the toast below both HUD rows.

### P2-3. Tower edges in the dark (Normal, no lanterns) are low-contrast for a 4–6-year-old
- Screens: `land_zone_night_late.png`, `phone_zone_night_late.png`, `land_zone_sunset_late.png`, and `_g_towerzoom.png`
  (panel 2)
- You can see the crates, but the top edge (brown outline `#6b3f1f` under a 0.62-alpha violet veil) is the thing a child aims
  at, and it is hard to pick out. Ziggy's light (r 2·unit) never reaches the tower top. The lanterns fix this nicely
  (panel 3), but a child who never gets Perfect drops won't have them.
- **Fix** (render only, so mechanics and bot `lit` stay the same): in `render.js` `drawDarkness`, after the light loop
  (line 403), cut one more soft hole at the tower top, with `x = w.tower.topX`, `y = w.tower.topY`, `r = 0.9·unit`, and
  `a = 0.35`, using the same gradient code. Or, above the darkness after line 348, stroke the top crate's top edge at
  `rgba(255,230,170, 0.5*glowK)` with `lineWidth 2`.

### P2-4. The title screen demo collides with the logo (phone, iPad)
- Screens: `phone_title.png` (the icon badge sits on top of the demo crate, and Ziggy floats over the title) and
  `ipad_title.png` (Ziggy is behind the icon badge, and the subtitle runs across the demo crate)
- **Fix** (`render.js:338-339`): in title mode, skip the guide and Ziggy with
  `if (mode !== 'title') { this.drawGuide(g, w, mode); this.drawSaucer(g, w, mode); }`
  The castle, tower and particles still give the title a living backdrop. Alternatively, dim them to 35 % with
  `g.globalAlpha = .35` around `drawSaucer` when `mode === 'title'`.

## P3: nice to have

- **P3-1. The goal flash washes the night out to grey** (`sheet_land_goal_night.png`, frame t=7.62): the cream flash reaches
  alpha 0.36 over a dark scene. Fix at `render.js:259`: `this.flash = 0.45 * (0.4 + 0.6 * this.light());`
- **P3-2. Granny Boo floats up through Ziggy as she leaves** (`sheet_land_travel_night.png`, t=10.83): her sideways drift is
  weak. Fix at `world.js:983`: `g.side * 0.4 * CONFIG.ghostRiseAcc` → `g.side * 1.0 * CONFIG.ghostRiseAcc` (or pick
  `side` opposite `sign(saucer.x − cx)` when she leaves at line 970).
- **P3-3. The "+10" pop sits on Ziggy during a topple** (`sheet_night_topple.png`, t=27.68–27.78). Pops follow the crate
  upward. Fix: in `render.js` `pop()` (line 284), clamp `y = Math.max(y, w.cam.y + w.layout.saucerScreenY + w.layout.unit*0.6)`.
- **P3-4. Toasts pile up** after an apple, Perfect and Wobbly land in the same second (`sheet_dawn_apple_pie.png`,
  t=30.85–31.4): "Wobbly!", "+5", "+5", "+10" and "Apple pie" are all on screen at once. Fix: shorten `pop` life from
  0.9 → 0.7 (`render.js:285`) and drop pops while a `big` text is less than 0.3 s old within 80 px.
- **P3-5. Colour-blind:** under deuteranopia and protanopia (`land_zone_*_late*_deutan.png`, `_protan.png`) the red, green
  and yellow crate bands collapse to olive. They stay distinguishable by their stencils (apple, leaf, sun, moon), and the
  Easy guide uses shapes (star, bar, ✕), so nothing is lost. Optional: make the leaf band darker, `#4ccf6a` → `#2fa85a`
  (`crate_1.svg`), so it separates from yellow by brightness.
- **P3-6. Custom background at night** (`land_custom_play_night.png`): a bright photo under the night veil turns murky grey
  rather than blue, because the tint is `rgba(12,14,48)` at 0.62. That's acceptable. Optionally, for custom backgrounds,
  multiply by a blue tint first (`render.js:180`: draw with `g.filter='brightness(.8) saturate(.8) hue-rotate(10deg)'` when
  `light < .5`).

## Checked and fine
- Screens at all three viewports: title, How to Play, Settings, Change Pictures (the scroll-bottom shots show no cut-off), Pause
  and Game Over. Nothing overflows, there is no letterbox, and the safe-area buttons don't overlap.
- Zone art: no seams in the sky, far or ground tiling at 960, 1366 or 390 widths. The castle stays behind the tower column.
  Windows light up at sunset and night. The moon smiles. The ghost in the window is friendly.
- Lantern placement: hooked inside the crate's side edge, on alternating sides, with a pop-in overshoot and a swing.
- Goal show: Granny Boo arrives beside the tower top with a lilac halo, waves, and says "Thank you, Ziggy!". The flag lantern
  glows, and the night→dawn crossfade is smooth.
- Motion sheets: the miss tumble rotates and falls with a soft "Oops!". The topple leans as a column, which reads as a soft
  "Timber-r-r!", not scary. The apple flies to the HUD.
- Custom pictures: the hero is drawn inside the mint rocket ring, the crate image keeps its wood frame and colour stripe, and
  the apple is drawn round.

## Test-harness note (not visual)
`screens`, phone: at speed ×8, a skill-0 bot never reached game over within 90 s, because pies kept refilling the hearts.
`phone_over.png` therefore shows play, not the Game Over screen. The Game Over screen is covered by `land_over.png` and
`ipad_over.png`.
