# Mochi's Fairy Bounce

Game of the day for 2026-11-10, made with `/build-game random`. Mochi the little panda carries a bouncy mushroom cap over his head and keeps a glowing fairy-light ball bouncing into the flower blocks of a magic forest. Break every block to bring the next season, catch the falling stars, and dodge the soft pillows that Hoot the sleepy owl throws.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/panda-fairy-bounce/game/ (iPhone, iPad, desktop browser). On iPhone or iPad, choose "Add to Home Screen" to play full screen.

## How to play
- **Move:** slide a finger anywhere (or move the mouse) and Mochi follows left and right.
- **Serve:** tap or click. The ball also serves by itself after 3 seconds.
- **Aim:** where the ball lands on the cap sets its angle. The middle sends it straight up and the edges send it sideways.
- **Points:**
  - block +10 (dark blocks need 2 hits, +10 each);
  - every block after the 2nd before the ball comes back to the cap: +5 combo;
  - falling star caught +50;
  - ball bonks Hoot +30, and 3 bonks in a season tickle him for +100;
  - ball pops a pillow +10;
  - season cleared +100, plus +20 per heart.
- **Hearts:** you start with 3 (max 5). The ball falling past Mochi costs one. You get +1 for every 10 stars and +1 for every season. On Easy a glowing fairy vine catches the ball up to 8 times per season (once on Normal).
- **Hoot's pillows:** every 35/30/25 s (Easy/Normal/Hard) a pillow drifts down. The shadow shows where. If it bonks Mochi he gets sleepy and slow for a moment. It never costs a heart.
- **Seasons:** Spring Meadow → Summer Glade → Autumn Hollow → Winter Glow, then round 2, a little faster with more dark blocks.
- **Keyboard:** `←` `→` (or `A` `D`) move, `Space`/`Enter` serve, `Esc`/`P` pause, `M` sound, `F11` full screen.
- **Change Pictures:** use your own picture for Mochi, the ball, the star or any of the four seasons. Pictures are saved on this device only.

## Build and test
- Windows exe: `bash tools/build.sh` → `dist/MochisFairyBounce.exe`. Needs Go, Node with Playwright, and Python with Pillow. If the Go proxy is blocked, run it with `GOPROXY=direct GOSUMDB=off`. Player data is saved in `%APPDATA%\MochisFairyBounce\data`.
- Unit tests: `node tests/unit/run.js`
- Smoke test: `node tests/e2e/smoke.js`
- Functional tests: `node tests/e2e/functional.js` (add `--quick` for a shorter run)
- Visual capture: `node tests/visual/capture.js`
- Playtest simulations: `node tests/sim/playtest.js` (`--patch <name>` to try CONFIG changes)
- Art generators: `node tools/art-characters/gen.js` and `node tools/art-environment/gen.js`

## URL switches (for testing)
`?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N`
These flags are never saved into the settings.

## Layout
- `game/` — the web game: plain JavaScript on `window.MFB`, no build step.
  - `world.js` — the game rules and physics (no drawing).
  - `bot.js` — the autopilot (title demo and tests).
  - `weather.js` — the seasonal particles.
  - `render.js` — drawing.
  - `main.js` — input and game modes.
  - `ui.js` — menus.
  - `audio.js` — sounds and music, made with WebAudio.
- `app/` — the Go + WebView2 Windows wrapper.
- `tools/` — the build script, the icon tools and the art generators.
- `docs/` — `DESIGN.md` (the contract between modules), `MECHANICS.md`, and the QA reports in `reports/`.
- `tests/` — unit, end-to-end, visual and simulation tests.
