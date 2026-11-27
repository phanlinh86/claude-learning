# Pip's Oasis Glow

Game of the day for 2026-11-27, made with `/build-game random` (whack-a-critter · desert oasis · a frog · fireflies · golden rare item worth 5 · storybook chapters). Pip the little frog lives by a desert oasis, and tonight the oasis needs light! Desert friends (a fennec kit, a jerboa and a tortoise) peek out of their hidey-holes holding glowing fireflies. Tap a friend and Pip leaps over for a gentle head-boop and catches the firefly with his tongue. But some friends are napping: shh, don't wake them!

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/frog-oasis-glow/game/ (iPhone, iPad, desktop browser). On iPhone or iPad, choose "Add to Home Screen" to play full screen.

## How to play
- **Catch fireflies:** tap or click a friend holding a firefly (the whole hidey-hole counts). Keys `1`–`9` tap the holes, back row first. Pip hops over in a real gravity arc, lands on their head and his tongue snaps the firefly into his lantern jar.
- **Golden firefly:** rare, a little quicker, worth 5 times the points.
- **Nappers:** friends wearing a nightcap, with closed eyes and little "z"s, are napping. Waking one makes Pip dizzy, resets the combo and costs a lily-pad heart.
- **Points:** firefly +10 × multiplier (×2 from combo 5, ×3 from combo 10); golden firefly +50 × multiplier; chapter finished +50.
- **Hearts:** start with 5 (max 5), +1 every 12 fireflies. On Normal and Hard, a firefly holder that ducks away un-tapped also costs a heart (never on Easy). No hearts left: the story ends.
- **No mashing:** 3 taps on empty holes within a second make Pip take a little nap (no heart lost).
- **Chapters:** 15 fireflies fill the jar's ring and turn the page: The Morning Spring → The Palm Grove → The Sunset Dunes → The Starlit Oasis, then Book 2, a bit faster.
- **Keyboard:** `1`–`9` tap, `Esc`/`P` pause, `M` sound, `F11` full screen.
- **Change Pictures:** use your own picture for Pip, the desert friends or any of the four chapters. Pictures are saved on this device only.

## Build and test
- Windows exe: `bash tools/build.sh` → `dist/PipsOasisGlow.exe`. Needs Go, Node with Playwright, and Python with Pillow. If the Go proxy is blocked, run it with `GOPROXY=direct GOSUMDB=off`. Player data is saved in `%APPDATA%\PipsOasisGlow\data`.
- Unit tests: `node tests/unit/run.js`
- Smoke test: `node tests/e2e/smoke.js`
- Functional tests: `node tests/e2e/functional.js` (`SOAK=20` for a shorter bot soak, `ONLY=` to run one group)
- Visual capture: `node tests/visual/capture.js [screens|moments|motion|cvd|custom]`
- Playtest simulations: `node tests/sim/run.js` and `node tests/sim/playtest.js base rec` (`--quick` for fewer seeds)
- Art generators: `node tools/art-characters/gen.js` and `node tools/art-environment/gen.js` (contact sheets: `sheet.js`)

## URL switches (for testing)
`?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N`
These flags are never saved into the settings, and runs that use them never save a best score.

## Layout
- `game/` — the web game: plain JavaScript on `window.POG`, no build step.
  - `world.js` — the game rules and motion (no drawing); `bot.js` — the autopilot; `weather.js` — chapter particles and pool ripples.
  - `render.js` — drawing (page-turn transitions, chapter cards, jar HUD); `main.js` — input and game modes; `ui.js` — menus; `audio.js` — WebAudio sounds and music; `extras.js` — volume slider and Score Card (shared layer).
- `app/` — the Go + WebView2 Windows wrapper.
- `tools/` — the build script, the icon tools and the art generators.
- `docs/` — `DESIGN.md` (the contract between modules), `MECHANICS.md`, art contact sheets in `art/`, and the QA reports in `reports/`.
- `tests/` — unit, end-to-end, visual and simulation tests.
