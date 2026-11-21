# Bristle's Moon Pop

Daily game for 2026-11-21, made with `/build-game random`. On a tiny friendly Moon, the Moon Bakery's bubble oven has
hiccups: cupcakes bubble up out of the craters wrapped in soap bubbles and float away into space. Bristle, a little
hedgehog on a skateboard, skates along the Moon and does big floaty low-gravity jumps, curling into a spiky ball to
**pop** the bubbles. Pop one in the air and you bounce again: chain pops for big points. A **magnet bubble** pulls nearby
bubbles to Bristle for 7 s. Sleepy moon pebbles drift down with a warning ring on the floor: don't get bonked. Fill the
cupcake box to move from **Dawn (Earthrise)** to **Noon**, **Sunset (ringed planet)** and a starry **Night**; then it loops, a bit busier.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/hedgehog-moon-pop/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. `game/index.html` also opens straight from disk.
- **Windows:** `bash tools/build.sh` makes `dist/BristlesMoonPop.exe`, a portable exe using WebView2. Saves go to `%APPDATA%\BristlesMoonPop\data`.

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Skate | ← → / A D, or move the mouse | hold a finger where Bristle should skate |
| Jump | Space / ↑ / W / Enter / right-click | jump button, a quick tap, or a second finger |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Scoring:** a pop is worth 10 × height (low ×1, high ×2, sky ×3) × the streak multiplier (×2 at 8 pops in a row, ×3 at 20),
plus +10 per extra pop in the same jump (chain). An escaped bubble ends the streak; only a pebble bonk costs a heart.
Clearing a level gives 100 per heart left (and one heart back in the first loop).

**Settings:** sound, music, volume, difficulty (Easy: 5 hearts, slower bubbles, longer crater warnings, fewer pebbles; Normal; Hard),
level length (Short / Normal / Long), full screen. **Change Pictures** swaps Bristle, the cupcake, the moon pebble and each time of day's background.

## Build and test
```bash
node tests/unit/run.js                       # mechanics unit tests (21)
node tests/e2e/smoke.js                      # boot, play with the bot at ×8, game over, zero console errors
node tests/e2e/functional.js [--quick]       # functional suite (323 checks)
node tests/e2e/mobile_qa.js                  # iPhone / iPad layer (67 checks)
node ../../../shared/daily-mobile/test_extras.js projects/daily-game/hedgehog-moon-pop   # run from the repo root
node tests/sim/playtest.js                   # player-model sims (slow); tests/sim/deep.js = the playtester's deeper grid
node tests/visual/capture.js                 # visual QA screenshots → tests/out/visual/
bash tools/build.sh                          # Windows exe → dist/
node tools/art-characters/gen.js; node tools/art-environment/gen.js   # regenerate the SVG art
```

URL switches: `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`
(test-URL runs don't save best scores unless `&savebest=1`). `window.MP.debug` exposes the world, weather and helpers.

## Layout
- `game/` the web game (`js/world.js` mechanics, `weather.js` particles, `bot.js` autopilot, `render.js`, `main.js`, `ui.js`, `audio.js`, `assets.js`, `storage.js`, `extras.js` shared Volume + Score Card).
- `game/assets/default/` original SVG art; `tools/art-*` generate it.
- `app/` Go + WebView2 wrapper. `docs/` DESIGN (contract), MECHANICS (numbers), `reports/` (QA), `art/` contact sheets.
- `tests/` unit, e2e, sim and visual scripts.
