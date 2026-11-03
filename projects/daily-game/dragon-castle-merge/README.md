# Ember's Glow Castle

Daily game for 2026-11-03, made with `/build-game random`. The old castle on the hill is a little bit haunted (only by very friendly ghosts) and its lights have gone out. Ember the baby dragon drops glowing fireflies onto the castle's glow-board. Two the same that touch **merge** into something brighter: green → blue → pink fireflies → firefly jar → candle → lantern → star → moon. Merge again and again for a combo, and at **combo 5** Boo, the shy castle ghost in a night-cap, floats in to tidy up. Make each place's goal light to move through the Garden Courtyard, the Crystal Cellar, the Moonlit Library and the Star Tower.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/dragon-castle-merge/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/EmbersGlowCastle.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\EmbersGlowCastle\data`.

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Move Ember | ← / → (A / D) | move the mouse / slide a finger |
| Drop the light | Space / ↓ / S / Enter, or 1–5 for a column | click / tap a column (or lift the finger) |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- Two or more of the same light touching (up, down, left, right) merge into one of the next tier where the new one landed; lights above fall down and can chain (cascades). Making tier *t* scores 5 × 2^(t−1), more for 3+ at once and while the combo runs.
- Goals: candle (Courtyard), lantern (Cellar), star (Library), moon (Tower). The goal light floats away and lights the castle; the green fireflies fly off too, so the board gets room. After the Tower the castle loops.
- **Boo** comes at combo 5, 10, 15… and carries away pumpkins and small fireflies.
- **Night creeps:** from the Cellar on (Easy: from the Library), every few drops sleepy pumpkins rise from the bottom. A merge right next to a pumpkin wakes it and it rolls away. A full column refuses a light; when no column can take it, the game is over.
- The first run starts on **Easy** (only tiers 1–2 in the Courtyard, no pressure in the first two places); change it in Settings.

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests (29)
node tests/e2e/smoke.js           # boot + clicks + bot run + every place + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, touch, rules, pictures, layouts (~5 min, 358 checks)
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual/
node tests/sim/run.js baseline    # player-model balance sim (5-year-old, casual adult, spam, bots)
node tools/art-characters/gen.js && node tools/art-environment/gen.js   # regenerate the SVG art
node tools/render_mobile_icons.js # home-screen icons
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`. For tests, `window.EG.debug` exposes the game state (`drop(col)`, `aim(col)`, `gotoLevel(i)`, `fillBoard(cols)`).

## Layout
- `game/`: the HTML5 game (classic scripts on `window.EG`), original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper (port 47620, single instance).
- `tools/`: the art generators, icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md`, art contact sheets, and the functional, visual and playtest reports.
- `tests/`: unit, e2e, visual and sim tests.
