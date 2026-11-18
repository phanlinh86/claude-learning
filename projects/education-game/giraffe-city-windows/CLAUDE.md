# Dee's Forest Memory · Vịt Dee Lật Thẻ (education game, 2026-11-01 re-roll)

## Goal
Memory-card learning game for ages 3–7 (default 4) with Dee the duckling in a fairy forest through the seasons, EN/VI voice.
Requirement: `REQUIREMENT.md`. Rolled with the new mechanic-family rule (no container/drag game) after parents' feedback.

## Stack
- HTML5 canvas + plain JS on `window.DM` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../kitten-balloon-farm/` (state machine, voice, input, storage, loud audio with volume, ui, main, tests),
  namespace → `DM`. New: a memory-card world (`world.js`: grid fitting, deal/peek/hide/play phases, 3D flips, match/mismatch,
  rewards that fly to perches), pair `content.js`, `card_art.js` (card faces/backs, butterflies, lanterns, acorns, stars by code),
  seasonal weather (spring petals, summer sparkles, autumn leaves, winter snow).
- Art: original SVG from generators in `tools/` (`art_dee.py`, `art_animals.py`, `art_env.js`); icons via `tools/render_icons.js`.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real touch), `tests/sim` (headless playtests), `tests/visual`.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`DM.CONFIG`).
- Kid-friendly and original only; no fail states; every round solvable.
- Every text key in both `en` and `vi`; Vietnamese speech says the name as "Đi" (bubble keeps "Dee").
- URL test flags never saved; storage prefix `dm:`. Loud audio chain + volume setting (skill rule).
- Prompts are protected: praise / mismatch lines never interrupt Dee's instruction (`speakPrompt` in main.js).
