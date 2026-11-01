# Kit's Toybox Beat

Daily game for 2026-11-01, made with `/build-game random`. When the grown-ups go to sleep, the toy room plays music! Kit, a kitten with a toy rocket on her back, hovers by two toy-train tracks and catches the coins that roll in **on the beat**. Every catch plays a note of the song on a music-box. Every 30 seconds **Baron Fluff**, a tiny grumpy teddy in a patched balloon, lobs soft pillows down the tracks: tap them on the beat to bop them back at him. Play through the day: Dawn, Noon, Sunset and Night.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/kit-toybox-beat/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/KitsToyboxBeat.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\KitsToyboxBeat\data`.

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Upper track | ↑ / W / F | tap the upper half |
| Lower track | ↓ / S / J | tap the lower half |
| Easy mode (one button) | any of the above, Space or Enter | tap anywhere |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- Perfect = 100, Good = 50, × the combo multiplier (×2/×3/×4 every 10 catches in a row). The pink super coin is worth 3×. Bopping a pillow = 250.
- The groove meter (Kit's rocket fuel) fills with catches and drains with misses; when it's empty the game is over.
- Tapping too early, or tapping the wrong track while a coin arrives on the other one, counts as a miss (so mashing doesn't work).
- Easy level 1 can't be lost. Settings has a **Timing** slider for Bluetooth headphones.

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests
node tests/e2e/smoke.js           # boot + bot run + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, touch, judging, pictures, layouts
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual/
node tests/sim/run.js --runs 80   # player-model balance sim (kid, casual, exploits)
node tools/art-characters/gen.js && node tools/art-environment/gen.js   # regenerate the SVG art
node tools/render_mobile_icons.js # home-screen icons
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`. For tests, `window.KB.debug` exposes the game state (`bossNow()` calls Baron Fluff).

## Layout
- `game/`: the HTML5 game (classic scripts on `window.KB`), original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper (port 47618, single instance).
- `tools/`: the art generators, icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md`, art contact sheets, and the functional, visual and playtest reports.
- `tests/`: unit, e2e, visual and sim tests.
