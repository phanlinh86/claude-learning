# Ollie's Lighthouse Flip

Daily game for 2026-11-20, made with `/build-game random` (gravity-flip runner · arctic · an otter · leaves · a day-to-night cycle that changes visibility · floors of a building). Ollie the sea otter is climbing the Snowcap Lighthouse to light the great lamp before the polar night. His magic snowflake scarf flips which way is "down": **tap and Ollie swooshes up to run upside-down along the ceiling, tap again to drop back to the floor.** Flip over open floor hatches and around snowball piles, hanging mittens and plant baskets, and catch the fluttering greenhouse leaves. Each floor is later in the day: the windows go from dawn to noon to sunset to a starry aurora night, the halls get darker, and the wall lamps and Ollie's headlamp light the way.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/otter-arctic-flip/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/OlliesLighthouseFlip.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\OlliesLighthouseFlip\data`.

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Flip gravity | Space / ↑ / ↓ / Enter | tap / click anywhere |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- Leaf: +10 × streak (×1 … ×5, +1 every 5 in a row). Each floor finished at the stairway door: 100 × floor × day, and one heart back.
- Bumping a prop or falling through a hatch (Pip the puffin flies in and carries Ollie back) costs a heart and ends the streak (on Easy it halves it). No hearts → game over.
- Floors: 1 Boot Room (dawn) → 2 Greenhouse (noon) → 3 Map Library (sunset, the lamps switch on) → 4 Lantern Deck (night), then the next day starts at the Boot Room, a bit faster.
- In the dark floors the wall lamps, small warning lamps on every prop and hatch edge, and Ollie's headlamp keep every hazard visible in time; it is never darker than 30 % light.
- The first run starts on **Easy** (5 hearts, slower, more space between hazards, a forgiving hit box); change it in Settings.
- Change Pictures: Ollie, the leaf and each floor's background can be your own photos or drawings.

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests (27)
node tests/e2e/smoke.js           # boot + clicks + bot run + every floor (light and dark) + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, rules, light, pictures, layouts, long run (~5 min, 352 checks)
node tests/visual/capture.js      # screenshots and motion sheets → tests/out/visual/ (only=screens,zones,… views=small,phone)
node tests/sim/run.js             # player-model pacing sims (kid, casual adult, spam, never-tap, bots)
node tools/art-characters/gen.js && node tools/art-environment/gen.js   # regenerate the SVG art
node tools/render_mobile_icons.js # home-screen icons
bash tools/build.sh               # Windows exe (cross-compiles from Linux; if the Go proxy is blocked: GOPROXY=direct GOSUMDB=off)
(cd ../../.. && node shared/daily-mobile/test_extras.js projects/daily-game/otter-arctic-flip)   # volume + Score Card layer
```
**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard&maxpx=N&adaptive=0`. For tests, `window.OF.debug` exposes the game state (`world`, `weather`, `mode`, `stats`, `getState()`, `setSpeed(n)`, `startGame()`, `setBot(on, skill)`, `setAutoRestart(on)`, `gotoLevel(i)`, `flip()`). Test flags are never saved.

## Layout
- `game/`: the HTML5 game (classic scripts on `window.OF`), original SVG art in `assets/default/`.
  - `world.js` (headless, deterministic mechanics), `weather.js` (particles), `bot.js` (autoplayer) — see `docs/MECHANICS.md`.
  - `render.js` (scene, darkness layer, juice, HUD), `assets.js`, `audio.js` (synthesized SFX + music), `ui.js`, `main.js`, `storage.js` (`olf:` prefix), `extras.js` (shared volume + Score Card layer).
- `app/`: the Go + WebView2 Windows wrapper (port 47628, single instance).
- `tools/`: the art generators, icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md` and art contact sheets.
- `tests/`: unit, e2e, visual and sim tests.
