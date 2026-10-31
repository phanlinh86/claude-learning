# Spike's Dino Jam

Daily game for 2026-10-31, made with `/build-game random`. The dinosaurs of Lullaby Valley lost their song! Spike the hedgehog skateboards around the valley collecting musical notes. Every note hops onto his tail and follows him as a bouncy melody train (a smooth, touch-friendly take on Snake). Don't skate into your own tail, kickflip over trouble, and watch out for **Mumbles**, a tiny grumpy pterodactyl who drops soft pillows every 30 seconds. Finish each song to travel through four biomes: Fern Meadow, Misty Swamp, Red Rock Canyon and Snowy Peaks.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/spike-dino-jam/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/SpikesDinoJam.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\SpikesDinoJam\data`.

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Steer | arrow keys / WASD point Spike that way, or move the mouse | hold a finger where Spike should skate |
| Kickflip (jump over your tail or a pillow) | Space / Enter / right-click | skateboard button or a second finger |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- A note is worth 10 + 2 × the tail length, and gold notes are worth 3×.
- Each note plays the next note of the biome's tune.
- Bumping into your tail (past the first few notes) costs a heart and breaks the tail. The loose notes can be grabbed back for a few seconds.
- A pillow that lands on Spike makes him dizzy and knocks 3 notes loose, but never costs a heart. Kickflipping over a falling pillow scores +15.
- Bushes are soft: Spike bounces off them, and right after a bounce his tail can't bonk him.
- Finishing a song gives 100 points per heart left, and +1 heart.

**On iPhone and iPad** (same mobile layer as the education games):
- The canvas fills the screen. The playing field adapts to portrait and landscape and keeps clear of the notch and home bar.
- Notes and pillows never land under the kickflip button.
- Sound starts on the first tap. Switching apps pauses the game. Zoom gestures and scroll bounce are blocked.

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests
node tests/e2e/smoke.js           # boot + bot run + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, touch, rules, pictures, layouts (--quick)
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual/
node tests/sim/run.js 30 10       # bot balance sim
node tests/sim/players.js base 60 8   # human-like player models (kid, casual, exploits)
node tools/art-characters/gen.js && node tools/art-environment/gen.js   # regenerate the SVG art
node tools/render_mobile_icons.js # home-screen icons
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N`. For tests, `window.DJ.debug` exposes the game state (`bossNow()` calls Mumbles).

## Layout
- `game/`: the HTML5 game (classic scripts on `window.DJ`), with original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper (port 47617).
- `tools/`: the art generators, icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md`, art contact sheets, and the functional, visual and playtest reports.
- `tests/`: unit, e2e, visual and sim tests.
