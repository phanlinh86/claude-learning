# Kiki's Camp Chimes · Chuông Gió Lửa Trại Của Khỉ Kiki (education game, 2026-11-10)

## Goal
Wind-chime music learning game for ages 3–7 (default 4) with Kiki the little monkey at a mountain campsite, morning →
noon → sunset → starry night, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *music* (tap / swipe the asked
hanging chime: it swings like a pendulum and rings; a right note lights a lantern; then one swipe plays the song cascade).

## Stack
- HTML5 canvas + plain JS on `window.CC` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../elephant-city-jigsaw/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace `CC`, storage prefix `cc:`. New: the chime world (`world.js`: per-round layout from the real chime
  count, damped pendulums with body spin + breeze, springy drop-in, first-core-judged gestures (rim/gap only brushes),
  notes flying to lanterns, counting strings, song cascade, hedgehog / bird / firefly surprises), chime `content.js`,
  `chime_art.js` (bells, plates, bell strings, dot plates, animal / glyph chimes, beam, garland, fire, notes, icons, ghost
  hand — all canvas code), day-cycle `weather.js`.
- Art: original SVG from generators in `tools/` (`art_kiki.py` → Kiki frames, hedgehog, bird, icon; `art_env.js` → camp
  layers + particles; `env_scenes.js` = the env RECIPE copied verbatim into `render.js`); icons via `tools/render_icons.js`;
  contact sheets in `docs/art/` (`tools/kiki_sheet.js`, `tools/chime_sheet.js`).
- Render order: sky → stars → sun / moon → clouds → far → mid → ground → back particles → fire → Kiki → posts + beam →
  garland + lanterns → cords + chimes → notes → surprises → hint hand → front particles → fx → banner.
- Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, chime_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`CC.CONFIG`),
  events and render contract, `docs/VOICE.md` the event → line table main.js follows.
- Kid-friendly and original only; no fail states; brushes, soft taps and beam presses are never mistakes; kind words name
  what was rung, then the goal. Exactly one matching chime per ask (content self-checks). An assisted round gets ≤ 2★.
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- Every text key in both `en` and `vi` with identical `{params}`; the helper is "Kiki" (VI titles "Khỉ Kiki").
- URL test flags never saved; storage prefix `cc:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Prompts are protected (`speakPrompt` in main.js); the count run is never cut; the long song ask once per chapter, then
  `songShort`; no line after the cascade.
- Touches reach the world only through `CC.Input` (`down/move/up(x, y, ev)` — two numbers; HUD, bubble and menus never
  reach the canvas). The DOM bubble sits exactly at `world.layout.bubble` (no tail in portrait).
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/chime_art.test.js && node tests/e2e/smoke.js`
  (full: `node tests/e2e/functional.js`).
