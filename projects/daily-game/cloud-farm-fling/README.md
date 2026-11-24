# Nubi's Farm Fling

Game of the day for 2026-11-24, made with `/build-game random`. Nubi is a fluffy little rain cloud. You fling him from a hay-bale slingshot across the farm. He gulps fireflies in mid-air, puffs up bigger and bigger, and tries to land on the planter wagon to rain on the thirsty crops. Big Nubi rains wider but floats more, so the same pull flies a shorter, loftier arc.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/cloud-farm-fling/game/ (iPhone, iPad, desktop browser). On iPhone or iPad, choose "Add to Home Screen" to play full screen.

## How to play
- **Fling:** drag back anywhere on the screen and let go. The dots show where Nubi will fly (they already include his size).
- **Puff:** while Nubi is in the air, tap once to puff a little higher. You get one puff per fling.
- **Growing:** Nubi slowly soaks up mist (up to 1.3×) and every firefly makes him bigger (up to 1.7×). Bigger Nubi catches fireflies from further away and rains over more of the wagon, but he is more buoyant and catches more air. Raining uses water up, so he shrinks back halfway after each landing; a plop squeezes a bit out.
- **Points:**
  - each firefly +1 (golden firefly +3);
  - raining on the wagon +2;
  - the dark thirsty patch in the middle (bullseye) +3 more;
  - Big Shower (landing at 1.4× or bigger) +2;
  - each landing in a row adds +1 more, up to +4.
- **Hearts:** plopping onto the grass costs a heart. Fireflies give hearts back: every 12 on Easy, 20 on Normal, 25 on Hard.
- **Seasons:** water the wagon 6 (Easy) / 9 (Normal) / 10 (Hard) times to move on: Spring Sprouts → Sunflower Summer (the wagon rolls) → Pumpkin Autumn (a sleepy crow) → Snowy Winter (two crows; Nubi snows). Then the seasons loop, a little harder each round.
- **Keyboard:** `←` `→` power, `↑` `↓` angle, `Space` fling (again in the air = puff), `Esc` pause, `M` sound, `F11` full screen.
- **Change Pictures:** use your own picture for Nubi, the firefly or any of the four seasons. Pictures are saved on this device only.

## Build and test
- Windows exe: `bash tools/build.sh` → `dist/NubisFarmFling.exe` (Go, Node + Playwright, Python + Pillow; if the Go proxy is blocked use `GOPROXY=direct GOSUMDB=off`).
- Unit tests: `node tests/unit/run.js`
- Smoke test: `node tests/e2e/smoke.js`
- Functional tests: `node tests/e2e/functional.js` (`--quick` for a shorter run)
- Mobile extras: `node shared/daily-mobile/test_extras.js projects/daily-game/cloud-farm-fling` (from the repo root)
- Visual capture: `node tests/visual/capture.js`
- Playtest simulations: `node tests/sim/playtest.js`
- Art generators: `node tools/art-characters/gen.js`, `node tools/art-environment/gen.js` (contact sheets: `sheet.js` next to them)

## URL switches (for testing)
`?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N&size=S`
These flags are never saved into the settings.

## Layout
- `game/` — the web game: plain JavaScript on `window.CFF`, no build step.
  - `world.js` — rules and physics (no drawing): one step function for flight, preview, bot and firefly arcs; growth, buoyancy and drag.
  - `bot.js` — the autopilot; `weather.js` — season particles and bursts.
  - `render.js` — drawing; `main.js` — input and game modes; `ui.js` — menus; `audio.js` — WebAudio sounds and music; `extras.js` — volume slider + Score Card (shared daily-mobile layer).
- `app/` — the Go + WebView2 Windows wrapper.
- `tools/` — build script, icon tools, art generators.
- `docs/` — `DESIGN.md` (contract), `MECHANICS.md`, QA reports in `reports/`.
- `tests/` — unit, end-to-end, visual and simulation tests.
