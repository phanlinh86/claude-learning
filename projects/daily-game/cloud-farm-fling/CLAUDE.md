# Nubi's Farm Fling (daily game, 2026-11-24)

## Goal
A family-friendly slingshot game. Nubi, a little rain cloud, is flung from a hay-bale slingshot across a farm, gulps fireflies in mid-air and lands on a planter wagon to rain on the crops. Four seasons: Spring Sprouts, Sunflower Summer, Pumpkin Autumn, Snowy Winter. Twist: **Nubi slowly grows bigger** (mist up to 1.3×, fireflies up to 1.7×): bigger pickup and rain pad, but more buoyancy and air drag (shorter, floatier arcs); raining shrinks him halfway back. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
v1.0 on 2026-11-24, forked from `../fox-island-fling/` (same slingshot core, UI and mobile layer; the day–night twist replaced by growth).
- QA round (`docs/reports/`): functional 258/259 at first (Settings too wide on 667×375); visual 1 P1 (sling pouch on Nubi's mouth) + 10 P2; playtest: seasons too short (22–25 s), growth barely visible, waiting-to-grow exploit on Hard, crows on firefly arcs.
- Fixes applied: waterings per season by difficulty (`DIFF.landings` 6/9/10), `MIST_CAP` 1.3, `RAIN_KEEP` 0.5, crow-safe arcs (more tries, 0.5–1.5 s release window); pouch under Nubi and band drawn behind him, no blue rain in winter, bullseye ring in every season during aim/flight, gold firefly bigger + white ring, size meter BIG label, suns moved out from under the HUD, portrait pill + ground moved, hint hidden under the season banner, Settings grid `minmax(0,1fr)`, fox leftovers.
- After fixes: unit 29/29, smoke pass, functional `--quick` 250/250, `test_extras.js` pass, exe builds.
- Open: the bale's grass patch is bright green in every season; wagon turns olive for deuteranopia (shape still distinct); portrait sun can sit behind the pause buttons; P3 list in `docs/reports/visual.md`.
- Not yet verified: real iPhone/iPad, music by ear, the exe on Windows.

## Stack
HTML5 canvas + plain JS on `window.CFF`; `world.js` headless and deterministic (u ≈ 1 m, y up, grass at y 0, field 16 × 9 u, fixed 1/120 s steps); `render.js` maps u → px (landscape `unit = min(VH/9, VW/16.4)`, portrait `VW/16.4`, ground at 0.58·VH); Go + WebView2 wrapper → `dist/NubisFarmFling.exe`, port 48513 (fallbacks 48523/48533/48543); original SVG art from `tools/art-*`; WebAudio sound.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract; `docs/MECHANICS.md` has the numbers.
- Kid-friendly (a miss is a soft "pfff", crows just bonk), original art and sound only. Yellow is reserved for fireflies.
- `world.nubi.rot` uses the world convention (counter-clockwise positive): draw with `rotate(-rot)`.
- Flight, `preview()`, `predictShot()` and the firefly arcs share ONE step function — keep it that way.
- Storage keys use the `cff:` prefix (all games share one GitHub Pages origin).
- After changing `audio.js` / `index.html`, re-run `python3 shared/daily-mobile/apply.py cloud-farm-fling` and `test_extras.js`.
- `app/web/`, `build/`, `dist/` and `tests/out/` are build outputs and are gitignored.
