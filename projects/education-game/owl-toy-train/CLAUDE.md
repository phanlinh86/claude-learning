# Momo's Toy Train · Chuyến Tàu Đồ Chơi Của Cú Momo (education game, 2026-11-06)

## Goal
Drag-and-load train game for ages 3–7 (default 4) with Momo the little owl in a toy room, morning → noon → sunset →
starry night, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *container* (train ride: load the right cargo),
rolled with the variety rule; swap: theme mountain camping → toy room (a campsite was used on 2026-11-03).

## Stack
- HTML5 canvas + plain JS on `window.TT` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../frog-rainy-band/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace → `TT`, storage prefix `tt:`. New: the train world (`world.js`: cargo with spring-follow drag,
  tap-vs-drop, drop zones, ballistic arc into car slots, wrong-car shake + boing home, count cars, arrive with braking,
  springy couplings, whistle phase (nudge 6 s / auto 12 s), depart with jolt and bouncing cargo, hitch bunny and balloon
  surprises), train `content.js`, `train_art.js` (engine / cars / couplings / cargo / tunnel drawn by code), time-of-day
  `weather.js` (motes, bubbles, feathers, night-light stars, steam puffs).
- Render: env layers composed with the recipe in `tools/env_scenes.js` (wall + window sky, far / ground 5-slice / mid);
  draw order tunnel back → engine back → Momo → engine front → per car back → cargo → front → tunnel front.
- Art: original SVG from generators in `tools/` (`art_momo.py`, `art_animals.py`, `art_env.js`); icons via
  `tools/render_icons.js`; contact sheets in `docs/art/`.
- Tests: `tests/unit` (node), `tests/e2e` (Playwright smoke + functional with real CDP touch drags), `tests/sim`
  (headless playtests), `tests/visual`.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`TT.CONFIG`).
- Kid-friendly and original only; no fail states; every toy has exactly one right car (count: any car with room).
- Every text key in both `en` and `vi`; the helper is "Momo" (VI titles "Cú Momo"; TTS says "Mô Mô" in Vietnamese).
- URL test flags never saved; storage prefix `tt:`. Loud audio chain + volume setting (skill rule).
- Prompts are protected: the guard in `speakPrompt` (main.js) lasts until the prompt has actually been spoken.
- The room layout (env recipe) is fixed per viewport so it never jumps between trains.
