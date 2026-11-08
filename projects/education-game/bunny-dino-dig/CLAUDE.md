# Bun's Dino Dig · Thỏ Bun Đào Kho Báu (education game, 2026-11-08)

## Goal
Treasure-dig learning game for ages 3–7 (default 4) with Bun the bunny explorer in Dinosaur Valley, morning → noon →
sunset → starry night, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *seek* (tap a sand mound to dig:
each tap is a shovel scoop; the thing pops out; a right egg hatches a baby dino; finds hop onto the treasure shelf).

## Stack
- HTML5 canvas + plain JS on `window.DD` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../turtle-sea-paint/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace `DD`, storage prefix `dd:`. New: the dig world (`world.js`: mound layout for any aspect, scoops with
  queued / auto scoops, ballistic sand, reveal spring, hatch, ballistic hop to the shelf, wrong wiggle + sink, mole /
  pterosaur surprises), dig `content.js`, `dig_art.js` (eggs, shape stones, bones, toy animals, tablets, mounds, shovel,
  shelf, Talk icons, ghost hand — all canvas code), time-of-day `weather.js`.
- Art: original SVG from generators in `tools/` (`art_bun.py` → Bun, mole, pterosaur, baby dinos, icon; `art_env.js` →
  valley layers + particles; `env_scenes.js` = the env RECIPE copied into `render.js`); icons via `tools/render_icons.js`;
  contact sheets in `docs/art/` (`tools/bun_sheet.js`, `tools/dig_sheet.js`).
- Render order: sky → sun/moon → clouds → volcano smoke → far → mid → ground → shelf + finds → back mounds → mole → Bun →
  front mounds (hole back → clipped thing → pile) → risen things → lantern glow (night) → egg shells → sand → shovel →
  flying finds → pterosaur → hint hand → particles → fx → banner.
- Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, dig_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`DD.CONFIG`),
  `docs/VOICE.md` the event → line table main.js follows.
- Kid-friendly and original only; no fail states; already / busy / sand taps are never mistakes; kind words name what
  was dug, then the goal. Exactly one matching mound per find ask (content self-checks).
- Colour pairs: below age 5 never blue+purple, red+green, yellow+orange, green+orange, red+orange; at night never
  red+pink, blue+purple, red+orange.
- Every text key in both `en` and `vi`; the helper is "Bun" (VI titles "Thỏ Bun").
- URL test flags never saved; storage prefix `dd:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Prompts are protected (`speakPrompt` in main.js); tapping Bun never restarts a prompt that is still being spoken.
- Taps reach the world only through `DD.Input` (HUD, bubble and menus never reach the canvas). The DOM bubble sits
  exactly at `world.layout.bubble` (the world moves it beside / below the measured HUD via `hudKeep`).
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/dig_art.test.js && node tests/e2e/smoke.js`.
