# Tumi's Flower Farm · Nông Trại Hoa Của Rùa Tumi (education game, 2026-11-25)

## Goal
Pick-and-trace game for ages 3–7 (default 4) with Tumi the baby turtle growing a flower garden on a sunny farm (seasons
spring → summer → autumn → winter outdoors), EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *trace*: tap a
seed packet / a wooden garden sign, then follow the glowing dotted path with a finger (a watering can rides under the
finger, plants grow behind it: sprout → bud → flower), tap N carrots up, animals walk a pebble path home; a finished bed
blooms and a prize rosette hops onto the fence.
Play: https://phanlinh86.github.io/claude-learning/projects/education-game/turtle-farm-garden/game/

## Stack
- HTML5 canvas + plain JS on `window.FT` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../panda-bakery-icing/` (the bakery contract is kept in `docs/bakery_ref/`). **Internal names are
  kept on purpose**: `tray` = garden bed, `cookie/ck` = sign / bed patch, `bag` = seed packet (choice) / watering can
  (tool), `icing` = planted rows, `chips` = carrots, `sprinkles` = petals, `rack` = fence + rosettes, `bird` = butterfly,
  `sack` + `mouse` = hay bale + chick, `mochi` = Tumi. See `docs/DESIGN.md` §1.
- Art: `farm_art.js` (`FT.FarmArt`, alias `FT.CookieArt`; `opt.look` 'sign' | 'bed' | 'walker' | 'badge'), SVG characters
  from `tools/art_tumi.py`, env from `tools/art_env.js`; `render.js` copies `envLayout` / `tileXs` verbatim from
  `tools/env_scenes.js` (sky → rays → far → mid → meadow → ground → floor → tint; seasons crossfade).
- Script order: rng, i18n, trace, content, world, weather, bot, storage, assets, audio, voice, input, farm_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers + events
  (`FT.CONFIG`), `docs/VOICE.md` the event → line table main.js follows.
- Kid-friendly and original only; no fail states; needPick / offPath / traceTap / already are never mistakes. Tracing is
  never wrong.
- Every text key in both `en` and `vi`; the helper is "Tumi" (VI titles "Rùa Tumi"; TTS says "Tu Mi" in Vietnamese).
- URL test flags never saved; storage prefix `ft:`. Loud audio chain + volume setting (skill rule); all sound synthesized
  (the water trickle follows `world.flowing`, pitch by trace progress).
- Touches reach the world only through `FT.Input`; rotation / pause / Talk cancel the press (the trace keeps its progress).
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/farm_art.test.js && node tests/e2e/smoke.js && node tests/e2e/functional.js`;
  screenshots `node tests/visual/screens.js` (dpr 1 JPEG; look at them); QA probe `node tests/e2e/qa_functional.js`.
