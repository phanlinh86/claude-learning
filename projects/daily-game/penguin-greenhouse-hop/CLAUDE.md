# Puddle's Greenhouse Hop (daily game, 2026-11-23)

## Goal
A family-friendly vertical platform hopper: Puddle the penguin auto-bounces up the 4 floors of a rainy greenhouse (Potting Shed, Fern Floor, Orchid Balcony, Rooftop Rain Garden), steering left/right, catching fireflies for her lantern jar. Twist: **she slowly grows bigger** (time + fireflies, up to 1.6×): wider pad, bigger catch reach, deeper leaf flicks, ×2 metres, but heavier steering; she shrinks back with a size bonus at each new floor. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
v1.0 on 2026-11-23, forked from `../frog-farm-hop/` (same hopper core, camera, input, UI and mobile layer; the wind twist removed).
- QA round (`docs/reports/`): functional 642 PASS / 2 FAIL at first (fork leftover medal text, Settings 11 px too wide on notched phones); visual 1 P1 / 10 P2; playtest: 0 unavoidable falls in 54,730 checked, no exploits, growth is a power-up.
- Fixes applied: playtest CONFIG (`growRate` 0.006, Easy `widthK` 1.6), medal text, Settings grid `minmax(0,1fr)`, lantern at max hearts says no "+1 heart", rescue sound + text, Settings difficulty beats `?diff=`, bot runs show no "NEW!" best; leaf stalks from the pillars, basket hook + rod, Easy pot height cap, "+10" placement by size, "Flick!" only when big, portrait HUD stacked left, 4:3 landscape column narrower than the HUD, round title icon, volume steppers 44 px on touch, unused wind noise bed removed.
- After fixes: unit 37/37, smoke clean, functional `--quick` 382 PASS / 0 FAIL / 5 WARN, `test_extras.js` passed, exe builds.
- Open: side platforms on Hard can be a dead end for a while (playtest `tests/sim/stalls.js`, fix = also require a hop up to the next path platform); the Score Card background shows the game HUD (shared `extras.js`); a failed native delete isn't rolled back (`storage.js`); colour-blind view turns pots/leaves olive (shapes still differ); How to Play icons small on phones; "heavier steering" is never a real downside (sims: weight reduces overshoot).
- Not yet verified: real iPhone/iPad, the music by ear, the exe on Windows.

## Stack
Same as the other games in `projects/daily-game/`: HTML5 canvas + plain JS on `window.PH`; `world.js` headless and deterministic (1 u = 1 m; column 12 u; fixed 1/120 s steps; `PH.World.surfY(p, x)` for the bent leaf surface, `world.platAt(p, t)` for basket prediction); `render.js` maps u → px (`unit` = VH/11.5 landscape, capped on 4:3; VW/12.8 portrait); Go + WebView2 wrapper (`dist/PuddlesGreenhouseHop.exe`, port 48413, then 48423/48433/48443); original SVG art from `tools/art-*`; WebAudio sound; Node unit tests + Playwright e2e/visual tests + player-model sims.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract; `docs/MECHANICS.md` documents world/weather/bot numbers.
- Kid-friendly (falls are a soft umbrella "boing"), original art and sound only; Puddle must not resemble any known penguin character.
- `world.fireflies` is the live ARRAY; the caught count is `world.fireflyCount`. Yellow is reserved for fireflies.
- Every path gap must stay reachable at size 1.0 AND at max size steering (unit reachability test).
- Storage keys use the `pgh:` prefix (all games share one GitHub Pages origin).
- After changing `audio.js` / `index.html`, re-run `python3 shared/daily-mobile/apply.py penguin-greenhouse-hop` and `test_extras.js`.
- `app/web/`, `build/`, `dist/`, `tests/out/` and `tests/sim/out/` are build outputs and are gitignored.
