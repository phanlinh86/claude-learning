# Bo's Farm Parade · Cún Bo Tìm Bạn Lạc Đàn (education game, 2026-11-12)

## Goal
Odd-one-out learning game for ages 3–7 (default 4) with Bo the little caramel puppy on a sunny farm, morning → noon →
sunset → starry night, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *seek* (a parade of 3–5 members marches
along a farm path; tap / flick the ONE that is different: it boings onto a hay-bale stage; tap the barn doors; the others
march into the barn in step).

## Stack
- HTML5 canvas + plain JS on `window.FP` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../monkey-camp-chimes/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace `FP`, storage prefix `fp:`. New: the parade world (`world.js`: per-round layout from the real member
  count, spring walking with step cycles + squash + lean, ballistic hop onto the stage, gap closing, apple counting, home
  badge, gate with auto-open, synchronised march into the barn with doorway clipping, chick / rooster / firefly surprises),
  parade `content.js` (self-checking odd-one-out rounds per topic / age), `parade_art.js` (wagons, objects, blocks, crates,
  sign tiles, animal sprites, stage, home badges, Talk icons, ghost hand, dust — canvas code), day-cycle `weather.js`.
- Art: original SVG from generators in `tools/` (`art_bo.py` → Bo frames, chick, rooster, icon; `art_animals.py` → 12
  animals × 2 step frames; `art_env.js` → farm layers, barn, doors, vane, particles; `env_scenes.js` = the env RECIPE copied
  verbatim into `render.js`); icons via `tools/render_icons.js`; contact sheets in `docs/art/`.
- Render order: sky → stars → sun / moon → clouds → far → mid → rooster → ground → path band → back particles → barn back +
  doors + vane → stage + home badge → member shadows → members (marchers clipped to the doorway) → Bo → chick → fireflies →
  dust puffs → hint hand → front particles → fx → banner.
- Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, parade_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`FP.CONFIG`),
  events and render contract, `docs/VOICE.md` the event → line table main.js follows; integration decisions in
  `docs/reports/integration.md`.
- Kid-friendly and original only; no fail states; soft taps, surprises and Bo taps are never mistakes; kind words name
  what was tapped, say it matches its friends, then the goal. Exactly one odd member per round (content self-checks). An
  assisted round gets ≤ 2★.
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- Every text key in both `en` and `vi` with identical `{params}`; the helper is "Bo" (VI titles "Cún Bo").
- URL test flags never saved; storage prefix `fp:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Prompts are protected (`speakPrompt` in main.js); the count run is never cut; a question is repeated only while
  `world.interactive` (Bo / bubble taps in enter / hop just giggle when nothing speaks); the long `.first` question only in a
  chapter's round 0; the gate is spoken only in chapter 1; one praise at the parade only after a miss or in round 3; no march line.
- Touches reach the world only through `FP.Input` (`down/move/up(x, y, ev)` — two numbers; HUD, bubble and menus never
  reach the canvas). The DOM bubble sits exactly at `world.layout.bubble` (no tail in portrait).
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/parade_art.test.js && node tests/e2e/smoke.js`
  (full: `node tests/e2e/functional.js`; visual: `node tests/visual/screens.js`).
