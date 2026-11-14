# Tofu's Volcano Melody (daily game, 2026-11-14)

## Goal
A family-friendly top-down collector with gentle chasers. Tofu the panda walks around a friendly volcano island catching the musical notes the volcano puffs out (each note plays the next note of the season's song); combo 5 brings Coco the parrot as a helper; slow pebble crabs cost a heart if they pinch. Four seasons (spring, summer, autumn, winter), then the year loops. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
v1.0, built and tested on 2026-11-14.
- **QA results:** unit 27/27; smoke passes; functional 357/357 (`docs/reports/functional.md`); visual review `docs/reports/visual.md`; playtest `docs/reports/playtest.md`; performance `docs/reports/performance.md`.
- **Applied after QA:**
  - Playtest retune (config only): longer songs (Easy 12/14/16/18, Normal 24–30, Hard 25–30), fewer pop-ups (`popDelay` 3.6), smaller eruptions, slower crabs, Easy `comboWindow` 6, Coco 7 s / 200 px, `invulnTime` 2.5, `hitForgive` 10, mangoes more useful. Plus `wanderPinch: false` on Easy (only a chasing crab pinches) and `loopCrabs` (one more crab per year from year 3 on Normal/Hard, max +2).
  - Performance: `perf.patch` applied — no sea fill under the opaque ground, idle pre-rasterizing incl. particle sizes that match the draw, stand-in sprites on resize, adaptive quality counts seconds not frames (frame time −38 % at 4× CPU).
  - Visual: palms/volcano turn see-through when Tofu walks behind them; new props grow in with the season crossfade; Coco orbits higher and flatter (never on Tofu's face); crabs doze away from the napping Tofu; Tofu's nap is shown beside the game-over panel; combo badge layout; bushes no longer clipped; custom meadow photos are softened; portrait HUD at the top of the screen; soft blend between the island picture's sea and the tiled sea.
  - Functional: `?bot=1` always starts a real game.
- **Open (P3, not done):** see `docs/reports/visual.md` (notes flying under the HUD, "+N" over Tofu's face, half-note hollow for greyscale, summer vs spring meadow similarity, Coco HUD icon unexplained). On a slow iPad, adaptive quality stops at 0.67× sharpness.
- **Not yet verified:** a real iPhone/iPad, the music and song notes by ear, and the exe on Windows (built on Linux).

## Stack
- HTML5 canvas + plain JavaScript on `window.PVM` in `game/`.
- `world.js` is headless and deterministic: logical stage 960×540 px, y down, fixed 1/120 s steps; top-down ground points with z for things in the air; Tofu accelerates towards the wanted velocity and slides around circle obstacles; volcano notes fly on ballistic arcs with one bounce; crabs seek/wander with obstacle steering; Coco steers with a damped spring.
- `render.js` fits the stage (contain), fills the letterbox with the tileable sea, y-sorts props/characters/notes, interpolates with `world.alpha`, and pre-rasterizes layers and sprites in idle time.
- `audio.js` synthesizes everything; caught notes play the season's song (`Audio.songNote`).
- The Go + WebView2 wrapper in `app/` builds `dist/TofusVolcanoMelody.exe` on ports 48213/48223/48233/48243. JS bridge: `pvStoreAll/pvStoreSet/pvStoreDel/pvFullscreen/pvQuit`.
- Original SVG art from `tools/art-*/gen.py`.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract between modules.
- Kid-friendly: a friendly sleepy-faced volcano (no fire), grumpy-but-cute crabs, a "boing" pinch, never scary; original art and sound only.
- Storage keys use the `pvm:` prefix (all the games share one GitHub Pages origin).
- `app/web/`, `build/`, `dist/`, `tests/out/`, `tests/sim/out/`, `tests/perf/out|scratch/` and the art `out/` folders are build outputs and are gitignored.
