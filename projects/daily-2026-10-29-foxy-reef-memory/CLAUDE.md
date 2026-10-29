# Foxy's Reef Memory (daily game 2026-10-29)

## Goal
Family-friendly memory-match card game on a coral reef. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Stack
Same as `projects/flappy`: HTML5 canvas + plain JS on `window.RF` in `game/`, Go + WebView2 wrapper in `app/` → `dist/FoxyReefMemory.exe`, original SVG art (generators in `tools/art-*`), WebAudio-synthesized sound, node unit tests + Playwright e2e tests.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract between modules.
- Kid-friendly, original art and sound only.
- `app/web/`, `build/`, `dist/` are build outputs (gitignored).
