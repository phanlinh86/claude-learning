# Nuka's Snow Dig · Gấu Nuka Đào Tuyết (education game, 2026-11-23)

## Goal
Snow-dig learning game for ages 3–7 (default 4) with Nuka the polar-bear cub on an arctic snowfield, spring → summer →
autumn → winter, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *seek* (rub — or tap — a snow drift: each
rub stroke is a paw scoop; the thing pops out; a right find twirls and floats up into the aurora ribbon; round end = the
aurora ripples and Nuka belly-slides).

## Stack
- HTML5 canvas + plain JS on `window.NK` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../bunny-dino-dig/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  dig world, tests) with `DD → NK`, `dd: → nk:`, `mole → seal`, `ptero → tern`. New: the rub gesture (`world.js`
  pointerMove strokes), hat twirl instead of the hatch, float-up to the aurora with a trail, rise-and-fade chapter end,
  belly-slide in `cheer`, arctic `content.js` (hats, ice gems, fish, plush arctic animals, ice blocks), `dig_art.js`
  (snow drifts, paw, aurora ribbon), seasonal `weather.js`, the sky aurora in `render.js`.
- Art: original SVG from generators in `tools/` (`art_nuka.py` → Nuka, seal, tern, icon; `art_env.js` → arctic layers
  + particles; `env_scenes.js` = the env RECIPE copied into `render.js`); icons via `tools/render_icons.js`; contact
  sheets in `docs/art/` (`tools/nuka_sheet.js`, `tools/dig_sheet.js`).
- Render order: sky → sky aurora → sun/moon → clouds → far → mid → ground → aurora ribbon + finds → back drifts → seal →
  Nuka (after the front row while sliding) → front drifts (hole back → clipped thing → drift) → risen things → winter
  moonlight → snow clumps → paw → float trails → flying finds → tern → hint hand → particles → fx → banner.
- Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, dig_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers
  (`NK.CONFIG`), `docs/VOICE.md` the event → line table main.js follows.
- Kid-friendly and original only; no fail states; already / busy / snow taps / rubs on empty snow are never mistakes;
  a press that rubbed is never a tap or a soft; kind words name what was dug, then the goal. Exactly one matching
  drift per find ask (content self-checks).
- Colour pairs: below age 5 never blue+purple, red+green, yellow+orange, green+orange, red+orange; at night never
  red+pink, blue+purple, red+orange. Nuka, snow, the paw and the fish never use an answer colour.
- Every text key in both `en` and `vi`; the helper is "Nuka" (VI titles "Gấu Nuka"; VI TTS reads "Nu Ca").
- URL test flags never saved; storage prefix `nk:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Prompts are protected (`speakPrompt` in main.js); tapping Nuka never restarts a prompt that is still being spoken.
- Taps and rub moves reach the world only through `NK.Input` (HUD, bubble and menus never reach the canvas).
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/dig_art.test.js && node tests/e2e/smoke.js`.
