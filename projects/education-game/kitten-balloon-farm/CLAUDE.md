# Kitten's Balloon Farm · Bóng Bay Nông Trại Mèo Con (education game, 2026-11-01)

## Goal
Tap-to-pop learning game for ages 3–7 (default 4) with Miu the kitten on a sunny farm, EN/VI voice. Requirement: `REQUIREMENT.md`.

## Stack
- HTML5 canvas + plain JS on `window.KB` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../owl-snow-garden/` (state machine, voice, input, storage, audio, ui, main, tests), namespace → `KB`.
  New: a tap/pop world (`world.js`: buoyant balloons, verlet strings, pop on touch-down, falling farm friends, count/ask modes),
  `content.js` for balloons, `balloon_art.js` (balloons drawn by code, cached), farm weather with butterflies and fireflies.
- All other art is original SVG from generators in `tools/` (`art_miu.py`, `art_animals.py`, `art_env.js`); icons via `tools/render_icons.js`.
- WebAudio-synthesized sound; Web Speech API for Miu's voice and optional speech answers.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real touch), `tests/sim` (headless playtests), `tests/visual`.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract between modules, `docs/MECHANICS.md` the tuned numbers (`KB.CONFIG`).
- Kid-friendly and original only; no fail states; every round must be completable.
- Every text key must exist in both `en` and `vi` (unit test enforces it).
- URL test flags are never saved into settings; storage prefix is `kb:` (all games share the github.io origin).
- Prompts are protected: praise / wrong lines never interrupt Miu's instruction while it is being spoken (`speakPrompt` in main.js).
- Adaptive render quality only resizes the backing store, at the start of a frame (never `World.setViewport`).
