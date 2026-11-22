# Otto's Playroom Dash

Daily game for 2026-11-22, made with `/build-game random`. A family **3-lane runner** across a giant playroom at bedtime: Otto the little otter collects wooden acorns, jumps foam blocks and bouncy balls, and runs around block towers. The twist: **every biome has its own gravity** — normal hops on the Felt Meadow rug, floaty jumps on the Pillow Mountains, quick heavy hops in the Crayon Jungle, slow moon jumps under the Glow-Star Galaxy.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/otter-toyroom-run/game/ (iPhone, iPad and desktop browsers; add it to the Home Screen for full screen).

## How to play
- Swipe left/right (or tap the left/right third of the screen, or ← → / A D) to change lanes.
- Swipe up (or tap the middle, or ↑ / W / Space) to jump over foam blocks and bouncy balls. Go around the tall towers.
- Collect acorns (+10; every 10 in a row = a chime). Run through the toy-block arch to reach the next biome (bonus + a heart back).
- 4 biomes, then the room loops a bit faster. 3 hearts (Easy 5). Esc/P pause, M sound, F11 full screen.
- The badge at the top shows the gravity: ball = normal, feather = floaty, block = heavy, moon = moon jumps.

## Run locally
Open `game/index.html` in a browser (no build step). Windows exe: `bash tools/build.sh` → `dist/OttosPlayroomDash.exe` (Go + WebView2; data in `%APPDATA%\OttosPlayroomDash\data`).

## Test
- `node tests/unit/run.js` — world/bot/weather unit tests (incl. jump apex/airtime per gravity, fairness)
- `node tests/e2e/smoke.js` — boot → play → every biome + its gravity → game over
- `node tests/e2e/functional.js [--quick] [--only=group]` — full functional suite
- `node tests/e2e/mobile.js`, `node tests/e2e/mobile_qa.js` — iPhone/iPad touch + layout checks
- `node tests/visual/capture.js [group]` — screenshots for visual QA
- `node tests/sim/playtest.js` — headless player-model sims (`docs/reports/playtest.md`)
- `node ../../../shared/daily-mobile/test_extras.js projects/daily-game/otter-toyroom-run` (from the repo root) — Volume + Score Card

URL switches: `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`.

## Layout
`game/` web game (`js/`: rng, world, weather, bot, storage, assets, audio, render, ui, main, extras) · `app/` Windows wrapper · `tools/` art generators, icon + build scripts · `docs/` DESIGN, MECHANICS, art previews, QA reports · `tests/`.
