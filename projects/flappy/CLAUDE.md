# Flappy (Family Flappy)

## Goal
A family-friendly Flappy-Bird-style desktop game for Windows 11. No pipes: the bird must keep flapping
(or it lands on the ground), every flap drops a treat, and a treat landing on a crawling turtle's shell scores.
Seasons (spring → summer → autumn → winter) change every N points, with their own background and weather.
Players can replace the bird, treat, turtle and season backgrounds with their own pictures.

## Status
v1 built. Stack decided:
- Game: HTML5 canvas + plain JavaScript (classic scripts on a `window.FF` namespace, no build step) in `game/`.
- Windows app: Go + WebView2 (`github.com/jchv/go-webview2`, cgo-free) in `app/`, cross-compiled to `dist/FamilyFlappy.exe`.
- Art: original hand-written SVG (generators in `tools/art-*`). Sound: synthesized with WebAudio (no audio files).
- Tests: `tests/unit` (node, simulation) and `tests/e2e` (Playwright/Chromium).

## Rules for this project
- Keep all code for this project inside `projects/flappy/`.
- `docs/DESIGN.md` is the contract between modules (World / Weather / Bot / Renderer field names). Update it when a contract changes.
- Everything must stay kid-friendly (no violence, scary or gross content) and all art/sound must be original or properly licensed.
- Record how to install, run and test it in `README.md`.
- `app/web/`, `build/` and `dist/` are build outputs (gitignored); the exe is attached to releases / copied to the user's folder.
