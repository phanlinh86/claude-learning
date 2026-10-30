# Pip's Candy Dash (daily game, 2nd roll of 2026-10-29)

## Goal
Family-friendly top-down collector in Candy Land. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Stack
Same as the other games in `projects/daily-game/`:
- HTML5 canvas + plain JS on `window.CD` in `game/`.
- Go + WebView2 wrapper in `app/` → `dist/PipsCandyDash.exe` (port 47615).
- Original SVG art, with generators in `tools/art-*`.
- WebAudio-synthesized sound.
- Node unit tests + Playwright e2e tests.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract between modules.
- Kid-friendly, original art and sound only.
- `app/web/`, `build/`, `dist/` are build outputs (gitignored).
