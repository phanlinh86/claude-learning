# Biscuit's Kitchen Flight

Game of the day for 2026-11-12, made with `/build-game random`. Biscuit is a little robot pup with a spinning propeller on his head. Grandma is making soup and the herb leaves have floated all over the kitchen! Tap to puff Biscuit up, glide past hanging ladles, pot stacks and steamy kettles, and catch the mint, basil and bay leaves — from a sunny morning to a snowy night, when only Biscuit's nose lamp lights the way.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/pup-kitchen-flight/game/ (iPhone, iPad, desktop browser). On iPhone or iPad, choose "Add to Home Screen" to play full screen.

## How to play
- **Fly:** tap or click anywhere (or `Space`, `↑`, `W`) to puff up; let go and Biscuit glides down. The first tap starts the flight.
- **Points:** each leaf +1, each obstacle passed +1, a level with no bumps +5.
- **Batteries:** a bump (utensil, pot stack, kettle or the counter) costs a battery and Biscuit blinks safely for a moment. Leaves charge batteries back. Easy: 4 batteries, one back every 6 leaves; Normal: 3 / every 25; Hard: 3 / every 30. No batteries left: Biscuit takes a nap (game over).
- **Steam** above a kettle gently lifts Biscuit (never hurts). **Wind** at sunset pushes up or down after a 1 s warning arrow.
- **The day passes:** Sunny Morning → Rainy Noon → Windy Sunset → Snowy Night (about 60 s each), then day 2, a little faster. At night the kitchen gets dark; the nose lamp, glowing leaves and glowing obstacles keep it readable.
- **Keyboard:** `Esc`/`P` pause, `M` sound, `F11` full screen.
- **Change Pictures:** use your own picture for Biscuit, the leaves or the kitchen wall. Pictures are saved on this device only.

## Build and test
- Windows exe: `bash tools/build.sh` → `dist/BiscuitsKitchenFlight.exe`. Needs Go, Node with Playwright, and Python with Pillow. If the Go proxy is blocked, run it with `GOPROXY=direct GOSUMDB=off`. Player data is saved in `%APPDATA%\BiscuitsKitchenFlight\data`.
- Unit tests: `node tests/unit/run.js`
- Smoke test: `node tests/e2e/smoke.js`
- Functional tests: `node tests/e2e/functional.js`
- Visual capture: `node tests/visual/capture.js` (`ONLY=screens|zones|motion|custom|hud|kettle`)
- Playtest simulations: `node tests/sim/run.js --quick`
- Art generators: `python3 tools/art-characters/gen.py` and `python3 tools/art-environment/gen.py`

## URL switches (for testing)
`?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N`
These flags are never saved into the settings, and runs that use them never save a best score.

## Layout
- `game/` — the web game: plain JavaScript on `window.BKF`, no build step.
  - `world.js` — the rules and motion (no drawing); `bot.js` — the autopilot; `weather.js` — particles.
  - `render.js` — drawing (parallax kitchen, night lamp); `main.js` — input and modes; `ui.js` — menus; `audio.js` — WebAudio sounds and music.
- `app/` — the Go + WebView2 Windows wrapper.
- `tools/` — the build script, the icon tools and the art generators.
- `docs/` — `DESIGN.md` (the contract between modules), `MECHANICS.md`, and the QA reports in `reports/`.
- `tests/` — unit, end-to-end, visual and simulation tests.
