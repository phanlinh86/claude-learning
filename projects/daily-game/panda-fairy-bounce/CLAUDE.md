# Mochi's Fairy Bounce (daily game, 2026-11-10)

## Goal
A family-friendly brick-breaker in a fairy forest. Mochi the panda carries a mushroom-cap paddle, a fairy-light ball breaks seasonal blocks, stars fall out to be caught, and Hoot the sleepy owl throws soft pillows that make Mochi sleepy. Four seasons: Spring Meadow, Summer Glade, Autumn Hollow, Winter Glow. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
v1.0, built and tested on 2026-11-10.
- **QA results:** unit tests 34/34; smoke test passes; functional suite in `docs/reports/functional.md`; visual review in `docs/reports/visual.md`; playtest in `docs/reports/playtest.md`.
- **Applied after QA:**
  - Playtest: Easy cap 3.0 → 3.6 u, ball 6.2 → 5.4 u/s, vine saves 2 → 8 (a 5-year-old model clears spring 0 % → 73 %); anti-stall after 5 s (was 12) that aims at the nearest block's underside, banks off the wall when out of reach and grows from 50 % to 100 % (worst stall 175 s → 27 s).
  - Visual P1: Hoot is drawn over the score pill, and the pause/sound buttons fade when he's under them; the serve hint waits for the season banner, and desktop gets its own spring hint.
  - Visual P2: popups no longer pile up (and Hoot's sit below him); the two serve hints no longer collide; the banner fades once the ball is served; portrait ground is shorter with a gradient; title scrim and tagline pill; How to Play icons fixed; custom background photos get a stronger veil and a slight blur.
  - Functional: touch buttons ≥ 44 px; a fast flick no longer serves; Quit shows only in the app; the exe falls back to a temp folder if `%APPDATA%` can't be written.
- **Open (P3 in the reports):** see `docs/reports/visual.md` (faint feathers, the green-on-green vine, Hoot's cloud near the top row) and `functional.md` (fullscreen toggle on a rejected request, Windows reserved key names).
- **Not yet verified:** a real iPhone or iPad, the music by ear, and the exe on Windows.

## Stack
- HTML5 canvas and plain JavaScript on `window.MFB` in `game/`.
- `world.js` has no pixels and is deterministic: units are u, y points up, the ground (Mochi's feet) is y 0, the field is x 0…16 with the ceiling at 8.6, fixed 1/120 s steps with ≤ 0.1 u ball micro-steps (no tunnelling).
- `render.js` turns units into pixels: landscape `unit = min(VH/9.1, VW/16.4)`, field centred, ground 0.4 u above the bottom; the art was drawn for 60 px per u. Season backgrounds are pre-rendered once per size and crossfade.
- The Go + WebView2 wrapper in `app/` builds `dist/MochisFairyBounce.exe`. It uses port 47821, falling back to 47831, 47841 and 47851. JS bridge: `mfStoreAll/mfStoreSet/mfStoreDel/mfFullscreen/mfQuit`.
- Original SVG art from `tools/art-*`; sound synthesized with WebAudio.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract between modules.
- Kid-friendly content: pillows, giggles and feathers; nothing scary; original art and sound only.
- Rotations in the world are counter-clockwise positive, so draw with `rotate(-rot)`.
- Storage keys use the `mfb:` prefix, because all the games share one GitHub Pages origin.
- `app/web/`, `build/`, `dist/` and `tests/out/` are build outputs and are gitignored.
