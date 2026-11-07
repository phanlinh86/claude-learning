# Nini's Sea Painting · Rùa Nini Tô Màu Đại Dương (education game, 2026-11-07)

## Goal
Tap-to-paint game for ages 3–7 (default 4) with Nini the baby sea turtle painter on the seabed, seasons seen through the
water (spring → summer → autumn → winter), EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *trace* (tap a
paint shell, tap a part of a line drawing; the colour fills inside its lines; the finished picture comes alive).

## Stack
- HTML5 canvas + plain JS on `window.SP` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../owl-toy-train/` (state machine, voice, input, storage, loud audio with volume, ui, main, tests),
  namespace `SP`, storage prefix `sp:`. New: the paint world (`world.js`: shells, brush flights with dip / dab, fills from
  the tap point, wobble springs, finish sweep, alive motions swim / scuttle / sail / bob / float, fishy + pearl surprises),
  `pictures.js` (line-drawing templates as SVG path data + hit shapes), `paint_art.js` (canvas, shell frame, paint shells,
  brush, splash, Talk icons, ghost hand), sea `content.js`, seasonal `weather.js`.
- Render (`render.js`): env recipe from `tools/env_scenes.js` (water gradient → rays → far → mid → ground + sand fill →
  caustic → surface, seasons crossfade), clam → Nini (mood frames, blink, talk flaps, bob) → canvas frame → picture (w.pic
  transform about its bottom-centre) → shells → splats → fishy → brush (in Nini's flipper at rest, grip points from
  `docs/art/nini_hand.json`) → hint hand → particles. Title: Nini waving + a painted fish; done: the session gallery.
- Script order: rng, i18n, pictures, content, world, weather, bot, storage, assets, audio, voice, input, paint_art, render, ui, main.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real CDP touch taps), `tests/sim`
  (headless playtests), `tests/visual/screens.js` (screenshots).

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`SP.CONFIG`),
  `docs/VOICE.md` the event → line table main.js follows.
- Kid-friendly and original only; no fail states; needPaint / notThis / already are never mistakes; kind words name what
  was tapped, then the goal.
- Every text key in both `en` and `vi`; the helper is "Nini" (VI titles "Rùa Nini"; TTS says "Ni Ni" in Vietnamese).
- URL test flags never saved; storage prefix `sp:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Prompts are protected: the guard in `speakPrompt` (main.js) lasts until the prompt has actually been spoken; feedback
  may interrupt, praise / hints queue, praise is skipped when one started < 1.2 s ago.
- Taps reach the world only through `SP.Input` (HUD, bubble and menus never reach the canvas).
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/pictures.test.js && node tests/e2e/smoke.js`.
