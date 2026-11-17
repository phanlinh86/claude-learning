# Tibo's Dino Lake Fishing · Rùa Tibo Câu Cá Hồ Khủng Long (education game, 2026-11-17)

## Goal
Fishing learning game for ages 3–7 (default 4) at a lake in a friendly dinosaur valley with Tibo the baby turtle,
morning → noon → sunset → starry night, EN/VI voice. Requirement: `REQUIREMENT.md`. Fish swim back and forth in lanes; the
child taps the ONE fish Tibo asks for; the line flies out (ballistic), plop, bite, the rod bends, the fish is reeled up and
swings on the line (pendulum), then it is released with a leap and a water lily blooms (4 lilies = 4 rounds per chapter);
the other fish jump for joy and swim off.

## Stack
- HTML5 canvas + plain JS on `window.TL` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Shell copied from `../bear-fairy-tea/` (state machine, voice, input, storage, loud audio with volume, ui, main, tests),
  namespace `FT → TL`, storage prefix `tl:`. World, content, art, render and sounds are new.
- Modules by owner (DESIGN §5): mechanics engineer `rng.js` / `content.js` / `world.js` / `weather.js` / `bot.js`
  (+ `MECHANICS.md`, `tests/unit/run.js`, `tests/sim/*`); voice & input engineer `i18n.js` / `voice.js` / `input.js`
  (+ `VOICE.md`, `tests/unit/i18n_voice.test.js`); character artist A `characters/*` / `icon.svg` (`tools/art_tibo.py`);
  character artist B `fish_art.js` (`TL.FishArt`, + `tests/unit/fish_art.test.js`); guests reused from the tea party
  (`tools/art_guests.py`); environment artist `env/*` / `particles/*` (`tools/art_env.js`, `tools/env_scenes.js` = the env
  RECIPE pasted into `render.js`); **integrator** `storage.js` / `assets.js` / `audio.js` / `render.js` / `ui.js` /
  `main.js` / `index.html` / `style.css` / `manifest.webmanifest` / `tests/e2e/*`.
- Render order (`render.js`): sky → stars → sun / moon → clouds → smoke → far → mid → mist → reeds → water → lake bed →
  weed → water particles + bubbles → fish under water → ripples → lilies (+ frog) → surface front → bronto → rock → Tibo →
  rod + line + hook → fish above water → splashes → badge → back particles → ptero / fireflies → hint hand → fx → banner.
- Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, fish_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` (wins where they differ) the
  world's real API, `TL.CONFIG`, events and render contract, `docs/VOICE.md` the event → line table main.js follows.
- Kid-friendly and original only; no fail states; water taps, critter taps and Tibo taps are never mistakes; a wrong fish
  darts away with bubbles, kind words name what was tapped, then the goal. Exactly one target per round (content
  self-checks). An assisted round gets 1★.
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round; no pink.
  Tibo, the rock, critters and the valley never use an answer colour; fish are never darkened at night.
- Every text key in both `en` and `vi` with identical `{params}`; the helper is "Tibo" (VI titles "Rùa Tibo", TTS "Ti Bô").
- URL test flags never saved; storage prefix `tl:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Touches reach the world only through `TL.Input` (`down/move/up(x, y)` in logical px); the DOM bubble sits exactly at
  `world.layout.bubble` and fades in landscape while the line flies over the lake.
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/fish_art.test.js && node tests/e2e/smoke.js`
  (full: `node tests/e2e/functional.js` — 4 device shapes + 10 bot sessions, every tap a real touch on a moving fish;
  playtest sims: `tests/sim/`).
