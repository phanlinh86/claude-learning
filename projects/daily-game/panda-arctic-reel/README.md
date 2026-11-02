# Bao's Arctic Reel

Daily game for 2026-11-02, made with `/build-game random`. Bao the panda is on holiday in the frozen north, with a red scarf, a little fishing rod and a bucket. Under the sea ice, sparkly gems drift by inside air bubbles. **Hold** to let the hook sink, **let go** to let it float up, and touch a gem to hook it. Then **reel it in** with well-timed taps on the reel meter. Watch out for the puffy pufferfish: bump one and *boing*, the line snaps. Once in a while a **golden gem** shimmers past, worth 5 purple ones. Fish your way down through four depth zones: Sunny Shallows, Kelp Garden, Twilight Waters and Aurora Deep.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/panda-arctic-reel/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/BaosArcticReel.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\BaosArcticReel\data`.

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Sink the hook (hold) / float up (let go) | hold Space / ↓ / S / Enter | hold anywhere |
| Reel tap (when the needle is in the green) | press Space / ↓ / S / Enter | tap anywhere |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- Amethyst (purple, shallow) 10, emerald (green, middle) 20, ruby (red, deep) 30, golden gem 50. Each Perfect reel tap (gold middle of the meter) adds 5 and pulls the gem up two steps; a Good tap pulls one step.
- Three taps outside the green and the gem wriggles free. Mashing the button doesn't work (the first green zone is never where the needle starts).
- Bumping a pufferfish while the hook moves snaps the line; you have 3 lines. Clearing a zone (6 / 8 / 10 gems on Easy / Normal / Hard) gives one back. After Aurora Deep the zones loop a bit faster.
- The first run starts on **Easy** (wide green zone, slow needle, few pufferfish); change it in Settings.

## Build and test
```bash
export NODE_PATH=$(npm root -g)
node tests/unit/run.js            # mechanics unit tests
node tests/e2e/smoke.js           # boot + bot run + every zone + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, touch, rules, pictures, layouts (~5 min)
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual_*
node tests/sim/run.js             # player-model balance sim (kid, adult, spam, camper)
node tests/sim/pacing.js          # bot pacing per difficulty
node tools/art-characters/gen.js && node tools/art-environment/gen.js   # regenerate the SVG art
node tools/render_mobile_icons.js # home-screen icons
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`. For tests, `window.PR.debug` exposes the game state (`press()`, `release()`, `gotoLevel(i)`, `spawnGold()`).

## Layout
- `game/`: the HTML5 game (classic scripts on `window.PR`), original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper (port 47619, single instance).
- `tools/`: the art generators, icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md`, art contact sheets, and the functional, visual and playtest reports.
- `tests/`: unit, e2e, visual and sim tests.
