# Mit's Treasure Map · Cún Mít Ghép Bản Đồ Kho Báu (education game, 2026-11-28)

## Goal
Jigsaw learning game for ages 3–7 (default 4) with Mit the pirate puppy on a pirate-island cove, weather sunny → breezy →
rain → rainbow, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *build* (drag the asked map piece out of the
shallow water into its shadow on the treasure-map parchment: magnet snap + click; the finished picture comes alive, rolls up
into a scroll that flies to Mit; the session ends with a treasure chest rising out of the sand).

## Stack
- HTML5 canvas + plain JS on `window.TM` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../elephant-city-jigsaw/` (Pom's Puzzle Town) with `PZ → TM`, `Pom → Mit`, `pigeon → crab`,
  `toot → woof`, storage prefix `tm:`. `docs/DESIGN.md` §0 lists everything that changed (theme, content ids, floating pieces,
  wash-in, unroll / roll-up, chest, weather moods, voice).
- Art: original SVG from generators in `tools/` (`art_mit.py` → Mit frames, crab, icon; `art_env.js` → cove layers, palms,
  rainbow, particles; `env_scenes.js` = the env RECIPE copied verbatim into `render.js`); canvas art in `game/js/puzzle_art.js`
  (pieces, shadows, parchment boards, water tray, chest, scroll, fish); icons via `tools/render_icons.js`; sheets in `docs/art/`.
- Render order: sky → sun → rainbow → clouds → far (sea, islands, ship) → sea fill → mid → ground → palms (bend with
  `ambient.wind`) → back particles → Mit (+ caught scroll) → board (unroll / roll-up clip + roll) with shadows + placed pieces →
  flying scroll → water tray → floating / flying pieces (+ drips) → crab → fish → bubbles → hint hand → the HELD piece →
  front particles → fx → banner. Done screen: chest (world animates rise / lid, render picks the spot) + gallery.
- Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, puzzle_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`TM.CONFIG`)
  and the render contract (§3), `docs/VOICE.md` the event → line table main.js follows.
- Kid-friendly and original only; no fail states; near misses, taps, drops off the board and soft presses are never
  mistakes; kind words name what was dropped, then the goal. Exactly one matching tray piece per ask (content self-checks).
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- Every text key in both `en` and `vi` with identical `{params}`; the helper is "Mit" (VI "Cún Mít" in titles, "Mít" in lines).
- URL test flags never saved; storage prefix `tm:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Prompts are protected (`speakPrompt` in main.js); the count run is never cut; tapping Mit never restarts a prompt that
  is still being spoken.
- Touches reach the world only through `TM.Input` (`down/move/up(x, y, ev)` — two numbers, never a point object; HUD,
  bubble and menus never reach the canvas). The DOM bubble sits exactly at `world.layout.bubble`.
- `sx/sy` of a piece already include the lift scale; slots and placed pieces are in board-rest coordinates (render applies
  the board transform).
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/puzzle_art.test.js && node tests/e2e/smoke.js`.
