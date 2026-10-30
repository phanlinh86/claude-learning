# Dino Nest Sort · Khủng Long Xếp Tổ (education game, 2026-10-29)

## Goal
Drag-and-sort learning game for ages 3–7 (default 4) with Bo the baby dinosaur, EN/VI voice. Requirement: `REQUIREMENT.md`.

## Stack
- HTML5 canvas + plain JS on `window.DN` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Logical short side 720 px, long side 960–1600 (any phone/tablet shape), safe-area insets passed to `World.setViewport`.
- Original SVG art from generators in `tools/art_*.{py,js}`; app icons via `tools/render_icons.js`.
- WebAudio-synthesized sound; Web Speech API for Bo's voice and optional speech answers.
- Node unit tests (`tests/unit`), Playwright e2e (`tests/e2e`), headless sims (`tests/sim`), visual capture (`tests/visual`).

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract between modules.
- Kid-friendly and original only; no fail states; every round must be completable.
- Every text key must exist in both `en` and `vi` (unit test enforces it).
- URL test flags are never saved into settings.
