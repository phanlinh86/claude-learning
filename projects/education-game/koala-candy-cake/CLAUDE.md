# Koko's Cake Tower · Tháp Bánh Kem Của Koala Koko (education game, 2026-11-14)

## Goal
Cake-stacking learning game for ages 3–7 (default 4) with Koko the koala baker in Candy Village, weather sunny →
breezy → rain → rainbow, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *build* (rolled with the variety
rule; theme swapped jungle → candy village so it is not a copy of Lulu's Jungle Tower).

## Stack
- HTML5 canvas + plain JS on `window.CK` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../giraffe-jungle-tower/` (state machine, tower physics, voice, input, storage, loud audio with
  volume, ui, main, tests), namespace → `CK`, storage prefix `ck:`. New: wide soft cake layers (`LW × LH`) with jelly
  landing, cherry on a cotton-candy cloud, candles counted then blown out, sprinkles, bee surprise, breeze coupling,
  weather cycle (`weather.js`), cake-layer art in `block_art.js`.
- Art: original SVG from generators in `tools/` (`art_koko.py`, `art_animals.py`, `art_env.js`); icons via
  `tools/render_icons.js`; contact sheets in `docs/art/`.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real CDP touch), `tests/sim` (headless
  playtests, child models, voice model), `tests/visual` (`ck_*` capture/analyze).

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`CK.CONFIG`).
- Kid-friendly and original only; no fail states; every ask has exactly one matching layer; the cake never falls.
- Every text key in both `en` and `vi`; the helper is "Koko" in both languages.
- URL test flags never saved; storage prefix `ck:`. Loud audio chain + volume setting (skill rule).
- Prompts are protected: the guard in `speakPrompt` (main.js) lasts until the prompt has actually been spoken.
