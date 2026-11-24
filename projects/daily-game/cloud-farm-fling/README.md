# Finn's Island Fling

Game of the day for 2026-11-09, made with `/build-game random`. Finn is a little pirate fox. You fling him from a palm-tree slingshot across the sea. He grabs magic leaves in mid-air and tries to land on the treasure raft. As day turns to night, only the lanterns and the glowing leaves light the way.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/fox-island-fling/game/ (iPhone, iPad, desktop browser). On iPhone or iPad, choose "Add to Home Screen" to play full screen.

## How to play
- **Fling:** drag back anywhere on the screen and let go. The dots show where Finn will fly.
- **Flutter:** while Finn is in the air, tap once to flutter a little higher. You get one flutter per fling.
- **Points:**
  - each leaf +1 (a glowing moon leaf at night +2);
  - landing on the raft +2;
  - landing on the red X (bullseye) +3 more;
  - each landing in a row adds +1 more, up to +4.
- **Hearts:** a splash into the sea costs a heart. Collecting leaves gives hearts back: every 12 leaves on Easy, 20 on Normal, 25 on Hard.
- **Islands:** land 5 times to sail on to the next island: Sunny Cove → Jungle Isle → Coral Lagoon → Lantern Bay. After Lantern Bay the islands loop again, a little harder each round.
- **Keyboard:**
  - `←` `→` change the power;
  - `↑` `↓` change the angle;
  - `Space` flings, and `Space` again in the air flutters;
  - `Esc` pauses, `M` turns sound on or off, `F11` switches full screen.
- **Change Pictures:** use your own picture for Finn, the leaf or any of the four islands. The pictures are saved on this device only.

## Build and test
- Windows exe: `bash tools/build.sh` → `dist/FinnsIslandFling.exe`. Needs Go, Node with Playwright, and Python with Pillow. If the Go proxy is blocked, run it with `GOPROXY=direct GOSUMDB=off`.
- Unit tests: `node tests/unit/run.js`
- Smoke test: `node tests/e2e/smoke.js`
- Functional tests: `node tests/e2e/functional.js` (add `--quick` for a shorter run)
- Visual capture: `node tests/visual/capture.js`
- Playtest simulations: `node tests/sim/playtest.js`
- Art generators: `node tools/art-characters/gen.js` and `node tools/art-environment/gen.js`

## URL switches (for testing)
`?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N&day=T`
These flags are never saved into the settings.

## Layout
- `game/` — the web game: plain JavaScript on `window.FIF`, no build step.
  - `world.js` — the game rules and physics (no drawing).
  - `bot.js` — the autopilot.
  - `weather.js` — particles.
  - `render.js` — drawing.
  - `main.js` — input and game modes.
  - `ui.js` — menus.
  - `audio.js` — sounds and music, made with WebAudio.
- `app/` — the Go + WebView2 Windows wrapper.
- `tools/` — the build script, the icon tools and the art generators.
- `docs/` — `DESIGN.md` (the contract between modules), `MECHANICS.md`, and the QA reports in `reports/`.
- `tests/` — unit, end-to-end, visual and simulation tests.
