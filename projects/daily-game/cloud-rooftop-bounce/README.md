# Wisp's Rooftop Bounce

Game of the day for 2026-11-26, made with `/build-game random`. Wisp is a little cloud sprite who lives above a city at night. Wisp IS the paddle: float left and right and bounce the glowing moon-pearl into the blocks of the night city (cloud tiles, window panes, flower boxes and paper lanterns). Broken blocks drop sparkly gems to catch. Grab the magnet and the gems fly to Wisp, and the pearl sticks to the cloud so you can aim. Clear every block to float down to the next zone, from the Cloud Deck to the lantern-lit street.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/cloud-rooftop-bounce/game/ (iPhone, iPad, desktop browser). On iPhone or iPad, choose "Add to Home Screen" to play full screen.

## How to play
- **Move:** slide a finger anywhere (or move the mouse) and Wisp follows left and right.
- **Serve:** tap or click. The pearl also serves by itself after 3 seconds.
- **Aim:** where the pearl lands on Wisp sets its angle. The middle sends it straight up and the edges send it sideways (up to 60°).
- **Points:**
  - block +10 (dark blocks need 2 hits, +10 each);
  - every block after the 2nd before the pearl comes back to Wisp: +5 combo;
  - gem caught +25 (blocks drop gems now and then, glass blocks always);
  - zone cleared +100, plus +20 per heart.
- **Hearts:** you start with 3 (max 5). The pearl falling past Wisp costs one. You get +1 for every 10 gems and +1 for every zone. On Easy a soft moonbeam net catches the pearl up to 8 times per zone (once on Normal, never on Hard).
- **The magnet:** magnet blocks drop a magnet in a bubble. Catch it and for 12 s (Easy; 10 Normal, 8 Hard) gems and bubbles curve toward Wisp, and the pearl **sticks** when it lands. Slide to aim (a dotted line shows where it will go), then tap to let go. It lets go by itself after 1.5 s. A ring around Wisp shows the time left.
- **Zones:** Cloud Deck → Skyscraper Spires → Rooftop Gardens → Lantern Lane, then back up to the clouds for round 2, a little faster with more dark blocks.
- **Keyboard:** `←` `→` (or `A` `D`) move, `Space`/`Enter` serve or let go, `Esc`/`P` pause, `M` sound, `F11` full screen.
- **Change Pictures:** use your own picture for Wisp, the pearl, the gem or any of the four zones. Pictures are saved on this device only.
- **Settings:** sound, music, volume, difficulty (Easy is the default), full screen, reset best scores. Game over has a **Score Card** to share.

## Build and test
- Windows exe: `bash tools/build.sh` → `dist/WispsRooftopBounce.exe`. Needs Go, Node with Playwright, and Python with Pillow. If the Go module proxy is blocked, the script retries with `GOPROXY=direct GOSUMDB=off` by itself. Player data is saved in `%APPDATA%\WispsRooftopBounce\data`.
- Unit tests: `node tests/unit/run.js`
- Smoke test: `node tests/e2e/smoke.js`
- Functional tests: `node tests/e2e/functional.js` (add `--quick` for a shorter run)
- Mobile layer (volume + Score Card): `node shared/daily-mobile/test_extras.js projects/daily-game/cloud-rooftop-bounce` from the repo root
- Visual capture: `node tests/visual/capture.js` (`ONLY=screens,zones,magnet,bursts,hud,cb,custom`)
- Playtest simulations: `node tests/sim/playtest.js`
- Art generators: `node tools/art-characters/gen.js` and `node tools/art-environment/gen.js`; home-screen icons: `node tools/render_mobile_icons.js`
- The browser tests serve `game/` over a local http server (`tests/e2e/serve.js`), like GitHub Pages.

## URL switches (for testing)
`?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N`
These flags are never saved into the settings. `debug=1` draws the hit boxes (blocks, pearl, Wisp's bounce line, the gem catch box).
Test hooks: `WRB.debug.giveMagnet()`, `WRB.debug.drop('gem'|'magnet')`, `gotoLevel(i)`, `clearBricks(n)`, `setBot(on, skill)`, `setSpeed(n)`.

## Layout
- `game/` — the web game: plain JavaScript on `window.WRB`, no build step.
  - `world.js` — the game rules and physics (no drawing).
  - `bot.js` — the autopilot (title demo and tests).
  - `weather.js` — the night particles per zone (twinkles, mist, shooting stars, fireflies, petals, embers).
  - `render.js` — drawing: the zone backgrounds, Wisp, the pearl, gems, the magnet effects, the descend transition, the HUD.
  - `main.js` — input and game modes.
  - `ui.js` — menus.
  - `audio.js` — sounds and music, made with WebAudio.
  - `extras.js` — the shared volume slider and Score Card (from `shared/daily-mobile/`).
- `app/` — the Go + WebView2 Windows wrapper.
- `tools/` — the build script, the icon tools and the art generators.
- `docs/` — `DESIGN.md` (the contract between modules), `MECHANICS.md`, and the QA reports in `reports/`.
- `tests/` — unit, end-to-end, visual and simulation tests.
