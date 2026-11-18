# Gigi's Peekaboo Windows · Hươu Gigi Mở Cửa Sổ (education game, 2026-11-18)

## Goal
Memory learning game for ages 3–7 (default 4): the cards are windows with wooden shutters on city apartment buildings; Gigi
the giraffe calf stretches her neck to peek; found pairs light up and bloom; the street scrolls to the next building;
weather sunny → breezy → rain → rainbow. EN/VI voice. Requirement: `REQUIREMENT.md`.

## Stack
- HTML5 canvas + plain JS on `window.GW` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Shell forked from `../duckling-forest-memory/` (namespace `DM → GW`, storage prefix `gw:`); world, content, art, render
  and sounds are new. Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, gigi_art,
  window_art, render, ui, main.
- Owners (DESIGN §5): mechanics `rng/content/world/weather/bot` (+ `MECHANICS.md`, `tests/unit/run.js`, `tests/sim/*`); voice
  & input `i18n/voice/input` (+ `VOICE.md`); artist A `gigi_art.js` + `characters/*` (`tools/art_gigi.py`); artist B
  `window_art.js` (`tools/window_sheet.js`); artist C `items/*` (`tools/art_animals.py`); environment `env/*`, `particles/*`
  (`tools/art_env.js`, `tools/env_scenes.js`); integrator `storage/assets/audio/render/ui/main`, `index.html`, `style.css`.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` (wins where they differ) the
  world's real API / `GW.CONFIG` / events / renderer contract, `docs/VOICE.md` the event → line table.
- Kid-friendly and original only; no fail states; every round solvable (content self-checks). Gigi's head never covers a
  window; shutters of one building are identical (no memory cue).
- Every text key in both `en` and `vi` with identical `{params}`; bubble "Gigi", Vietnamese speech "Gi Gi".
- URL test flags never saved; storage prefix `gw:`. Loud audio chain + volume setting; all sound synthesized.
- Speech: the prompt is protected from when it is queued until it has been spoken (`speakPrompt`); peek / hide / cheer lines
  only when Gigi is quiet (playtest P1-1).
- Tests: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/window_art.test.js &&
  node tests/unit/gigi_art.test.js && node tests/e2e/smoke.js`; full `node tests/e2e/functional.js`.
