# Comet's Gem Factory

Game of the day for 2026-11-13, made with `/build-game random`. Comet is a little kitten with a rocket backpack who works at the friendliest factory in town. Gizmo the robot builds toys, but only from matching gems! Flip two cards, find the twin gems, and Comet zooms them into Gizmo's hopper. Match pairs in a row to grow the combo meter (×2 … ×5), beat the fuel-gauge clock, and work through the seasons from a blossom spring to a snowy winter.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/kitten-gem-factory/game/ (iPhone, iPad, desktop browser). On iPhone or iPad, choose "Add to Home Screen" to play full screen.

## How to play
- **Touch / mouse:** tap a card to flip it; tap a second to find its twin.
- **Keyboard:** arrow keys / WASD move the highlight, Space or Enter flips; Esc/P pause; M sound; F11 full screen.
- Match = **10 × your combo multiplier**. A run of matches grows the multiplier to ×5. An unlucky *first* look never breaks your combo.
- Each match adds a few seconds to the gauge. Clear the board before the time runs out; a perfect, no-combo-broken season is worth a bonus.
- **Change Pictures** lets you use your own photo or drawing for Comet, a gem (it becomes a pair on every board) and the factory wall.

## Difficulty
Easy (default) is for 4–6-year-olds: generous time and a long "Remember!" peek. Normal suits older kids and casual adults; Hard is an adult mode. After winter the year starts again, a little faster.

## Build (portable Windows exe)
```
bash tools/build.sh      # → dist/CometsGemFactory.exe (PE32+ GUI x86-64)
```
Needs Go 1.22+, Node + Playwright (icon render only) and Python 3 + Pillow. If the Go proxy is blocked, use `GOPROXY=direct GOSUMDB=off bash tools/build.sh`. On Windows, SmartScreen may warn on first run → **More info → Run anyway**. Saves settings/best score under `%APPDATA%\CometsGemFactory\data`.

## Test / dev URL switches
`?speed=N&bot=1&skill=0.8&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`
- `node tests/unit/run.js` — simulation unit tests (30).
- `node tests/e2e/smoke.js` — Playwright smoke.
- `node tests/e2e/functional.js` — full functional suite (415).
- `node tests/sim/run.js` — high-speed playtest harness.

## Layout
`game/` the game (plain JS on `window.CGF`) · `app/` Go + WebView2 wrapper · `tools/art-*` SVG generators and the build/icon scripts · `docs/` DESIGN.md, MECHANICS.md and QA reports · `tests/` unit, e2e, sim, visual, perf.

Made with `/build-game random`. Browsers cache for ~10 minutes — hard-refresh (Ctrl/Cmd+Shift+R) to see an update.
