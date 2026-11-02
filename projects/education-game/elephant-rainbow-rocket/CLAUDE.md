# Bim's Rainbow Rocket · Tên Lửa Cầu Vồng Của Voi Bim (education game, 2026-11-02)

## Goal
Rocket-hop learning game for ages 3–7 (default 4) with Bim the baby elephant in Rainbow Cloud Land, morning → night, EN/VI voice.
Requirement: `REQUIREMENT.md`. Mechanic family *path* (rolled with the variety rule: not container/pop/memory/seek).

## Stack
- HTML5 canvas + plain JS on `window.RR` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../duckling-forest-memory/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace → `RR`, storage prefix `rr:`. New: the rocket-hop world (`world.js`: rows of cloud islands, camera
  climb, curved flights, wagon on a spring rope, rainbow trail, boost, tap lock, drag snap), hop `content.js`,
  `sky_art.js` (islands, tokens, flame, ribbon, boost button by code), times-of-day `weather.js` with parallax clouds.
- Art: original SVG from generators in `tools/` (`art_bim.py`, `art_animals.py`, `art_env.js`); icons via `tools/render_icons.js`.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real touch), `tests/sim` (headless playtests), `tests/visual`.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`RR.CONFIG`).
- Kid-friendly and original only; no fail states; every round solvable.
- Every text key in both `en` and `vi`; the helper is "Bim" in both languages.
- URL test flags never saved; storage prefix `rr:`. Loud audio chain + volume setting (skill rule).
- Prompts are protected: praise / wrong lines never interrupt Bim's instruction (`speakPrompt` in main.js).
- `world.hudKeep` = [HUD box, bubble box] measured from the DOM (never one merged box: it pushed islands onto the rocket).
