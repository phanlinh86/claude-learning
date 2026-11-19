# Mochi's Icing Bakery · Tiệm Bánh Quy Của Gấu Trúc Mochi (education game, 2026-11-19)

## Goal
Pick-and-trace game for ages 3–7 (default 4) with Mochi the little panda baker at a kitchen counter, seasons seen
through the kitchen window (spring → summer → autumn → winter), EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic
family *trace*: tap an icing bag / a choice cookie, then follow the glowing dotted path with a finger (icing flows under
the finger), tap N chocolate chips, animals walk an icing road home; finished cookies hop onto the cooling rack.
Play: https://phanlinh86.github.io/claude-learning/projects/education-game/panda-bakery-icing/game/

## Stack
- HTML5 canvas + plain JS on `window.IB` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../turtle-sea-paint/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace `IB`, storage prefix `ib:`. New: `trace.js` (paths + forward-only tracking), the trace `world.js`,
  bakery `content.js`, kitchen `weather.js`, `cookie_art.js` (tray, rack, cookies, bags, icing, guide dots, chips).
- Render (`render.js`): env recipe from `tools/env_scenes.js` (`envLayout` / `tileXs` copied verbatim: wall → far window
  tiles → (portrait) an extra cropped window in the freest wall spot above the tray (scored against Mochi / the rack) →
  a per-season wall wash (glass excluded) → light bars → outside particles clipped to all windows → mid props → counter →
  floor → tint; seasons crossfade; in portrait the counter goes just above the choice row; `weather.setWindows` gets every
  visible window so petals / leaves / snow come from it) → rack + rack cookies → sack +
  mouse → tray → home / side / board cookie → tray picture layer (icing, gleam sweep, guide dots, chips, walking animal)
  → choices → bag copy behind Mochi's paw (grip points from `docs/art/mochi_hand.json`) → Mochi → hopping cookie →
  bag front copy (fades out once the bag has settled in the paw, back in when it leaves: no layer pop) → sprinkles → bird → ghost hand → particles → fx → banner.
- Decorated cookies (`ck.icing / chips / sprinkles`, cookie units) go through `renderCk()` in render.js, which scales them
  to the 330 px icing box `CookieArt.drawCookie` expects; glyph cookies with `plain` draw without the emboss.
- Script order: rng, i18n, trace, content, world, weather, bot, storage, assets, audio, voice, input, cookie_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers + events
  (`IB.CONFIG`), `docs/VOICE.md` the event → line table main.js follows.
- Kid-friendly and original only; no fail states; needPick / offPath / traceTap / already are never mistakes; kind words
  name what was tapped, then the goal. Tracing is never wrong.
- Every text key in both `en` and `vi`; the helper is "Mochi" (VI titles "Gấu Trúc Mochi"; TTS says "Mô Chi" in Vietnamese).
- URL test flags never saved; storage prefix `ib:`. Loud audio chain + volume setting (skill rule); all sound synthesized
  (the icing squeeze follows `world.flowing`, pitch by trace progress).
- Prompts are protected: the guard in `speakPrompt` (main.js) lasts until the prompt has actually been spoken; feedback
  may interrupt, praise / hints / counts queue, praise is skipped when one started < 1.2 s ago.
- Touches reach the world only through `IB.Input` (HUD, bubble and menus never reach the canvas); every coalesced move
  goes to `world.pointerMove`; rotation / pause / Talk cancel the press (the trace keeps its progress).
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/cookie_art.test.js && node tests/e2e/smoke.js && node tests/e2e/functional.js`;
  screenshots `node tests/visual/screens.js` (dpr 1 JPEG; look at them); QA probe `node tests/e2e/qa_functional.js`.
