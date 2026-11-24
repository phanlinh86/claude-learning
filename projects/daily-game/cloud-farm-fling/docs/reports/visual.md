# Visual QA — Nubi's Farm Fling (2026-11-24)

Capture: `node tests/visual/capture.js` (or `ONLY=screens|seasons|sizes|events|motion|deut`). 330 PNGs + 6 contact sheets
in `tests/out/visual/` at 1280×720, 844×390 (touch, DPR 3), 390×844 (touch, DPR 3), 1024×768 iPad (touch, DPR 2).
Covers every screen, every season × aim / flight (apex) / landing, Nubi at 1.0 / 1.4 / 1.7, plop, crow bonk, the
spring→summer crossfade + banner (0.2/0.5/0.8/1.5 s), motion bursts at 1/30 s (launch, puff, landing squash, winter
landing, plop) and a deuteranopia simulation (Machado 2009 matrix on `#stage`). Zero console errors in all passes.
Every image was looked at.

**Overall:** a clean, consistent, friendly style. White Nubi reads well against every sky (the lavender outline does the
work, even on the grey winter sky), fireflies pop (lime body + halo; gold ones are clearly orange), the crow reads at a
glance, and the growth twist is visible: at 1.7 Nubi is ~2× the area of size 1 and the shrink while raining is clearly
visible frame by frame. The problems are a few overlaps and one ugly sling/pouch placement on the hero's face.

## P1 — fix before shipping

1. **The sling pouch sits on Nubi's mouth at rest — it looks like he is smoking a pipe.** At rest (`phase 'aim'`, no pull)
   the front band and pouch are drawn *after* the hero (`render.js:395-396`) at `seat = [ax, ay + 0.15u]`
   (`render.js:249`), i.e. 0.15 u below Nubi's centre = exactly his mouth. Result: a brown `#6b4a2e` 18×10 px ellipse
   (`render.js:260`) plus a 5 px `#8a4a26` line from the right prong across his face. Seen in every aim/title/settings
   background shot (`screen_desk_play_banner.png`, `xfade_*`, `screen_desk_settings.png`). When pulled the band still
   crosses his eyes (`season_desk_0spring_aim.png`, `size_desk_1.4_aim.png`).
   *Fix:* put the seat under Nubi's bottom and behind him: `seat = [heroX - 0.15u, heroY + 0.42u·size]` (his bottom line
   is art y 108 → +0.34 × drawn size below centre), draw the front strand + pouch **before** `drawHero`, or keep it after
   but end the strand at the pouch and give the pouch `globalAlpha 0` at rest (only show it while `pull` is set).
   While pulling, aim the strand at Nubi's lower-left (`+0.35u·size` down) so it never crosses the face.

## P2 — should fix

2. **Portrait: the season pill covers the size meter.** `render.js:470` puts the pill at `py = y0 + 160` centred on
   `VW/2`; at VW 560 its left edge (~x 230) overlaps the size-meter pill (x 14–164, y ≈ 168–204)
   (`season_phoneP_*`, `size_phoneP_1.7_fly.png`). *Fix:* in portrait place it at `py = y0 + 210` (below the meter), or
   right-align it under the pause/mute buttons (`px = VW - pw - 14 - I.right, py = y0 + 70`).
3. **Suns sit behind the HUD corners.** Sky suns: spring `cx 842 cy 62`, autumn `790,70` (behind pause/mute),
   summer `120,58`, winter `160,66` (behind the score pill + hearts; on iPad the white "0" sits on the `#fbf3df` disc,
   `season_ipad_1summer_fly.png`). *Fix* in `tools/art-environment/gen.js`: put every sun at `cx 640–700, cy 100–120`
   (between the season pill and the buttons, still above the y 1–7 band), or keep the corners free (x 0–220 / 800–960,
   y 0–150 of the 960×540 sky).
4. **Winter "snow" still shows blue raindrops.** `nubi_rain.svg` has 5 blue streaks (`#6db8ff`/`#2a68b4`) and the
   renderer always uses it on landing (`render.js:282`); in winter they mix with the white snow burst
   (`crop_landw.png`, `season_*_3winter_land.png`) while the banner promises "Nubi snows on the winter cabbages!".
   *Fix:* add `nubi_snow.svg` (same body, 5 small white `#ffffff` 6-arm flakes with `#8fa3bf` outline below y 108) and
   in `heroKey` return `'snow'` when `world.zone === 3`.
5. **Text stack at the start of every season / first shot.** The banner (3 lines at `VH·0.24`, `render.js:484`) and the
   drag hint (`VH·0.42`, `render.js:510`) together make 4 lines of text, and the hint runs straight through the
   firefly arc (`screen_desk_play_banner.png`, `xfade_phoneL_0.8s.png`). *Fix:* hide the hint while `banner` is
   active (`drawHints`: `if (this.banner) return;`) and move the landscape hint below the arc — `y = this.sy(0) + 0.6u`
   (on the grass) or next to the sling at `sy(sling.y) + 1.6u`.
6. **"What a voyage!"** on the game-over card (`index.html:67`) is left over from the fox/pirate game. Use
   "What a harvest!" / "Great watering!".
7. **The thirsty-patch bullseye is invisible except during Spring aiming.** The patch is a 72×10 (viewBox) ellipse
   `#3e2617` on soil `#6e4a33` (contrast ≈ 1.6:1) and mostly hidden by the front rail (rail y 49–55 vs patch y 40–50).
   The white pulsing ring is drawn only for `level === 0 && phase === 'aim'` (`render.js:215`). *Fix:* draw a faint
   static ring in all seasons during aim + flight (`globalAlpha 0.35`, `#ffffff`, lineWidth `2·k`), and in the art raise the
   soil so the patch shows (`ry 7`, fill `#2a170d`, plus 2–3 lighter crack lines `#c49a70`).
8. **The bale's grass patch is saturated `#69bd4b` in every season**, including on snow (`season_*_3winter_*`) and
   the olive autumn field. *Fix:* tint per season (spring `#69bd4b`, summer `#8fae4c`, autumn `#9a8a4a`, winter
   `#e6edf5` snow cap with `#b9c6d6` shade) — draw a season grass/snow strip over the bale base in `background()`,
   or generate `bale_<season>.svg`.
9. **Colour-blind (deuteranopia):** fireflies stay readable (yellow on blue), but the gold firefly differs from the normal
   one mostly by hue (`#ffd36a` vs `#e1ff78` glow) → both look yellow; the sparkle is ~6 px. The wagon `#b8573a` turns
   olive and nearly matches the autumn ground `#7d6045` (`deut_desk_2autumn_aim.png`). *Fix:* draw gold fireflies at
   `1.15×` size with a white 4-point star halo (`R·1.2`, alpha 0.7); give the wagon body a lighter top rail
   (`#e89a74`) and a 1 px light rim so it separates by luminance, not hue.
10. **Size meter needs a label.** The BIG mark is a 2×20 px `#3a5a8a` line on the dark pill (`render.js:465`) —
    invisible to a child; the fill only changes from `#ffffff` to `#bfe6ff` past 1.4×. *Fix:* label the mark with a tiny
    "BIG" (`700 10px`, white) above it, change the fill past BIG to a stronger `#7fc8ff` and pulse the pill once on `big`.
11. **Portrait: 36 % of the screen is plain field and the play area is tiny.** Ground at `VH·0.64` (`render.js:72`)
    leaves ~730 px (of 2000) of flat green below the field and ~600 px empty sky; Nubi at size 1 is ~65 px tall.
    *Fix:* in portrait use `seaPx = VH·0.58` and fill the lower band with a darker soil + crop-row strip, or move the
    firefly/score HUD there (it is only "Play upright anyway" mode, so keep it modest).

## P3 — polish

12. Landing pop-ups pile up: "+1"/"+3" from the flight plus "Bullseye! +7" + "Big Shower!" overlap at size 1.7
    (`size_desk_1.7_land.png`: "+3" sits under "Bullseye"). `text()` (`render.js:355`) only avoids texts with
    `t.t < 0.6`; on `land`, clear or fade out the older "+N" texts (`t.t = max(t.t, t.life - 0.25)`).
13. The crops pop up behind a big Nubi and are mostly hidden while he rains (`crop_land.png`). Lift the rain pose
    `0.15u·size` or spread `CROP_X` to `±0.8`.
14. The "+1" pop-up spawns at `X + 0.8u, Y − 0.9u` (firefly position) and Nubi flies into it, so it often sits on his face
    (`crop_puff.png`). Spawn it above Nubi instead (`heroY − 1.0u·size`).
15. Title screen: the bot demo Nubi flies behind the Play / Change Pictures buttons most of the time.
16. Change Pictures grid (portrait): 3 cards then 2 + 1 with a gap; "Spring Spro…" truncated; mixed card heights.
17. How-to-Play wagon icon is ~48×16 px; the thirsty patch it mentions is not visible in it — use a cropped close-up.
18. Plop pancake is small (~110×30 px at desk) and pale on pale grass; the mist puffs are faint. A 0.15 s grey
    `#c8d3e0` shadow ellipse under him would help.

## What works (keep)
- Nubi vs sky in all four seasons, incl. winter `#73879f→#a8b4c2` (outline `#5b5690`-ish lavender does the job).
- Fireflies: lime + dark head + halo read on every background; gold = orange with sparkles (normal vision).
- Growth: 1.0 → 1.4 → 1.7 is obvious in flight; the meter icon scales; the shrink during rain is visible over ~0.8 s.
- Motion: launch stretch, ~34° nose-down tilt on descent, landing squash, puff (cheeks + breath puff), bonk swirl eyes
  and spin all read at 1/30 s. Season crossfade is smooth (1.2 s) and the banner is legible.
- HUD is tidy in landscape: score, hearts, firefly→heart bar, size meter on the left; season + pips centred.
