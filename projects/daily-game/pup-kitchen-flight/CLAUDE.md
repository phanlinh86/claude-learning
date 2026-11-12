# Biscuit's Kitchen Flight (daily game, 2026-11-12)

## Goal
A family-friendly one-button flyer (no pipes) in a cozy kitchen. Biscuit the robot pup (head propeller) catches herb leaves past hanging utensils, pot stacks and kettles with lifting steam. Four weather levels seen through the windows (Sunny Morning, Rainy Noon, Windy Sunset with gusts, Snowy Night) and a day-to-night cycle that darkens the room (nose lamp). Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
v1.0, built and tested on 2026-11-12.
- **QA results:** unit tests 27/27; smoke test passes; functional suite 227/227 (`docs/reports/functional.md`); visual review `docs/reports/visual.md`; playtest `docs/reports/playtest.md`.
- **Applied after QA:**
  - Playtest: Easy is floatier (gravity 850, flap −350, fall 290), 2.5 s blink, higher counter bounce, 4 batteries and one back every 6 leaves, 140 px/s (a 4-year-old model finishes Sunny Morning 2 % → 71 %). Normal gapMin 180 and a battery every 25 leaves; Hard every 30.
  - Visual P1: "Bonk!" text above Biscuit, not on his face; iPad portrait shows wallpaper above and drawers below (kitchen at 65 % of the free space); Change Pictures fits on phones.
  - Visual P2: steam centred on the lift column with rising chevrons and a blue-grey puff; a bigger gust arrow and visible wind streaks; night obstacles glow along their shape (no boxes); "+N" merges; flap ring is a flat downwash; game over waits 1.1 s and sits to the right so the nap shows; a custom wall tiles with parallax and keeps the weather; HUD pills.
  - Functional: `_bgCache` boot race fixed; no pausing while powering down; iPhone SE How to Play fits.
- **Open:** P3 items in `docs/reports/visual.md` not done (e.g. How-to pup icon size); the app/main.go notes in `docs/reports/functional.md`; the optional Easy "soft counter" idea from the playtest.
- **Not yet verified:** a real iPhone or iPad, the music by ear, and the exe on Windows.

## Stack
- HTML5 canvas and plain JavaScript on `window.BKF` in `game/`.
- `world.js` has no pixels and is deterministic: logical stage 960×540 px, y down, fixed 1/120 s steps, hero at x 260; obstacles spawn at x 1240.
- `render.js` fits the stage (contain) and fills the letterbox with the tileable layers (outside 0.08, wall 0.35, counter 1.0 parallax); the night is a half-resolution darkness layer with holes for the lamp, Biscuit and leaves.
- The Go + WebView2 wrapper in `app/` builds `dist/BiscuitsKitchenFlight.exe` on ports 48011/48021/48031/48041. JS bridge: `bkStoreAll/bkStoreSet/bkStoreDel/bkFullscreen/bkQuit`.
- Original SVG art from `tools/art-*/gen.py`; sound synthesized with WebAudio.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract between modules.
- Kid-friendly content: bonks, boings and giggles; the dark is cozy, never spooky; original art and sound only.
- Storage keys use the `bkf:` prefix, because all the games share one GitHub Pages origin.
- `app/web/`, `build/`, `dist/`, `tests/out/`, `tests/sim/out/` and the art `out/` folders are build outputs and are gitignored.
