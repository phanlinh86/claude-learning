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

## Status
- v1.1 desktop + web game (Windows exe, browser).
- 2026-11-14: mobile platform layer for iPhone / iPad (Safari, portrait + landscape, Add to Home Screen): full-window canvas with candy scenery in the letterbox, safe-area HUD, touch steering aimed above the finger, second-finger buttons + ghost-click guard, kid-proofing, pause + audio suspend on app switch, rotate card for upright phones, manifest + icons (`tools/render_mobile_icons.js`). Tests: unit 31/31, functional 241/241, `tests/e2e/mobile.js` 101/101, `shared/daily-mobile/test_extras.js` passed.
- Don't edit `game/js/extras.js`, its `<script>` tag, or the audio chain in `game/js/audio.js` (`setVolume` / `_iosKick` / `user` gain): they are shared daily-game extras.

