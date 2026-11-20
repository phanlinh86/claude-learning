# Pip's Reef Tower · Tháp San Hô Của Bạch Tuộc Pip (education game, 2026-11-20)

## Goal
Shell-tower building learning game for ages 3–7 (default 4) with Pip the little octopus on the seabed, weather above the
waves sunny → breezy (sea current) → rain → rainbow, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *build*
(rolled with the variety rule; helper swapped owl → octopus to fit the under-the-sea theme).

## Stack
- HTML5 canvas + plain JS on `window.RT` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../koala-candy-cake/` (state machine, tower physics, voice, input, storage, loud audio with
  volume, ui, main, tests), namespace → `RT`, storage prefix `rt:`; renamed koko → pip, cherry → crown (starfish),
  candle → pearl, bee → puffer. New: TAP TO SEND (bubble lift) besides drag, underwater sinking with water drag and
  leaf-like rocking, bubble trails, sand puffs, starfish crown on a jellyfish, pearls floating away as bubbles, fish
  school, puffer-fish surprise, sea animals with clue questions, underwater rendering (water gradient, rays, surface band).
- Art: original SVG from generators in `tools/` (`art_pip.py`, `art_animals.py`, `art_env.js`); icons via
  `tools/render_icons.js`; contact sheets in `docs/art/`.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real CDP touch: tap and drag),
  `tests/sim` (headless playtests, child models, voice model), `tests/visual` (`rt_*` capture/analyze).

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`RT.CONFIG`).
- Kid-friendly and original only; no fail states; every ask has exactly one matching block; the tower never falls.
- Every text key in both `en` and `vi`; the helper is "Pip" in both languages.
- URL test flags never saved; storage prefix `rt:`. Loud audio chain + volume setting (skill rule).
- Prompts are protected: the guard in `speakPrompt` (main.js) lasts until the prompt has actually been spoken.
