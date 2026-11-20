# Bolt's Rooftop Flip

Daily game for 2026-11-05, made with `/build-game random`. Bolt the little robot pup has magnet paws. He races across the city rooftops from dawn until night, catching glowing fireflies. **Tap to flip gravity**: Bolt springs up and clamps onto the overhead sky-rail, running upside-down, then tap again to drop back to the roofs. Flip over the gaps and around chimneys and hanging signs. Bolt's chest light shows **his colour**, and he can only catch fireflies of that colour (pink heart, yellow star, blue drop). Run through a glowing paint arch to change colour. Dawn → Noon → Sunset → Night, then round again, a bit faster.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/robot-rooftop-flip/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/BoltsRooftopFlip.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\BoltsRooftopFlip\data`.

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Flip gravity | Space / ↑ / ↓ / Enter | tap / click anywhere |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- Firefly of Bolt's colour: +10 × streak (×1 … ×5, +1 every 5 in a row). Another colour just zips away (on Normal/Hard it ends the streak). Each time of day finished: 100 × level × round, and one battery back.
- Bumping a chimney/AC unit or a hanging sign, or falling through a gap (a little drone carries Bolt back), costs a battery. No batteries → game over.
- The first run starts on **Easy** (5 batteries, slower, more space between hazards, a forgiving hit box); change it in Settings.
- Change Pictures: Bolt, the firefly and each time of day's background can be your own photos or drawings.

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests (22)
node tests/e2e/smoke.js           # boot + clicks + bot run + every time of day + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, rules, pictures, layouts, long run (~5 min, 337 checks)
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual/
node tests/sim/run.js             # player-model balance sim (kid, casual adult, spam, never-tap, bots)
node tools/art-characters/gen.js && node tools/art-environment/gen.js   # regenerate the SVG art
node tools/render_mobile_icons.js # home-screen icons
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`. For tests, `window.RF.debug` exposes the game state (`flip()`, `gotoLevel(i)`, `setBot(on, skill)`, `getState()`).

## Layout
- `game/`: the HTML5 game (classic scripts on `window.RF`), original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper (port 47622, single instance).
- `tools/`: the art generators, icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md`, art contact sheets, and the functional, visual and playtest reports.
- `tests/`: unit, e2e, visual and sim tests.
