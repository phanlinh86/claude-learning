# Dottie's Reef Parade

Daily game for 2026-11-17, made with `/build-game random`. The reef is getting ready for the Sea Star Parade! Dottie, a chubby little puffin, dives down and swims loops around the coral, gathering sea stars. Every star she touches tumbles in behind her and follows her exact path in a wiggly parade (a smooth, touch-friendly take on Snake). Don't swim into your own parade, **Flip** over trouble, and chase the rare **golden sea star**: catch it before it hides in the sand and it counts as 5 stars. Finish each season's song to swim through four seasons: Spring Bloom, Summer Shallows, Autumn Kelp and Winter Glow.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/puffin-reef-parade/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/DottiesReefParade.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\DottiesReefParade\data`.

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Swim | arrow keys / WASD point Dottie that way, or move the mouse | hold a finger where Dottie should swim |
| Flip (somersault over your parade) | Space / Enter / right-click | round Flip button or a second finger |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- A sea star is worth 10 + 2 × the parade length, and each one plays the next note of the season's tune.
- The **golden sea star** pops out of the sand about every 18 s and scoots away from Dottie. It blinks before it hides. Catch it: song +5, points × 5, and a golden star joins the parade.
- Bumping into your parade (past the first few stars) costs a heart and breaks the parade. The loose stars can be grabbed back for a few seconds.
- The reef walls are soft: Dottie bounces off them, no damage.
- Finishing a season's song gives 100 points per heart left, and +1 heart. After Winter the reef loops a little faster.

**On iPhone and iPad** (same mobile layer as the other daily games):
- The canvas fills the screen. The playing field adapts to portrait and landscape and keeps clear of the notch and home bar.
- Stars never appear under the Flip button.
- Sound starts on the first tap (loud "playback" audio on iOS, Volume slider in Settings). Switching apps pauses the game. Zoom gestures and scroll bounce are blocked. The game-over screen has a Score Card to share.

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests
node tests/e2e/smoke.js           # boot + bot run + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, touch, rules, golden star, pictures, layouts (--quick)
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual/
node tests/sim/run.js 30 10       # bot balance sim
(cd ../../.. && node shared/daily-mobile/test_extras.js projects/daily-game/puffin-reef-parade)   # Volume slider + Score Card
node tools/render_mobile_icons.js # home-screen icons
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N`. For tests, `window.RP.debug` exposes the game state (`goldNow()` pops a golden sea star out right away).

## Layout
- `game/`: the HTML5 game (classic scripts on `window.RP`), with original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper (port 47625).
- `tools/`: icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md` and art contact sheets.
- `tests/`: unit, e2e, visual and sim tests.

## How it looks and sounds
- Top-down view through the water onto a sandy sea floor: soft moving light caustics, a depth tint per season (Winter Glow is the deepest and bluest), Dottie's shadow on the sand shrinking as she flips up toward the surface.
- Dottie tilts toward where she swims (never upside down), bobs gently, flaps harder on tight turns, does a full somersault on Flip and leaves a little bubble trail.
- All sound is synthesized: kalimba-like plucks sing each season's tune, bubbly bloops for Flip, a soft "boing + bubbles" for bonks, a shimmering chime for the golden star, and a gentle generative music loop per season.
