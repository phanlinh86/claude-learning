# Finn's Island Fling (daily game, 2026-11-09)

## Goal
A family-friendly slingshot game. Finn, a little pirate fox, is flung from a palm-tree slingshot over the sea. He catches magic leaves in mid-air and lands on a drifting raft. There are 4 islands: Sunny Cove, Jungle Isle, Coral Lagoon and Lantern Bay. A day-to-night cycle shrinks what you can see at night. Requirement: `REQUIREMENT.md`. Made with `/build-game random`.

## Status
v1.0, built and tested on 2026-11-09.
- **QA results:**
  - unit tests 27/27;
  - smoke test passes;
  - functional suite 189/189 (`docs/reports/functional.md`);
  - visual review in `docs/reports/visual.md` and playtest in `docs/reports/playtest.md`.
- **Applied after QA:**
  - Playtest patch: flutter only works once Finn stops rising; a flop retries the same shot; hearts come back every 12/20/25 leaves (easy/normal/hard); wider raft ranges; a bigger and calmer raft with a longer preview on Easy; leaf arcs avoid gulls.
  - iPad 4:3 layout fix.
  - A "turn sideways" card on phones held upright, and bigger sprites in portrait.
  - Clearer aiming dots, tilt clamp plus easing, pop-up placement, a veil over custom background photos, and a darker moon-leaf halo by day.
  - CSS fixes for the How to Play cards and the game-over digits.
  - A keyboard aim followed by a plain tap no longer flings.
  - Bot runs don't show "NEW!" on the game-over screen.
  - The exe no longer un-maximizes its window on a second launch.
- **Open (P3 in the reports):** the ghost-hand hint covers Finn's belly; the front band and pouch look; the crescent moon looks like a dark disc at dusk; gulls get no light at night; splash and flutter effects are faint; the Change Pictures grid has a gap.
- **Not yet verified:** a real iPhone or iPad, the music by ear, and the exe on Windows.

## Stack
- HTML5 canvas and plain JavaScript on `window.FIF` in `game/`.
- `world.js` has no pixels and is deterministic: units are u, y points up, the sea is at y 0, the field is 16 × 9 u, and it runs fixed 1/120 s steps.
- `render.js` turns units into pixels: landscape `unit = min(VH/9, VW/16.4)`, portrait `unit = VW/16.4`.
- The Go + WebView2 wrapper in `app/` builds `dist/FinnsIslandFling.exe`. It uses port 47781, falling back to 47791, 47801 and 47811.
- Original SVG art from `tools/art-*`; sound synthesized with WebAudio.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract between modules.
- Kid-friendly content: a splash is a soft "bloop", gulls just bonk, original art and sound only.
- `world.fox.rot` uses the world convention (counter-clockwise is positive), so draw it with `rotate(-rot)`.
- Storage keys use the `fif:` prefix, because all the games share one GitHub Pages origin.
- `app/web/`, `build/`, `dist/` and `tests/out/` are build outputs and are gitignored.
