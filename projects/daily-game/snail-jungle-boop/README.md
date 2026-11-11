# Zippy's Jungle Boop

Game of the day for 2026-11-11, made with `/build-game random`. Zippy the snail has a tiny jetpack on his shell and a glowing light that changes colour. Jungle friends (a monkey, a frog and a toucan) peek out of their burrows holding coloured stars. Tap a friend whose star matches Zippy's colour and he zooms over for a gentle *boop*!

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/snail-jungle-boop/game/ (iPhone, iPad, desktop browser). On iPhone or iPad, choose "Add to Home Screen" to play full screen.

## How to play
- **Match the colour:** Zippy's antennae, his jetpack flame and the big star at the top show his colour. Each colour also has a shape (Coral heart, Sunny sun, Sky drop, Grape moon), so colour-blind players can match by shape.
- **Boop:** tap or click a friend holding a star of that colour (the whole burrow counts). Keys `1`–`9` boop burrows, back row first.
- **Points:** boop +10 × multiplier (×2 from combo 5, ×3 from combo 10); biome cleared +50.
- **Leaves (lives):** start with 4 (max 5), +1 every 12 boops. A wrong colour makes Zippy dizzy and costs a leaf. On Normal and Hard, a matching friend that ducks away un-booped also costs a leaf (never on Easy). No leaves left: game over.
- **Colour changes:** every 6 boops (or 14 s), Zippy blinks for 1 s and switches colour; the old colour still counts for 1.5 s.
- **No mashing:** 3 taps on empty burrows within a second make Zippy take a little nap (no leaf lost).
- **Biomes:** 15 boops fill the green ring: Riverbank Morning → Bamboo Grove → Treetop Canopy → Waterfall Ruins, then round 2, a bit faster. On Easy, friends with the right colour glow softly.
- **Keyboard:** `1`–`9` boop, `Esc`/`P` pause, `M` sound, `F11` full screen.
- **Change Pictures:** use your own picture for Zippy, the jungle friends or any of the four biomes. Pictures are saved on this device only.

## Build and test
- Windows exe: `bash tools/build.sh` → `dist/ZippysJungleBoop.exe`. Needs Go, Node with Playwright, and Python with Pillow. If the Go proxy is blocked, run it with `GOPROXY=direct GOSUMDB=off`. Player data is saved in `%APPDATA%\ZippysJungleBoop\data`.
- Unit tests: `node tests/unit/run.js`
- Smoke test: `node tests/e2e/smoke.js`
- Functional tests: `node tests/e2e/functional.js` (`SOAK=20` for a shorter bot soak)
- Visual capture: `node tests/visual/capture.js`
- Playtest simulations: `node tests/sim/run.js` (`--quick` for fewer seeds)
- Art generators: `node tools/art-characters/gen.js` and `node tools/art-environment/gen.js`

## URL switches (for testing)
`?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N`
These flags are never saved into the settings, and runs that use them never save a best score.

## Layout
- `game/` — the web game: plain JavaScript on `window.ZJB`, no build step.
  - `world.js` — the game rules and motion (no drawing); `bot.js` — the autopilot; `weather.js` — biome particles.
  - `render.js` — drawing; `main.js` — input and game modes; `ui.js` — menus; `audio.js` — WebAudio sounds and music.
- `app/` — the Go + WebView2 Windows wrapper.
- `tools/` — the build script, the icon tools and the art generators.
- `docs/` — `DESIGN.md` (the contract between modules), `MECHANICS.md`, and the QA reports in `reports/`.
- `tests/` — unit, end-to-end, visual and simulation tests.
