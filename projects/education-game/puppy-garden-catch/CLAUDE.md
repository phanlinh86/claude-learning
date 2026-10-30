# Puppy Garden Catch · Cún Con Hứng Quà (education game, 2026-10-30)

## Goal
Catch-the-answer learning game for ages 3–7 (default 4) with Pip the puppy, EN/VI voice. Requirement: `REQUIREMENT.md`.

## Stack
- HTML5 canvas + plain JS on `window.PG` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../dino-nest-sort/` (namespace DN → PG); rng/voice/input/storage/assets/audio/ui/weather are shared ideas,
  content/world/bot/render/art are new.
- Logical short side 720 px, long side 960–1600, safe-area insets passed to `World.setViewport`; the speech bubble's bottom edge
  goes to `World.setTopReserve` so bubbles are born below it.
- Original SVG art from generators in `tools/` (`art_pup.py`, `art_animals.py`, `art_garden.py`, `art_env.js`); icons via `tools/render_icons.js`.
- WebAudio-synthesized sound; Web Speech API for Pip's voice and optional speech answers.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real touch), `tests/sim` (headless playtests), `tests/visual`.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract between modules, `docs/MECHANICS.md` the tuned numbers.
- Kid-friendly and original only; no fail states; every round must be completable.
- Every text key must exist in both `en` and `vi` (unit test enforces it).
- URL test flags are never saved into settings; storage prefix is `pg:` (Dino Nest Sort shares the github.io origin).
