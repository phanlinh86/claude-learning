# Pom's Puzzle Town · Voi Pom Ghép Hình (education game, 2026-11-09)

## Goal
Jigsaw learning game for ages 3–7 (default 4) with Pom the baby elephant on a little town street, spring → summer →
autumn → winter, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *build* (drag the asked piece from the tray
into its shadow on the picture board: magnet snap + click; the finished picture comes alive, then turns like a page).

## Stack
- HTML5 canvas + plain JS on `window.PZ` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../bunny-dino-dig/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace `PZ`, storage prefix `pz:`. New: the jigsaw world (`world.js`: board / tray layout for any aspect,
  spring-follow drag with pendulum tilt, magnet snap, near miss, wrong shake + arc home, counting, alive phase, page turn,
  pigeon / bubble surprises), jigsaw `content.js`, `puzzle_art.js` (pieces, exact-silhouette shadows, boards, tray,
  bubbles, Talk icons, ghost hand — all canvas code), season `weather.js`.
- Art: original SVG from generators in `tools/` (`art_pom.py` → Pom frames, pigeon, icon; `art_env.js` → town layers +
  particles; `env_scenes.js` = the env RECIPE copied verbatim into `render.js`); icons via `tools/render_icons.js`;
  contact sheets in `docs/art/` (`tools/pom_sheet.js`, `tools/puzzle_sheet.js`).
- Render order: sky → sun → clouds → far (+ clock hands) → mid → ground → back particles → Pom → board (transform:
  ox/jig, tilt, page turn) with shadows + placed pieces → tray shelves (one per row) → resting / flying pieces → pigeon →
  bubbles → hint hand → the HELD piece → front particles → fx → banner.
- Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, puzzle_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`PZ.CONFIG`)
  and the render contract (§3), `docs/VOICE.md` the event → line table main.js follows.
- Kid-friendly and original only; no fail states; near misses, taps, drops off the board and soft presses are never
  mistakes; kind words name what was dropped, then the goal. Exactly one matching tray piece per ask (content self-checks).
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- Every text key in both `en` and `vi` with identical `{params}`; the helper is "Pom" (VI titles "Voi Pom").
- URL test flags never saved; storage prefix `pz:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Prompts are protected (`speakPrompt` in main.js); the count run is never cut; tapping Pom never restarts a prompt that
  is still being spoken.
- Touches reach the world only through `PZ.Input` (`down/move/up(x, y, ev)` — two numbers, never a point object; HUD,
  bubble and menus never reach the canvas). The DOM bubble sits exactly at `world.layout.bubble`.
- `sx/sy` of a piece already include the lift scale; slots and placed pieces are in board-rest coordinates (render applies
  the board transform).
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/puzzle_art.test.js && node tests/e2e/smoke.js`.
