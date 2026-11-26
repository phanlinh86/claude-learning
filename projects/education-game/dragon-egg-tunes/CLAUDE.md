# Rio's Cloud Eggs · Trống Mây Của Cún Rio (education game, 2026-11-21)

## Goal
Cloud-egg music learning game for ages 3–7 (default 4) with Rio the apricot puppy in a rainbow cloud land, morning →
noon → sunset → starry night, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *music*: tap the asked egg (it
squashes, hops off its cloud cushion, lands, its skin ripples); a right note lights a star lantern; counting at ages ≤ 4 =
beat the big egg N times; then the song wave + cymbal crash.

## Stack
- HTML5 canvas + plain JS on `window.SE` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../monkey-camp-chimes/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace `SE`, storage prefix `se:`. New: the egg world (`world.js`: pads at staggered heights / zig-zag,
  egg bounce physics — anticipation squash, hop, landing squash + cushion dent, skin ripple, tilt —, beat steps with a
  number card, core-judged gestures (rims only brush), notes flying to star lanterns, song wave + cymbal, lamb / bird /
  twinkle-star surprises), egg `content.js`, `egg_art.js` (eggs of every kind, cushions, garland, cymbal, card, notes,
  icons, ghost hand — all canvas code), day-cycle `weather.js`.
- Art: original SVG from generators in `tools/` (`art_rio.py` → Rio frames, lamb, bird, icon; `art_env.js` → cloud-land
  layers + particles; `env_scenes.js` = the env RECIPE mirrored in the tables at the top of `render.js`); icons via
  `tools/render_icons.js`; contact sheets in `docs/art/` (`tools/rio_sheet.js`, `tools/egg_sheet.js`).
- Render order: sky → stars → sun / moon → clouds → far → mid → ground → back particles → cymbal → Rio → garland +
  lanterns → cushions → eggs → card → notes → surprises → hint hand → front particles → fx → banner.
- Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, egg_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`SE.CONFIG`),
  events and render contract, `docs/VOICE.md` the event → line table main.js follows.
- Kid-friendly and original only; no fail states; brushes, soft taps, cymbal taps and stage presses are never mistakes; kind
  words name what was tapped, then the goal. Exactly one matching egg per ask (content self-checks). Beat steps can't be
  wrong. An assisted round gets ≤ 2★.
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- Every text key in both `en` and `vi` with identical `{params}`; the helper is "Rio" (VI titles "Cún Rio").
- URL test flags never saved; storage prefix `se:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Prompts are protected (`speakPrompt` in main.js) — except beat counts, which interrupt (the child is already eggming); the
  beat prompt says the number first; the long song ask once per session, then `songShort`; a stale song ask is dropped once
  the song starts; no line after the cymbal.
- Touches reach the world only through `SE.Input` (`down/move/up(x, y, ev)` — two numbers; HUD, bubble and menus never
  reach the canvas). The DOM bubble sits exactly at `world.layout.bubble`.
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/egg_art.test.js && node tests/e2e/smoke.js`
  (full: `node tests/e2e/functional.js`).
