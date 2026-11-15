# Shelly's Sky Catch

Daily game for 2026-11-15, made with `/build-game random`. High above the rain, stars keep slipping out of the Cloud Kingdom's cloud bank. Shelly, a little snail with a tiny jetpack and a woven basket on her shell, zooms along the fluffy cloud floor to catch them. A **twinkle** in the clouds shows where the next star will fall. Rare **golden stars** are worth 5. Grumpy **thunder puffs** sneak down too: catch one and Shelly gets a fizzy zap (one heart). Fill the **star jar** to move through four weather levels: Sunny Skies, Rainy Clouds (wet stars fall faster), Windy Heights (gusts push the stars) and Snowy Towers (Shelly slides on the ice). After snow the weather loops, a bit busier.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/snail-cloud-catch/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** to get a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/ShellysSkyCatch.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\ShellysSkyCatch\data`.

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | ← → / A D, or move the mouse | hold a finger where Shelly should fly |
| Jet Hop 🚀 | Space / ↑ / W / Enter / right-click | 🚀 button or a second finger |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Jet Hop:** a jetpack burst lifts Shelly about 100 px for about 0.7 s, so she can grab a star early (before the wind steals it) and fly a bit faster sideways. It recharges in about 2.5 s after landing (the meter next to the hearts).

**Scoring:** a star is worth 10 × the streak multiplier, a golden star 50 ×. The streak gives ×2 at 8 stars in a row and ×3 at 20. A star that falls into the clouds ends the streak (no heart lost). Clearing a level gives 100 per heart left. Medals by score: bronze 700, silver 3000, gold 8000, platinum 18000.

**Settings:** sound, music, volume, difficulty (Easy: 5 hearts, a wider basket, slower peeks; Normal; Hard), level length (Short / Normal / Long scales the star jar), full screen. **Change Pictures** swaps Shelly, the star, the thunder puff and each weather's background for your own pictures.

**On iPhone and iPad** the game uses the same mobile layer as the education games:
- The canvas fills the screen in portrait and landscape. The cloud scene stays anchored to the bottom, and the sky, clouds and cloud floor stretch to fit.
- The HUD and the 🚀 button keep clear of the notch and home bar. Shelly's range stops before the 🚀 button, and stars only drop where she can reach.
- One finger steers. A second finger, or the 🚀 button, makes a Jet Hop. Buttons answer a second finger too, so a child can pause while steering.
- Sound starts on the first tap, as iOS requires. Switching apps pauses the game and silences it. Pinch zoom, double-tap zoom, long-press menus and scroll bounce are blocked.

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests (30)
node tests/e2e/smoke.js           # boot + title + bot at speed 8 + game over, no console errors
node tests/e2e/functional.js      # full functional suite, 308 checks (≈5 min; --quick, --only=name)
node tests/e2e/mobile.js          # iPhone / iPad portrait + landscape with real touch (98 checks)
node tests/e2e/mobile_qa.js       # mobile essentials: rotation, multi-touch, kid-proofing, audio unlock, drops in range (--quick: 59 checks)
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual/
node tests/visual/mobile_capture.js   # phone / tablet screenshots → tests/out/visual_mobile/
node tools/render_mobile_icons.js     # home-screen icons → game/assets/icons/
node tests/sim/run.js             # bot balance sim
node tests/sim/players.js         # human-like player models
node tests/sim/playtest.js        # high-speed playtest: 13 player models × 3 difficulties (--overrides, --tag)
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`. For tests, `window.SC.debug` exposes `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i) }`.

## Layout
- `game/`: the HTML5 game (classic scripts on `window.SC`), with original SVG art in `assets/default/` (characters, `zones/<weather>/` layers, `particles/`).
- `app/`: the Go + WebView2 Windows wrapper.
- `tools/`: the art generators (`art-characters/`, `art-environment/`), icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`, the contract between modules) and the QA / playtest reports.
- `tests/`: unit, e2e, visual and sim tests.
