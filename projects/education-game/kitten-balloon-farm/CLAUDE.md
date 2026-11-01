# Owlet's Snow Garden · Vườn Hoa Cú Tuyết (education game, 2026-10-31)

## Goal
Plant-and-grow learning game for ages 3–7 (default 4) with Lumi the snowy owlet, EN/VI voice. Requirement: `REQUIREMENT.md`.

## Stack
- HTML5 canvas + plain JS on `window.SG` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../dino-nest-sort/` (drag-sort world, content, bot, render, main, ui) with the newer platform files of
  `../puppy-garden-catch/` (voice, input, storage, audio); namespace → `SG`. Content/world/weather/render/art are new:
  seeds, pots, a count planter, an "ask" mode for animals, growth (sink → stem → bloom) and four times of day with an aurora.
- Flowers are drawn by code (`render.js drawFlower`); all other art is original SVG from generators in `tools/`
  (`art_lumi.py`, `art_animals.py`, `art_env.js`); icons via `tools/render_icons.js`.
- WebAudio-synthesized sound; Web Speech API for Lumi's voice and optional speech answers.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real touch), `tests/sim` (headless playtests), `tests/visual`.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract between modules, `docs/MECHANICS.md` the tuned numbers.
- Kid-friendly and original only; no fail states; every round must be completable.
- Every text key must exist in both `en` and `vi` (unit test enforces it).
- URL test flags are never saved into settings; storage prefix is `sg:` (all games share the github.io origin).
- Adaptive render quality only resizes the backing store, at the start of a frame (never `World.setViewport`, never between draw and present).
