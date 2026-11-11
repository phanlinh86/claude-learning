# Zippy's Jungle Boop (daily game, 2026-11-11)

## Goal
A family-friendly whack-a-critter game in a jungle with colour matching. Zippy the jetpack snail boops jungle friends (monkey, frog, toucan) who hold a star of his current colour. Four biomes: Riverbank Morning, Bamboo Grove, Treetop Canopy, Waterfall Ruins. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
v1.0, built and tested on 2026-11-11.
- **QA results:** unit tests 29/29; smoke test passes; functional suite 264/264 (`docs/reports/functional.md`); visual review `docs/reports/visual.md`; playtest `docs/reports/playtest.md`.
- **Applied after QA:**
  - Playtest: 4 starting leaves, 1.5 s colour grace, Easy up 2.8 s / spawn 3.0 s / 75 % matching (a 4-year-old model clears Riverbank 26 % → 83 %); mash guard (3 empty taps in 1 s → 1.5 s nap).
  - Visual P1: burrow fronts drawn per hole right after its friend (a back-row lip no longer covers a front-row face); one-line level banner at y 150 that fades by 2 s; HUD buttons respect the safe area.
  - Visual P2: Zippy boops from above the head (TARGET_DY 160); "+N" and "Oops!" texts above the faces; combo/clear texts higher; colour-warning blink slowed to 1.5 Hz; foliage frame quarters hug the screen corners; far layer extended to the screen top; floor band tiled on tall screens; stars drawn larger (68 px); a custom Zippy gets a ring and star in his colour.
  - Functional: best score never saved for bot/test runs; stage fits the canvas exactly on iPad; the rotate card shows only on phones (< 600 px).
- **Open:** visual P3s (crossfade double burrows, HUD on game over, custom friends have no expressions); colour-blind Coral/Sunny and Sky/Grape rely on the emblems; the idle-player hint and an "end of tour" screen suggested by the playtester; app/main.go port fallback changes origin in the browser fallback.
- **Not yet verified:** a real iPhone or iPad, the music by ear, and the exe on Windows.

## Stack
- HTML5 canvas and plain JavaScript on `window.ZJB` in `game/`.
- `world.js` has no pixels and is deterministic: logical stage 960×540 px, y down, fixed 1/120 s steps; burrow layouts in `World.LAYOUTS`.
- `render.js` fits the stage (contain) and covers the letterbox; per biome, the sky+floor+burrow backs and the foliage frame are pre-rendered once per size; friends, stars, paws, burrow fronts and Zippy are cached sprites.
- The Go + WebView2 wrapper in `app/` builds `dist/ZippysJungleBoop.exe` on ports 47911/47921/47931/47941. JS bridge: `zjStoreAll/zjStoreSet/zjStoreDel/zjFullscreen/zjQuit`.
- Original SVG art from `tools/art-*`; sound synthesized with WebAudio.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract between modules.
- Kid-friendly content: boops, giggles and stars; nothing scary; original art and sound only.
- Storage keys use the `zjb:` prefix, because all the games share one GitHub Pages origin.
- `app/web/`, `build/`, `dist/`, `tests/out/` and the art `out/` folders are build outputs and are gitignored.
