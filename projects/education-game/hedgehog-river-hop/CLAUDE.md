# Nim's River Hop · Nhím Nim Nhảy Đá Qua Suối (education game, 2026-11-15)

## Goal
Stepping-stone learning game for ages 3–7 (default 4) with Nim the little hedgehog crossing a woodland brook through
spring → summer → autumn → winter, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *path*: 2–4 rows of 2–3
stones rise out of the brook; the child taps the ONE right stone of the next row; Nim hops (ballistic arc), the stone dips,
ripples and turns golden; on the far bank Nim curls up, rolls over a fruit and it sticks on his spines; a seasonal swirl
wipes the crossing.

## Stack
- HTML5 canvas + plain JS on `window.NH` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../panda-bubble-sky/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace `PB → NH`, storage prefix `nh:`. The bubble world was replaced by a river-crossing world.
- Modules by owner (DESIGN §5): mechanics engineer `rng.js` / `content.js` / `world.js` / `weather.js` / `bot.js`
  (+ `MECHANICS.md`, `tests/unit/run.js`, `tests/sim/*`); voice & input engineer `i18n.js` / `voice.js` / `input.js`
  (+ `VOICE.md`, `tests/unit/i18n_voice.test.js`); character artist A `characters/*` / `icon.svg` / `nim_points.js`
  (`tools/art_nim.py`); character artist B `stone_art.js` (`NH.StoneArt`, + `tests/unit/stone_art.test.js`); environment
  artist `env/*` / `particles/*` / `river_art.js` (`NH.RiverArt`, `tools/art_env.js`, `tools/env_scenes.js` = the env RECIPE
  copied verbatim into `render.js`); **integrator** `storage.js` / `assets.js` / `audio.js` / `render.js` / `ui.js` /
  `main.js` / `index.html` / `style.css` / `manifest.webmanifest` / `tests/e2e/*`.
- Render order (`render.js`): sky → sun → clouds → far → mid (season crossfade) → river → ripples + floating leaves + fish
  shadow → banks (cached bitmap per season) → flying back particles → waiting fruit → stones back-to-front by y with Nim
  inserted after his stone → frog → fish → counted / badge things → sticking fruit → drops → snowflakes → hint hand → wipe
  curtain → front particles → fx → banner.
- Script order: rng, i18n, content, nim_points, world, weather, bot, storage, assets, audio, voice, input, stone_art,
  river_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` (wins where they differ) the
  world's real API, `NH.CONFIG`, events and render contract, `docs/VOICE.md` the event → line table main.js follows;
  integration decisions in `docs/reports/integration.md`.
- Kid-friendly and original only; no fail states; soft taps, ahead taps, surprises and Nim taps are never mistakes; a wrong
  stone wobbles, Nim never falls in; kind words name what was tapped, then the goal. Exactly one target per row (content
  self-checks). An assisted round gets ≤ 2★.
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round; no pink.
  Water / banks / Nim's scarf never use an answer colour.
- Every text key in both `en` and `vi` with identical `{params}`; the helper is "Nim" (VI titles "Nhím Nim").
- URL test flags never saved; storage prefix `nh:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Speech policy (VOICE §1.1): prompts protected (`speakPrompt`); countSeq numbers and the countSel run are queued + protected
  and never cut; a question is repeated only while it can be answered; `stick` → `sayFruit` is the round's praise; "One at a
  time!" ≤ once per 6 s; `weather.windSource = world`.
- Touches reach the world only through `NH.Input` (`down/move/up(x, y, ev)` — two numbers in logical px; HUD, speech bubble
  and menus never reach the canvas). The DOM speech bubble sits exactly at `world.layout.bubble`.
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/stone_art.test.js && node tests/e2e/smoke.js`
  (full: `node tests/e2e/functional.js` — 4 device shapes + 10 bot sessions, ages 3–7 × EN/VI, every tap a real CDP touch;
  visual QA: `node tests/e2e/screens.js`; playtest sims: `tests/sim/`).
