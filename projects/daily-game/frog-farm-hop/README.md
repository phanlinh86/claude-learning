# Clover's Farm Hop

Daily game for 2026-11-08, made with `/build-game random`. A family **vertical platform hopper**: Clover the little frog bounces up from the farmyard into the sky, off hay bales, fence planks, rolling hay carts and puffy clouds, catching fireflies for her lantern, while the wind keeps changing its mind.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/frog-farm-hop/game/ (iPhone, iPad and desktop browsers; add it to the Home Screen for full screen).

## How to play
- Clover bounces by herself. Hold the left or right half of the screen (or ← → / A D) to steer her onto the next platform.
- Catch fireflies (+10). 15 fireflies fill the lantern and give back a heart.
- When the weather vane spins, a wind gust is coming. Steer against it; each gust can blow the other way.
- Puff clouds go poof after one bounce (they grow back). Springs throw you very high.
- Falling off the bottom costs a heart; a trampoline catches Clover and throws her back up. Easy has 5 hearts, Normal and Hard 3.
- 4 weather levels: Sunny Meadow → Rainy Orchard → Windy Hill → Snowy Rooftops, then the weather loops, a little harder. Each new level gives a heart back.
- Esc/P pause, M sound, F11 full screen. Change Pictures swaps Clover, the firefly and the four backgrounds for your own photos or drawings.

## Run locally
Open `game/index.html` in a browser (no build step). Windows exe: `bash tools/build.sh` → `dist/CloversFarmHop.exe` (Go + WebView2; data in `%APPDATA%\CloversFarmHop\data`). If the Go proxy is blocked: `GOPROXY=direct GOSUMDB=off bash tools/build.sh`.

## Test
- `node tests/unit/run.js`: world/bot/weather unit tests
- `node tests/e2e/smoke.js`: boot → play → wind gust → every weather level → game over
- `node tests/e2e/functional.js [group…]`: full functional suite (`docs/reports/functional.md`)
- `node tests/visual/capture.js`: screenshots and contact sheets for visual QA (`docs/reports/visual.md`)
- `node tests/sim/run.js [--patch] [--quick]`: headless player-model sims (`docs/reports/playtest.md`)

URL switches: `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`.

## Layout
`game/` web game (`js/`: rng, world, weather, bot, storage, assets, audio, render, ui, main) · `app/` Windows wrapper · `tools/` art generators, icon + build scripts · `docs/` DESIGN, MECHANICS, QA reports · `tests/`.
