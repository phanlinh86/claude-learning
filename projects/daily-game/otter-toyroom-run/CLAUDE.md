# Otto's Playroom Dash (daily game, 2026-11-22)

## Goal
A family-friendly pseudo-3D 3-lane runner in a toy room: Otto the otter runs into the screen through 4 playroom biomes, changes
lanes, jumps foam blocks and bouncy balls, goes around block towers / ring stackers, and collects wooden acorns. Twist: **gravity per
biome** (gk 1.0 Felt Meadow, 0.7 Pillow Mountains, 1.25 Crayon Jungle, 0.5 Glow-Star Galaxy) shapes jumps, ball bounces, acorn arcs
and falling particles. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
v1.0 on 2026-11-22, forked from `../robot-oasis-run/` (same projection, lane spring, input and mobile layer; Fizz and the pillows removed).
- QA round (`docs/reports/`): functional 734/742 at first (Score Card modal + Enter restart, Settings on 667×375, portrait biome pill
  under the buttons, stale docs); visual 3 P1 / 6 P2 / 11 P3; playtest: no unavoidable hits, no exploit, moon balls were a trap.
- Fixes applied: playtest CONFIG (biome-1 `tower2` 0, `ballV` 2.8, `ballKick` 1.2, `ballRest` 0.6, Crayon `gapK` 1.2) + the moon-ball
  unit test; gravity hint waits for the banner; bumped towers drawn behind Otto and faded; landscape `laneW0` capped so the moon apex
  clears the HUD; "+10" beside Otto's head; biome bonus under the banner; bigger HUD text; no title-demo flyers; biome pill placed under
  the measured button row (`_biomePill` exposed for tests); How to Play icons; Settings grid on short phones; Score Card modal can't
  restart the game underneath; title icon rounded; `grav_0` repainted as our own striped ball; go.mod name.
- Tests after fixes: unit 26/26, smoke clean, functional `--quick` 345/345, mobile 157/157, mobile_qa 129/129, `test_extras.js` passed, exe builds.
- Open: Crayon Jungle is still where kids lose most (ideas: show a ball's crossing point on Easy, fewer balls on Easy); kid5 slightly more
  biome-2 hits (`zones[1].patterns.tower2: 2 → 1` if it matters); a second finger cancels a swipe (functional P3-2); exe storage rollback
  edge cases (P3-3); golden acorn low contrast on light roads; acorn_2 reads a bit like a berry; soft rim light for Otto at night.
- Not yet verified: real iPhone/iPad, the music by ear, the exe on Windows.

## Stack
Same as the other games in `projects/daily-game/`: HTML5 canvas + plain JS on `window.OD`; `world.js` headless and deterministic
(1 u = one lane width; fixed 1/120 s steps; `OD.World.jumpProfile(gk)`); `render.js` projects (x, y, z) with `CAM {h 1.9, d 3.2}`;
Go + WebView2 wrapper (`dist/OttosPlayroomDash.exe`, port 48313, then 48323/48333/48343); original SVG art from `tools/art-*`;
WebAudio sound; Node unit tests + Playwright e2e/visual tests + player-model sims.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract; `docs/MECHANICS.md` documents world/weather/bot numbers.
- Kid-friendly (bumps are soft "boing/squish/bwop"), original art and sound only; generic unbranded toys, no letters on blocks.
- Acorns differ by shape AND colour (round caramel, long golden, dotted raspberry toy acorn).
- Every row must stay avoidable under every gravity (unit fairness test); every moon-ball bounce phase must be jumpable in-lane.
- Storage keys use the `otr:` prefix (all games share one GitHub Pages origin).
- After changing `audio.js` / `index.html`, re-run `python3 shared/daily-mobile/apply.py otter-toyroom-run` and `test_extras.js`.
- `app/web/`, `build/`, `dist/` and `tests/out/` are build outputs and are gitignored.
