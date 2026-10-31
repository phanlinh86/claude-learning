# Puff's Volcano Catch

Daily game for 2026-10-30, made with `/build-game random`. Old Mount Bumble, a sleepy island volcano, burps lost pirate coins into the sky. Puff the cloud sprite floats along the shore with a basket to catch them. Build a combo for up to ×5 points, avoid the warm sizzly rocks, and use **Cool Rain** to turn rocks into steam. Fill the coin pouch to move through four zones: Sunny Beach, Jungle Slopes, Ash Fields and Crater Rim.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/puff-volcano-catch/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** to get a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/PuffsVolcanoCatch.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\PuffsVolcanoCatch\data`.

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | ← → / A D, or move the mouse | hold a finger where Puff should float |
| Cool Rain | Space / Enter / right-click | 💧 button or a second finger |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**On iPhone and iPad** the game uses the same mobile layer as the education games:
- The canvas fills the screen in portrait and landscape. The island stays anchored to the bottom, and the sky and shore stretch to fit. Phones in portrait show the middle of the island bigger.
- The HUD and the 💧 button keep clear of the notch and home bar. Puff's shore range stops before the 💧 button, so the button never covers him, and coins only land where Puff can reach.
- One finger steers. A second finger, or the 💧 button, makes Cool Rain. Buttons answer a second finger too, so a child can pause while steering.
- Sound starts on the first tap, as iOS requires. Switching apps pauses the game and silences it. Pinch zoom, double-tap zoom, long-press menus and scroll bounce are blocked. Rotating mid-game keeps Puff and the flying coins on his shore.

**Scoring:** a coin is worth value (copper 1, silver 2, gold 5) × 10 × the combo multiplier. A steamed rock is worth 5. Clearing a zone gives 100 per heart left.

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests (23)
node tests/e2e/smoke.js           # boot + bot run + game over, no console errors
node tests/e2e/functional.js      # full functional suite (≈3 min, 230 checks)
node tests/e2e/mobile.js          # iPhone / iPad portrait + landscape with real touch (98 checks)
node tests/e2e/mobile_qa.js       # deeper mobile QA: rotation, multi-touch, kid-proofing, audio unlock (≈10 min; --quick)
node tests/visual/mobile_capture.js   # phone / tablet screenshots → tests/out/visual_mobile/
node tools/render_mobile_icons.js     # home-screen icons → game/assets/icons/
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual/
node tests/sim/run.js 100 20      # bot balance sim
node tests/sim/players.js         # human-like player models (kid, casual, exploits)
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N`. For tests, `window.VC.debug` exposes the game state.

## Layout
- `game/`: the HTML5 game (classic scripts on `window.VC`), with original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper.
- `tools/`: the art generators (`art-characters/`, `art-environment/`), icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md`, art contact sheets, and the QA, visual and playtest reports.
- `tests/`: unit, e2e, visual and sim tests.
