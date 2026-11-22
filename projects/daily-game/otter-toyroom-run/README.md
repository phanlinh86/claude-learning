# Pebble's Oasis Run

Daily game for 2026-11-07, made with `/build-game random`. A family **3-lane runner** through a storybook desert oasis: Pebble the little robot pup runs chapter by chapter, collecting seashells, while Fizz the fennec fox lobs pillows from his flying carpet every 30 s.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/robot-oasis-run/game/ (iPhone, iPad and desktop browsers; add it to the Home Screen for full screen).

## How to play
- Swipe left/right (or tap the left/right third of the screen, or ← → / A D) to change lanes.
- Swipe up (or tap the middle, or ↑ / W / Space) to jump over logs, tumbleweeds and pillows. Go around the tall pots.
- Collect shells (+10). Fizz visits every 30 s: watch the pillow shadows and dodge; dodge them all for a bonus.
- 4 chapters: The Palm Grove → The Singing Dunes → The Lantern Bazaar → The Starry Oasis, then the book starts again, faster.
- 3 hearts (Easy 5); a new chapter gives one back. Esc/P pause, M sound, F11 full screen.

## Run locally
Open `game/index.html` in a browser (no build step). Windows exe: `bash tools/build.sh` → `dist/PebblesOasisRun.exe` (Go + WebView2; data in `%APPDATA%\PebblesOasisRun\data`).

## Test
- `node tests/unit/run.js` — world/bot/weather unit tests
- `NODE_PATH=$(npm root -g) node tests/e2e/smoke.js` — boot → play → every chapter → game over
- `NODE_PATH=$(npm root -g) node tests/e2e/functional.js` — full functional suite
- `NODE_PATH=$(npm root -g) node tests/visual/capture.js` — screenshots for visual QA
- `node tests/sim/playtest.js` — headless player-model sims (`docs/reports/playtest.md`)

URL switches: `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`.

## Layout
`game/` web game (`js/`: rng, world, weather, bot, storage, assets, audio, render, ui, main) · `app/` Windows wrapper · `tools/` art generators, icon + build scripts · `docs/` DESIGN, MECHANICS, art previews, QA reports · `tests/`.
