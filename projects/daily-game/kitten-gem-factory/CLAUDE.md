# Comet's Gem Factory (daily game, 2026-11-13)

## Goal
A family-friendly memory-match game with a combo meter. Comet the rocket kitten flips cards to find twin gems and zooms them into Gizmo the robot's hopper; matching pairs in a row grows a ×1→×5 score multiplier. Four seasons seen through the factory windows (Spring 4×3, Summer 4×4, Autumn 5×4, Winter 6×4), a fuel-gauge timer, then the year loops faster. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
v1.0, built and tested on 2026-11-13.
- **QA results:** unit 30/30; smoke passes; functional 415/415 (`docs/reports/functional.md`); visual review `docs/reports/visual.md`; playtest `docs/reports/playtest.md`; performance `docs/reports/performance.md`.
- **Applied after QA:**
  - Playtest: new difficulty table (Easy time 105/160/215/275, matchBonus 6, peek 2.5; Normal 60/80/100/120; Hard 22/28/35/42). Added `missLock` (a wrong pair can't be mashed-through free) and a **tidy bonus** (clear time-bonus scaled by accuracy) — together these close a spam-tapping exploit that had beaten real memory play. Per-difficulty next-year loop factor. 4-year-old model now clears Easy 97/87/79/69 %.
  - Visual P1: Comet hovers in the gutter beside the tapped card (no longer covering it), drawn at 0.8 over the board; the bench behind the cards is opaque with new per-season colours; portrait fills the lower band with wooden floor.
  - Visual P2: flyer arcs stay below the HUD and launch at card-gem size; "+N ×M" pops on the matched card; stronger wrong-pair wiggle + red tint; octagon redrawn as a tall cushion cut (distinct from the hexagon under colour-blindness); title scrim + logo stroke; bench sized to the grid; simpler, bigger How-to-Play copy.
  - Performance: `perf.patch` applied — prewarm forces the next season's layers/sprites to rasterize in idle time (kills the crossfade hitch); flyer gem drawn at a fixed size then scaled (fixes a sprite-cache leak); card deal-slide interpolated with `world.alpha`; adaptive quality also watches the real frame interval; cached bench plate and 1:1 card blits.
  - Functional: HUD moves to the safe-area top on short landscape; saved settings are type-checked; `app/main.go` sets MIME types for .js/.css/.svg/.json/.webmanifest.
- **Open (P3, not done):** game-over gradient, gears over a custom wall, banner opacity during clear, edge-on gem darkening (`docs/reports/visual.md`). On iPad portrait the band above the factory is tall. Comet at 0.8 scale can still clip top-row neighbours' corners (not the gems).
- **Not yet verified:** a real iPhone/iPad, the music by ear, and the exe on Windows (built on Linux).

## Stack
- HTML5 canvas + plain JavaScript on `window.CGF` in `game/`.
- `world.js` is headless and deterministic: logical stage 960×540 px, y down, fixed 1/120 s steps; cards laid out in `BOARD`, Comet steers with a damped spring, matched gems fly on a ballistic arc to Gizmo's hopper.
- `render.js` fits the stage (contain) and fills the letterbox with the tileable layers (outside 0.08… parallax); card plates, the season bench and gem sprites are pre-rasterized/cached.
- The Go + WebView2 wrapper in `app/` builds `dist/CometsGemFactory.exe` on ports 48113/48123/48133/48143. JS bridge: `cgStoreAll/cgStoreSet/cgStoreDel/cgFullscreen/cgQuit`.
- Original SVG art from `tools/art-*/gen.py`; sound synthesized with WebAudio.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract between modules.
- Kid-friendly: happy robot beeps, gem clinks, a sleepy yawn on game over; never scary; original art and sound only.
- Storage keys use the `cgf:` prefix (all the games share one GitHub Pages origin).
- `app/web/`, `build/`, `dist/`, `tests/out/`, `tests/sim/out/` and the art `out/` folders are build outputs and are gitignored.
