# Mossy's Egg Grove (daily game, 2026-11-25)

## Goal
A family-friendly physics drop-and-merge game in a fairy forest. Mossy the baby dragon drops magic eggs into a twig nest; two matching eggs merge into the next of 8 kinds, two Golden Dragon eggs hatch a baby dragon. Twist: **wind gusts that change direction** (1.5 s windsock warning, then 3–5 s of sideways force on falling eggs only). Four seasons by score; eggs stay in the nest. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
v1.0 on 2026-11-25. UI shell + mobile layer forked from `../cloud-farm-fling/`; world, bot, weather, renderer and art are new.
- QA round (`docs/reports/`): functional 219/220 at first (landscape-phone nest under the home bar); visual 2 P1 (portrait windsock over the Next bubble; hatch had no crack beat, text on the baby) + 7 P2; playtest: spamming matched real play and piled eggs off the screen, taps dropped before Mossy arrived.
- Fixes applied: drop refused when the spawn point overlaps the pile (`blocked` event), `DROP_COOLDOWN` 0.8, goals 150/400/750; tap drops once Mossy arrives; safe-area-aware landscape layout; windsock badge + stronger warning, hatch crack/shake beat, bigger baby, text pills, rescue ghosts + bigger faster fairy, How-to-Play icons, title logo card, custom egg pips, larger phone HUD.
- After fixes: unit 28/28, smoke pass, functional `--quick` 186/186, `test_extras.js` pass, exe builds.
- Open: visual P3s 5–8, 11, 12 (moon behind the score card, Starry egg contrast on the nest, Mossy vs autumn sky, Sunset stripes for colour-blind players); Esc doesn't leave the exe's full screen.
- Not yet verified: real iPhone/iPad, music by ear, the exe on Windows.

## Stack
HTML5 canvas + plain JS on `window.MEG`; `world.js` headless and deterministic (u, y up, nest inner 9 × 11.2 u, floor y 0, vine at 9.8, fixed 1/120 s steps); `render.js` maps u → px (landscape `unit = min(VH/15.2, VW/22)` with side panels; portrait `unit = min(VW/11, room/15.2)` with the HUD row on top; no rotate prompt); Go + WebView2 wrapper → `dist/MossysEggGrove.exe`, port 48613 (fallbacks 48623/48633/48643); original SVG art from `tools/art-*`; WebAudio sound.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract; `docs/MECHANICS.md` has the numbers.
- Kid-friendly, original art and sound only. Gold/yellow is reserved for the Golden Dragon egg; egg kinds differ by pattern + size, not only hue.
- Egg `rot` uses the world convention (counter-clockwise positive): draw with `rotate(-rot)`.
- Real egg steps and `predictDrop()` share ONE step function — keep it that way (the guide must never lie).
- Wind pushes only eggs with `falling = true`.
- Storage keys use the `meg:` prefix (all games share one GitHub Pages origin).
- After changing `audio.js` / `index.html`, re-run `python3 shared/daily-mobile/apply.py dragon-fairy-merge` and `test_extras.js`.
- `app/web/`, `build/`, `dist/` and `tests/out/` are build outputs and are gitignored.
