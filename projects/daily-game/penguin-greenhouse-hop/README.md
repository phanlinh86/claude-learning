# Puddle's Greenhouse Hop

Daily game for 2026-11-23, made with `/build-game random`. A family **vertical platform hopper**: Puddle the little penguin in a coral rain hood bounces up the four floors of a rainy glass greenhouse, off flower pots, potting shelves, bendy leaves and swinging hanging baskets, catching fireflies, and slowly growing bigger and rounder.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/penguin-greenhouse-hop/game/ (iPhone, iPad and desktop browsers; add it to the Home Screen for full screen).

## How to play
- Puddle bounces by herself. Hold the left or right half of the screen (or ← → / A D) to steer her onto the next platform.
- Catch fireflies (+10). 15 fireflies fill the lantern jar and give back a heart.
- **Twist: Puddle grows.** A little all the time and a bit more with each firefly (up to 1.6×). Big Puddle (the bar in the HUD past its mark) catches fireflies from further away, bends leaves deeper (they flick her higher) and scores **×2** per metre, but she is heavier, so steering is slower. At each new floor she shakes off the rain, shrinks back and gets a size bonus.
- Leaves bend under her weight and wobble back; hanging baskets swing like pendulums; red mushrooms on pots throw her very high.
- Falling off the bottom costs a heart; an upside-down umbrella catches Puddle and throws her back up. Easy has 5 hearts, Normal and Hard 3.
- 4 floors: Potting Shed → Fern Floor → Orchid Balcony → Rooftop Rain Garden, then the tower loops, a little harder. Each new floor gives a heart back.
- Esc/P pause, M sound, F11 full screen. Change Pictures swaps Puddle, the firefly and the four floor backgrounds for your own photos or drawings.

## Run locally
Open `game/index.html` in a browser (no build step). Windows exe: `bash tools/build.sh` → `dist/PuddlesGreenhouseHop.exe` (Go + WebView2; data in `%APPDATA%\PuddlesGreenhouseHop\data`). If the Go proxy is blocked: `GOPROXY=direct GOSUMDB=off bash tools/build.sh`.

## Test
- `node tests/unit/run.js`: world/bot/weather unit tests (growth, leaves, baskets, reachability)
- `node tests/e2e/smoke.js`: boot → play → grow big → every floor → game over
- `node tests/e2e/functional.js [--quick]`: full functional suite (`docs/reports/functional.md`)
- `node tests/visual/capture.js [only=…]`: screenshots and contact sheets for visual QA (`docs/reports/visual.md`)
- `node tests/sim/pacing.js`, `node tests/sim/run.js`: headless player-model sims (`docs/reports/playtest.md`)
- `node ../../../shared/daily-mobile/test_extras.js .` (from the repo root: `node shared/daily-mobile/test_extras.js projects/daily-game/penguin-greenhouse-hop`)

URL switches: `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`.

## Layout
`game/` web game (`js/`: rng, world, weather, bot, storage, assets, audio, render, ui, main, extras) · `app/` Windows wrapper · `tools/` art generators, icon + build scripts · `docs/` DESIGN, MECHANICS, QA reports · `tests/`.
