# Juno's Moon Stack

Daily game for 2026-11-04, made with `/build-game random`. Juno the little space fox flies a tiny hover-saucer over friendly planets and builds towers of cargo crates so the rockets can find the landing beacon. **Tap to drop** the crate from her tractor beam: land it in the middle for **Perfect!**, too far over the edge and it tumbles off. Drop crates through floating **star-coins**: every 5 coins Juno (and her crates) **grow bigger**. Stack enough crates and a rocket lands to take her to the next planet: Moon Base → Rusty Dunes → Ring World → Comet Garden, then round again, a bit faster.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/fox-moon-stack/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/JunosMoonStack.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\JunosMoonStack\data`.

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Drop the crate | Space / ↓ / Enter | tap / click anywhere |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- Every crate that stays: +10. Perfect (close to the centre): +10 × combo (up to ×5). Star-coin: +5. Planet goal: 100 × planet × round.
- A crate whose centre lands past the edge tumbles off; if the crates above any crate lean past its edge (centre of mass), the top part topples. Either costs a heart. No hearts left → game over. Each new planet gives one heart back.
- Every 5 coins Juno grows a step (max 5): bigger crates are easier to land but the tower sways more. On Normal/Hard a miss shrinks her one step.
- The first run starts on **Easy** (5 hearts, slow swing, wide crates, a coloured drop guide); change it in Settings.
- Change Pictures: Juno, the crate, the star-coin and each planet's background can be your own photos or drawings.

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests (23)
node tests/e2e/smoke.js           # boot + taps + bot run + every planet + goal + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, rules, pictures, layouts, long run (~5 min, 261 checks)
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual/
node tests/sim/run.js             # player-model balance sim (kid, casual adult, spam, perfect-waiter, bots)
node tools/art-characters/gen.js && node tools/art-environment/gen.js   # regenerate the SVG art
node tools/render_mobile_icons.js # home-screen icons
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`. For tests, `window.MS.debug` exposes the game state (`drop()`, `gotoLevel(i)`, `setBot(on, skill)`, `getState()`).

## Layout
- `game/`: the HTML5 game (classic scripts on `window.MS`), original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper (port 47621, single instance).
- `tools/`: the art generators, icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md`, art contact sheets, and the functional, visual and playtest reports.
- `tests/`: unit, e2e, visual and sim tests.
