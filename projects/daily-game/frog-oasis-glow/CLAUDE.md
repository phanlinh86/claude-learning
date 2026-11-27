# Pip's Oasis Glow (daily game, 2026-11-27)

## Goal
A family-friendly whack-a-critter in a desert oasis, told as a storybook. Pip the frog hops in gravity arcs onto the heads of desert friends (fennec kit, jerboa, tortoise) who hold fireflies, and catches them with his tongue into a lantern jar. Napping friends (nightcap, closed eyes, "z"s) must not be tapped; a rare golden firefly is worth 5. Four chapters: The Morning Spring, The Palm Grove, The Sunset Dunes, The Starlit Oasis. Requirement: `REQUIREMENT.md`. Made with `/build-game random`, forked from `../snail-jungle-boop/`.

## Status
v1.0, built and tested on 2026-11-27.
- QA round (`docs/reports/`): functional 450/457 (Pip froze if the chapter changed mid-hop via `gotoLevel`; Settings overflowed sideways on a notched iPhone in landscape; `setSpeed` runs could save a best; small volume buttons); visual 3 P1 (the firefly was caught before Pip landed; the chapter card hid back-row faces and Pip's pad; the jar badge sat on Pip's eyes on 16:9) + 8 P2; playtest: kid3 cleared chapter 1 on Easy only 60 %, gold missing in 34 % of chapters.
- Fixes applied: catch effects (happy face, "+N", firefly to the jar) now wait for Pip's landing (the friend keeps the firefly until then); chapter card in the bottom band and gone by 1.6 s; jar badge moved beside the hearts (x 404); texts kept below the HUD; tongue scaled and curling round the friend's face; dizzy stars above Pip; ripples over the lily pad; "z"s drift sideways; live friends drawn only on the new page during a page turn; night ambient fireflies dimmer in the play band; `START_LEAVES` 4 → 5, `GOLD_P` 0.07 → 0.10, `GOLD_UP_K` 0.75 → 0.90 (kid3 60 → 81 %, kid4 91 → 99 %); world guards a stale hop target; Settings grid `minmax(0,1fr)`; 44 px volume buttons; `setSpeed` taints the run.
- Open: visual P2-7 (custom napper has no nightcap), P2-8 (iPad portrait floor seams), P3s (title icon over the demo Pip, HUD behind game over, crowded middle column in chapters 3–4); playtest ideas (chapter goal per difficulty, idle hint, end-of-book screen).
- **Not yet verified:** a real iPhone or iPad, the music by ear, and the exe on Windows.

## Stack
- HTML5 canvas and plain JavaScript on `window.POG` in `game/`.
- `world.js` has no pixels and is deterministic: logical stage 960×540 px, y down, fixed 1/120 s steps; hole layouts in `World.LAYOUTS`; Pip's hops are exact parabolas (g = 2600 px/s²).
- `render.js` fits the stage (contain) and covers the letterbox; per chapter the sky+floor+hole backs and the frame are pre-rendered once per size; a chapter change is a 1.1 s page turn.
- The Go + WebView2 wrapper in `app/` builds `dist/PipsOasisGlow.exe` on ports 48813/48823/48833/48843. JS bridge: `pgStoreAll/pgStoreSet/pgStoreDel/pgFullscreen/pgQuit`.
- Original SVG art from `tools/art-*`; sound synthesized with WebAudio; `extras.js` (volume + Score Card) and the loud-audio patch come from `shared/daily-mobile/apply.py`.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract between modules (note: the `pop` event carries `critterType`, not `type`).
- Kid-friendly content: fireflies, giggles and naps; nothing scary; original art and sound only.
- Storage keys use the `pog:` prefix, because all the games share one GitHub Pages origin.
- Test URL flags are never saved into settings; bot and test runs never save a best score.
- `app/web/`, `build/`, `dist/`, `tests/out/`, `tests/sim/out/` and the art `out/` folders are build outputs and are gitignored.
