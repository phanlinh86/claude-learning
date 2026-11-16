# Moka's Fairy Tea Party · Tiệc Trà Trong Rừng Của Gấu Moka (education game, 2026-11-16)

## Goal
Odd-one-out learning game for ages 3–7 (default 4) at a fairy tea party in a forest clearing with Moka the little
honey-brown bear cub, sunny → breezy → rain → rainbow, EN/VI voice. Requirement: `REQUIREMENT.md`. Tea things float down on
dandelion fluff onto leaf placemats on a mossy log table; the child taps the ONE that is different; a tiny fairy circles it,
it floats up into the garland and lights a flower lantern (4 lanterns = 4 rounds per chapter); the others ring a chime wave,
Moka raises his cup "Cheers!", fairy dust clears the table.

## Stack
- HTML5 canvas + plain JS on `window.FT` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../puppy-farm-parade/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace `FP → FT`, storage prefix `ft:`. The parade world was replaced by a tea-table world.
- Modules by owner (DESIGN §5): mechanics engineer `rng.js` / `content.js` / `world.js` / `weather.js` / `bot.js`
  (+ `MECHANICS.md`, `tests/unit/run.js`, `tests/sim/*`); voice & input engineer `i18n.js` / `voice.js` / `input.js`
  (+ `VOICE.md`, `tests/unit/i18n_voice.test.js`); character artist A `characters/*` / `icon.svg` (`tools/art_moka.py`);
  character artist B `tea_art.js` (`FT.TeaArt`, + `tests/unit/tea_art.test.js`); character artist C `guests/*`
  (`tools/art_guests.py`); environment artist `env/*` / `particles/*` (`tools/art_env.js`, `tools/env_scenes.js` = the env
  RECIPE copied verbatim into `render.js`); **integrator** `storage.js` / `assets.js` / `audio.js` / `render.js` / `ui.js` /
  `main.js` / `index.html` / `style.css` / `manifest.webmanifest` / `tests/e2e/*`.
- Render order (`render.js`): sky → sun → rainbow → clouds → far → mid → ground → trunks → garland + lanterns (+ badge) →
  back particles → snail → table → placemats → sitting things by x → fluffs → critter → Moka → rising things → fairy →
  hint hand → soft-tap sparkles → front particles → fx → banner.
- Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, tea_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` (wins where they differ) the
  world's real API, `FT.CONFIG`, events and render contract, `docs/VOICE.md` the event → line table main.js follows;
  integration decisions in `docs/reports/integration.md`.
- Kid-friendly and original only; no fail states; soft taps, critter taps and Moka taps are never mistakes; a wrong thing
  wiggles "no-no", kind words name what was tapped, then the goal. Exactly one odd thing per round (content self-checks).
  An assisted round gets ≤ 2★.
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round; no pink.
  Moka, the table, moss, critters and the forest never use an answer colour.
- Every text key in both `en` and `vi` with identical `{params}`; the helper is "Moka" (VI titles "Gấu Moka").
- URL test flags never saved; storage prefix `ft:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Speech policy (VOICE §2): prompts protected (`speakPrompt`); the plate count run is queued + protected and never cut; a
  question is repeated only while it can be answered; cheers / lantern / praise lines queue and are droppable.
- The garland ends belong to the world; the renderer slides the trunks so their tie points meet the vine ends.
- Touches reach the world only through `FT.Input` (`down/move/up(x, y, ev)` — two numbers in logical px; HUD, speech
  bubble and menus never reach the canvas). The DOM speech bubble sits exactly at `world.layout.bubble`.
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/tea_art.test.js && node tests/e2e/smoke.js`
  (full: `node tests/e2e/functional.js` — 4 device shapes + 10 bot sessions, ages 3–7 × EN/VI, every tap a real CDP touch;
  playtest sims: `tests/sim/`).
