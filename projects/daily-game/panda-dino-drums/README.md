# Momo's Dino Drums

Daily game for 2026-11-16, made with `/build-game random`. At the top of Dino Valley stands the Dino Lookout, a bamboo tower where the dinosaurs come to dance. Momo the panda rides a little swing-lift between two drums. Shiny gems hop along two bamboo rails, one hop per beat, and land on the drums **on the beat**: drum at the right moment to catch them and keep the dinos dancing. Catch 5 in a row and **Pip**, a baby pterosaur, flies in to help: while Pip is there every catch is worth double, and Pip saves one gem you miss. Clear a song and the lift carries Momo up a floor: Riverbank, Fern Canopy, Nest Ledge and the Sky Roof.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/panda-dino-drums/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/MomosDinoDrums.exe`, a portable exe that uses WebView2 (local server on port 47624). Saves go to `%APPDATA%\MomosDinoDrums\data`.

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Upper rail | ↑ / W / F (also D, E) | tap the upper half |
| Lower rail | ↓ / S / J (also K, X) | tap the lower half |
| Drum on Momo's current rail | Space / Enter | |
| Easy mode (one button) | any letter or digit key, the arrows, Space or Enter | tap anywhere |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- Perfect = 100, Good = 50, × the combo multiplier (×2/×3/×4 every 10 catches in a row). The rainbow gem is worth 3×. While Pip is with Momo, points are doubled.
- The groove meter (Momo's drum energy) fills with catches and drains with misses; when it is empty Momo gets sleepy and the game is over.
- Tapping too early, or tapping the wrong rail while a gem lands on the other one, counts as a miss (so mashing doesn't work). On Normal floor 1 a tap that catches nothing costs a tiny bit of groove.
- Pip comes on the 5th catch in a row (4th on Easy), stays up to 20 s, and saves one missed gem. Easy floor 1 can't be lost.
- **Medal:** bronze for finishing floor 1; silver, gold and platinum by score (Easy 5k / 50k / 100k, Normal 20k / 75k / 250k, Hard 50k / 150k / 450k). The **Score Card** button makes a picture to share.
- Settings has a **Timing** slider for Bluetooth headphones and a volume control; **Change Pictures** lets you use your own photos for Momo, the gem, Pip and the four floors.

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests (world, chart, judging, Pip, weather)
node tests/e2e/smoke.js           # boot + bot run + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, touch, judging, Pip, floors, pictures, layouts (~5 min)
node tests/e2e/mobile.js          # iPhone / iPad suite: sizes, touch, rotation, notch (~2.5 min)
(cd ../../.. && node shared/daily-mobile/test_extras.js projects/daily-game/panda-dino-drums)   # shared volume + Score Card checks
node tests/visual/capture.js      # screenshots, motion sheets and contrast metrics → tests/out/visual/
node tests/sim/playtest.js --runs 100   # high-speed player-model playtest (toddler … veteran, exploits)
node tests/sim/run.js --runs 80         # older balance sim
node tools/art-characters/gen.js && node tools/art-environment/gen.js   # regenerate the SVG art
node tools/render_mobile_icons.js # home-screen icons
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard&maxpx=N&adaptive=0`. `?mute=1` and `?diff=` are never saved.
For tests, `window.DD.debug` exposes the game: `world`, `weather`, `mode`, `stats`, `getState()`, `setSpeed(n)`, `startGame()`, `tap(lane)`, `setBot(on, skill)`, `setAutoRestart(on)`, `gotoLevel(i)` and `helperNow()` (calls Pip right away).

## Layout
- `game/`: the HTML5 game (classic scripts on `window.DD`: `world.js` mechanics, `render.js`, `weather.js`, `audio.js`, `ui.js`, `main.js`, shared `extras.js`), original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper (port 47624, single instance; falls back to the default browser).
- `tools/`: the art generators, icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md`, art contact sheets, and the functional, visual and playtest reports.
- `tests/`: unit, e2e (smoke, functional, mobile), visual and sim tests.
