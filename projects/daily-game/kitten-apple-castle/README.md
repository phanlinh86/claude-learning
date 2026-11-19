# Ziggy's Apple Castle

Daily game for 2026-11-19, made with `/build-game random`. Ziggy the rocket kitten zooms over a cosy, not-at-all-scary castle in her little hover-rocket. Granny Boo, the castle's kind old ghost, wants to bake the biggest apple pie ever, so Ziggy stacks apple crates up the castle wall to reach her kitchen window. **Tap to drop** the crate from Ziggy's lantern glow: land it in the middle for **Perfect!** and a glowing **lantern** is hung on that crate; too far over the edge and it tumbles off. The day keeps turning while you stack (Dawn → Noon → Sunset → Night), and as it gets **darker** the lanterns, glowing apples, the moon and the castle windows are what light your way.

## Play
- **iPhone / iPad (portrait or landscape) and any browser:** https://phanlinh86.github.io/claude-learning/projects/daily-game/kitten-apple-castle/game/
  On iPhone/iPad: Safari → Share → **Add to Home Screen** for a full-screen app icon. You can also open `game/index.html` straight from disk.
- **Windows:** run `bash tools/build.sh` to make `dist/ZiggysAppleCastle.exe`, a portable exe that uses WebView2. Saves go to `%APPDATA%\ZiggysAppleCastle\data`.

| Action | Keyboard | Touch / mouse |
|---|---|---|
| Drop the crate | Space / ↓ / Enter | tap / click anywhere |
| Pause / sound / full screen | Esc or P / M / F11 | buttons at the top right |

**Rules:**
- Every crate that stays: +10. Perfect (close to the centre): +10 × combo (up to ×5) and a lantern on that crate.
- Floating apples: drop a crate through them. +5 each, **+10 when it is dark** (a "glow apple"). Every 5 apples Granny Boo bakes a pie: **+1 heart**.
- A crate whose centre lands past the edge tumbles off; if the crates above any crate lean past its edge (centre of mass), the top part topples. Either costs a heart. No hearts left → game over. Each new time of day gives one heart back.
- Reaching the crate goal (10 / 12 / 14 / 16): Granny Boo floats down, waves and takes the apples; goal bonus 100 × time of day × round. After Night the day starts again, a little faster.
- The first run starts on **Easy** (5 hearts, slow swing, wide crates, a coloured drop guide that stays clear in the dark); change it in Settings.
- Change Pictures: Ziggy, the crate, the apple and each time of day's background can be your own photos or drawings (the darkness still falls over your picture at night).

## Build and test
```bash
node tests/unit/run.js            # mechanics unit tests (28)
node tests/e2e/smoke.js           # boot + taps + bot run + every time of day + goal show + game over, no console errors
node tests/e2e/functional.js      # functional suite: menus, input, rules, pies, pictures, light, layouts, long run (~6 min, 272 checks)
node tests/e2e/screens.js         # screenshot tour (960×540 and 390×844) → tests/out/shot_*.png
node tests/sim/run.js             # player-model balance sim (kid, casual adult, spam, perfect-waiter, bots)
node tools/art-characters/gen.js && node tools/art-environment/gen.js   # regenerate the SVG art
node tools/render_mobile_icons.js # home-screen icons
GOPROXY=direct GOSUMDB=off bash tools/build.sh   # Windows exe (cross-compiles from Linux)
```
Shared mobile layer check (from the repo root): `node shared/daily-mobile/test_extras.js projects/daily-game/kitten-apple-castle`.

**URL switches:** `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`. For tests, `window.AC.debug` exposes the game state (`drop()`, `gotoLevel(i)`, `setBot(on, skill)`, `getState()`).

## Layout
- `game/`: the HTML5 game (classic scripts on `window.AC`), original SVG art in `assets/default/`.
- `app/`: the Go + WebView2 Windows wrapper (port 47627, single instance).
- `tools/`: the art generators, icon rendering and `build.sh`.
- `docs/`: the design spec (`DESIGN.md`), `MECHANICS.md` and the art contact sheets.
- `tests/`: unit, e2e and sim tests.
