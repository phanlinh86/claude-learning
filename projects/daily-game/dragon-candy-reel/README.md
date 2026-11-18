# Taffy's Candy Reel

Daily game for 2026-11-18, made with `/build-game random`. Taffy the baby dragon sits on a wafer-biscuit dock over the Fizzy Soda Lake in Candy Land. Sparkly **sugar snowflakes** float under the water inside soda bubbles. **Hold** to let the candy bobber sink, **let go** to let it float up, and touch a snowflake to hook it. Then **reel it in** with well-timed taps on the reel meter. But the **wind keeps changing direction**: about every 10 seconds a gust swings the line left or right and pushes the snowflakes along, so watch the little windsock on the dock (it shows an arrow 1.5 s before each gust). Sour gummies drift by too: bump one and *fizz, boing!* the line snaps. Now and then a **golden snowflake** sparkles past, worth 5 pink ones. Fish through four weather levels: Sunny Shore, Sprinkle Rain, Windy Swirl and Sugar Snow.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/dragon-candy-reel/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/TaffysCandyReel.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\TaffysCandyReel\data`.

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Sink the bobber (hold) / float up (let go) | hold Space / ↓ / S / Enter | hold anywhere |
| Reel tap (when the needle is in the green) | press Space / ↓ / S / Enter | tap anywhere |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- Strawberry snowflake (pink, shallow) 10, lime (green, middle) 20, grape (purple, deep) 30, golden 50. Each Perfect reel tap (gold middle of the meter) adds 5 and pulls the snowflake up two steps; a Good tap pulls one step.
- Three taps outside the green and the snowflake floats free. Mashing the button doesn't work.
- **Wind:** each gust flips the wind direction. The deeper the bobber, the further the wind swings it from under the gap, so on the Windy Swirl level aim upwind. Gusts are always announced (windsock arrow + whoosh) 1.5 s early.
- Bumping a sour gummy while roaming snaps the line; you have 3 licorice lines. Clearing a level (6 / 8 / 10 snowflakes on Easy / Normal / Hard) gives one back. After Sugar Snow the levels loop a bit faster.
- The first run starts on **Easy** (wide green zone, slow needle, soft gusts, few gummies); change it in Settings.
- **Change Pictures:** replace Taffy, the snowflake, the sour gummy and each level's background with your own pictures (saved on this device).

## Build and test
```bash
export NODE_PATH=$(npm root -g)
node tests/unit/run.js            # mechanics unit tests (world, wind, weather, bot)
node tests/e2e/smoke.js           # boot + bot run + every level + a gust + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, touch, rules, wind, pictures, layouts (~5 min)
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual_*
node tests/sim/run.js             # player-model balance sim (kid, adult, spam)
node tests/sim/pacing.js          # bot pacing per difficulty
node tools/art-characters/gen.js && node tools/art-environment/gen.js   # regenerate the SVG art
node tools/render_mobile_icons.js # home-screen icons
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`. For tests, `window.PR.debug` exposes the game state (`press()`, `release()`, `gotoLevel(i)`, `spawnGold()`, `gust(dir)`).

## Layout
- `game/`: the HTML5 game (classic scripts on `window.PR`), original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper (port 47626, single instance).
- `tools/`: the art generators, icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md`, art contact sheets and the QA reports.
- `tests/`: unit, e2e, visual and sim tests.
