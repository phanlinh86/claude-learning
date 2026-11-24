# Lolo's Jungle Leaf Match · Khỉ Lolo Lật Lá Tìm Đôi (education game, 2026-11-24)

## Goal
Memory learning game for ages 3–7 (default 4): the cards are big leaves hanging on vines from a giant jungle tree; a tapped
leaf flips over on its stem and swings; Lolo the little monkey leans and points; found pairs glow, an orchid blooms on each
stem and a butterfly flutters off; a finished tree → Lolo backflips and swings on a liana to the next tree; times of day
morning → noon → sunset → starry night. EN/VI voice. Requirement: `REQUIREMENT.md`.

## Stack
- HTML5 canvas + plain JS on `window.LL` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Forked from `../giraffe-city-windows/` (namespace `GW → LL`, storage prefix `ll:`); leaves, tree, Lolo, critters, jungle,
  content (topic `food`) and sounds are new. Script order: rng, i18n, content, world, weather, bot, storage, assets, audio,
  voice, input, lolo_art, leaf_art, render, ui, main.
- Owners (DESIGN §5): mechanics `rng/content/world/weather/bot` (+ `MECHANICS.md`, `tests/unit/run.js`, `tests/sim/*`); voice
  & input `i18n/voice/input` (+ `VOICE.md`); artist A `lolo_art.js` + `characters/*`, `ui/*`, `icon.svg` (`tools/art_lolo.py`);
  artist B `leaf_art.js` (`tools/leaf_sheet.js`); artist C `items/*` (`tools/art_animals.py`); environment `env/*`,
  `particles/*` (`tools/art_env.js`, `tools/env_scenes.js`); lead `storage/assets/audio/render/ui/main`, `index.html`,
  `style.css`, `tests/e2e/*`, `tests/visual/*`.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` (wins where they differ) the
  world's real API / `LL.CONFIG` / events / renderer contract, `docs/VOICE.md` the event → line table.
- Kid-friendly and original only; no fail states; every round solvable (content self-checks). Lolo's arm and body never cover
  a leaf; the top side of every leaf of a tree is identical (no memory cue); answer faces only on the pale underside.
- Every text key in both `en` and `vi` with identical `{params}`; bubble "Lolo", Vietnamese speech "Lô Lô".
- URL test flags never saved; storage prefix `ll:`. Loud audio chain + volume setting; all sound synthesized.
- Speech: the prompt is protected from when it is queued until it has been spoken (`speakPrompt`); peek / hide / cheer /
  swing lines only when Lolo is quiet.
- Tests: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/leaf_art.test.js &&
  node tests/unit/lolo_art.test.js && node tests/e2e/smoke.js`; full `node tests/e2e/functional.js`.
