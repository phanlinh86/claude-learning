# Tofu's Volcano Melody

Game of the day for 2026-11-14, made with `/build-game random`. The little volcano on Tofu's island doesn't spit lava — it hums, and puffs out **musical notes**! Walk Tofu the panda around the island to scoop them up; every note you catch plays the next note of the island's song. Catch notes quickly one after another to build a combo — at combo 5, **Coco the parrot** flies in to help. Dodge the grumpy-but-harmless pebble crabs, finish each season's song, and travel from a blossom spring to a snowy winter.

**Play:** https://phanlinh86.github.io/claude-learning/projects/daily-game/panda-volcano-melody/game/ (iPhone, iPad, desktop browser). On iPhone or iPad, choose "Add to Home Screen" to play full screen.

## How to play
- **Touch / mouse:** press and hold — Tofu walks towards your finger. Let go to stop.
- **Keyboard:** arrows / WASD (8 directions). Esc/P pause, M sound, F11 full screen.
- A note = **10 + 2 × your combo** (up to +20). Catch the next note quickly to keep the combo going; combo 5 calls Coco for a few seconds.
- Volcano notes fly on an arc — the soft ring on the ground shows where each one will land.
- A crab pinch costs a heart (then Tofu blinks safe for a moment). A mango gives a heart back. No hearts left → Tofu takes a nap.
- **Change Pictures** lets you use your own photo or drawing for Tofu, the music note and the island meadow.

## Difficulty
Easy (default) is for ages 3–6: 5 hearts, slow crabs that only pinch when they really chase, a long combo window. Normal suits older kids and casual adults; Hard is an adult mode. After winter the year starts again — longer songs, faster crabs, and from year 3 an extra crab.

## Build (portable Windows exe)
```
bash tools/build.sh      # → dist/TofusVolcanoMelody.exe (PE32+ GUI x86-64)
```
Needs Go 1.22+, Node + Playwright (icon render only) and Python 3 + Pillow. If the Go proxy is blocked, use `GOPROXY=direct GOSUMDB=off bash tools/build.sh`. On Windows, SmartScreen may warn on first run → **More info → Run anyway**. Saves settings/best score under `%APPDATA%\TofusVolcanoMelody\data`.

## Test / dev URL switches
`?speed=N&bot=1&skill=0.8&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`
- `node tests/unit/run.js` — simulation unit tests (27).
- `node tests/e2e/smoke.js` — Playwright smoke.
- `node tests/e2e/functional.js` — full functional suite (357 checks).
- `node tests/visual/capture.js` — screenshots + motion contact sheets for art review.
- `node tests/sim/run.js` — high-speed playtest harness (bots, a 4-year-old model, exploit players).
- `node tests/perf/measure.js --suite quick` — frame-time measurements.

## Layout
`game/` the game (plain JS on `window.PVM`) · `app/` Go + WebView2 wrapper · `tools/art-*` SVG generators and the build/icon scripts · `docs/` DESIGN.md, MECHANICS.md and QA reports · `tests/` unit, e2e, sim, visual, perf.

Made with `/build-game random`. Browsers cache for ~10 minutes — hard-refresh (Ctrl/Cmd+Shift+R) to see an update.
