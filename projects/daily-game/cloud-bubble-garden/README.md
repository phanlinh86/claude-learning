# Nimbus's Bubble Garden

Daily game for 2026-11-06, made with `/build-game random`. It's raining in the garden, and every puddle blows shiny bubbles with a gem inside. Nimbus the little cloud sprite **floats after your finger** (or the mouse) and pops them: *bloop!* Each gem flies into the gem jar and makes Nimbus **bigger and fluffier**. A bigger Nimbus earns more points per gem, but she is also a bigger target for the prickly chestnut burrs that wiggle at the top and then drop from the trees. At full size she bursts into a happy **rain shower** that pops every bubble at once, and starts small again. Fill the jar to go on: Dawn → Noon → Sunset → Night, then round again, a bit faster.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/cloud-bubble-garden/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/NimbusBubbleGarden.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\NimbusBubbleGarden\data`.

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Move Nimbus | ← ↑ → ↓ / WASD | drag a finger (she floats just above it) / move the mouse |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- Gem: +10 × Nimbus's size (1–5). Every 4 gems she grows one size. At size 5, 4 more gems make a rain shower: every bubble on screen pops, +50 × level, and she shrinks back to size 1.
- A falling burr costs a heart and shrinks Nimbus one size (hanging and rolling burrs are harmless). Each full jar gives a heart back. No hearts → game over. Bubbles that float away cost nothing.
- The first run starts on **Easy** (5 hearts, slow bubbles, rare burrs with a long wiggle, a forgiving pop reach); change it in Settings.
- Change Pictures: Nimbus, the gem and each time of day's background can be your own photos or drawings.

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests (24)
node tests/e2e/smoke.js           # boot + mouse steering + bot run + every time of day + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, rules, pictures, layouts, long run (~4 min, 329 checks)
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual/
node tests/sim/sweep.js final --seeds 60   # player-model balance sim (kid, casual adult, keyboard, exploits, bots)
node tools/art-characters/gen.js && node tools/art-environment/gen.js   # regenerate the SVG art
node tools/render_mobile_icons.js # home-screen icons
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`. For tests, `window.NB.debug` exposes the game state (`target(x, y)`, `gotoLevel(i)`, `setBot(on, skill)`, `getState()`).

## Layout
- `game/`: the HTML5 game (classic scripts on `window.NB`), original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper (port 47623, single instance).
- `tools/`: the art generators, icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md`, art contact sheets, and the functional, visual and playtest reports.
- `tests/`: unit, e2e, visual and sim tests.
