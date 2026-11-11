# Tuk's Ice Match · Cánh Cụt Tuk Lật Băng (education game, 2026-11-11)

## Goal
Memory learning game for ages 3–7 (default 4) with Tuk the penguin chick on a frozen lake, EN/VI voice: crack the frost off
ice blocks (tap or rub), find pairs (colours, shapes, numeral ↔ fish, animal ↔ home …); matched blocks glide together, clink,
melt, and fish / sculptures / animals come out. Weather: sunny → breezy → rain → rainbow. Requirement: `REQUIREMENT.md`.

## Stack
- HTML5 canvas + plain JS on `window.IM` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../duckling-forest-memory/` (state machine, voice, input, storage, loud audio, ui, main, tests),
  namespace `DM → IM`. New: ice-block world (`world.js`: slide-in deal with friction, frost crack/regrow, rub reveal, glide +
  clink + melt, fish parabolas, animals hop home, belly slide), `content.js` with the `homes` topic, `ice_art.js` (blocks, frost,
  faces, fish, snow sculptures, holes by code), polar weather (snow streaks, rain + splash rings, rainbow).
- Art: original SVG from generators in `tools/` (`art_tuk.py`, `art_animals.py`, `art_env.js`); icons via `tools/render_icons.js`.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real touch), `tests/sim` (headless playtests), `tests/visual`.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`IM.CONFIG`).
- Kid-friendly and original only; no fail states; every round solvable.
- Every text key in both `en` and `vi`; Vietnamese speech says the name as "Túc" (bubble keeps "Tuk").
- URL test flags never saved; storage prefix `im:`. Loud audio chain + volume setting (skill rule).
- Prompts are protected: praise / mismatch lines never interrupt Tuk's instruction (`speakPrompt` in main.js).
