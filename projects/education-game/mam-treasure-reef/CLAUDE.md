# Mầm's Treasure Reef · Mầm Tìm Kho Báu (education game, 2026-10-31, made for Mầm)

## Goal
A long-form (6 lagoons ≈ 30–40 min) learning game for ages 3–7 (default 4) with Tutu the baby sea turtle, two alternating
mechanics (dig = tap the sand mound, drag = sort into chests), profiles with saved stars/pearls/progress, EN/VI voice that
says the child's name ("Mầm") with a Vietnamese voice. Requirement: `REQUIREMENT.md`. Contract: `docs/DESIGN.md`.

## Stack
- HTML5 canvas + plain JS on `window.TR` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../owl-snow-garden/` (namespace → `TR`, storage prefix `tr:`). New: `progress.js` (profiles, lagoons,
  resume), dig mode in `world.js`/`content.js`, reef map / treasure room / profile screens in `ui.js`, loud mastered audio
  with a volume slider in `audio.js`, name-aware speech in `voice.js`.
- All art is original SVG from generators in `tools/` (`art_tutu.py`, `art_sea.py`, `art_env.js`); icons via `tools/render_icons.js`.
  Shapes ("gems") are drawn by code (`render.js drawShape`).
- WebAudio-synthesized sound; Web Speech API for Tutu's voice and optional speech answers.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real touch), `tests/sim` (headless playtests), `tests/visual`.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract between modules, `docs/MECHANICS.md` the tuned numbers.
- Kid-friendly and original only; no fail states; every round must be completable; the crab is never a mistake.
- Every text key must exist in both `en` and `vi` (unit test enforces it).
- URL test flags are never saved into settings; `?profile=test` keeps progress in memory; storage prefix `tr:`.
- Adaptive render quality only resizes the backing store, at the start of a frame (never `World.setViewport`, never between draw and present).
- Mound drawing contract (world ↔ render) is in the header of `game/js/render.js` — keep both sides in sync.
