# Mimi's Splash Rocket · Tên Lửa Nước Của Vịt Mimi (education game, 2026-11-22)

## Goal
Rocket-launch learning game for ages 3–7 (default 4) with Mimi the fluffy duckling at a mountain campsite, sunny → breezy →
rain → rainbow, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family *path*: 2–3 picnic mats unfold on a meadow; the
child taps the ONE right mat, then pumps ×3 (any tap); the water-bottle rocket whooshes up on a spray, pops its parachute
at the apex and sways down onto the mat; the mat's thing flies up the camp flagpole as a pennant (collected in order); the
camp counts the pennants and the rocket shoots a fountain with a little rainbow; a weather sweep wipes the round.

## Stack
- HTML5 canvas + plain JS on `window.DK` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../hedgehog-river-hop/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace `NH → DK`, storage prefix `dk:`. The river world was replaced by a rocket-launch meadow.
- Modules by owner (DESIGN §5): mechanics engineer `rng.js` / `content.js` / `world.js` / `weather.js` / `bot.js`
  (+ `MECHANICS.md`, `tests/unit/run.js`, `tests/sim/*`); voice & input engineer `i18n.js` / `voice.js` / `input.js`
  (+ `VOICE.md`, `tests/unit/i18n_voice.test.js`); character artist A `characters/*` / `icon.svg` / `mimi_points.js`
  (`tools/art_mimi.py`); character artist B `mat_art.js` (`DK.MatArt`, + `tests/unit/mat_art.test.js`); environment
  artist `env/*` / `particles/*` / `meadow_art.js` (`DK.MeadowArt`, `tools/art_env.js`, `tools/env_scenes.js` = the env
  RECIPE copied verbatim into `render.js`); **integrator** `storage.js` / `assets.js` / `audio.js` / `render.js` / `ui.js` /
  `main.js` / `index.html` / `style.css` / `manifest.webmanifest` / `tests/e2e/*`.
- Render order (`render.js`): sky → sun → rainbow → clouds → far → mid (mood crossfade) → back particles → meadow + camp
  props (MeadowArt) → puddle rings → burrow + marmot, rock + goat → pole + pennants (+ bird) → mats back-to-front by y (mat →
  thing, home badges) → flying thing → aim arc → pad + pump → Mimi → rocket + chute (in flight: after the water) → drops →
  fountain → hint hand → front particles → fx → wipe → banner.
- Script order: rng, i18n, content, mimi_points, world, weather, bot, storage, assets, audio, voice, input, mat_art,
  meadow_art, render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` (wins where they differ) the
  world's real API, `DK.CONFIG`, events and render contract, `docs/VOICE.md` the event → line table main.js follows;
  integration decisions in `docs/reports/integration.md`.
- Kid-friendly and original only; no fail states; soft taps, surprise taps and Mimi taps are never mistakes; a wrong mat
  ripples, kind words name what was tapped, then the goal. Exactly one target per launch (content self-checks). An assisted
  round gets ≤ 2★. Nobody is ever stuck at the pump (Mimi pumps by herself after 3 s).
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round; no pink.
  Mimi (cream + peach), the meadow, tents and mats never use an answer colour.
- Every text key in both `en` and `vi` with identical `{params}`; the helper is "Mimi" (VI titles "Vịt Mimi").
- URL test flags never saved; storage prefix `dk:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Speech policy (VOICE §3): prompts and `next` reminders protected (`speakPrompt`); stomps only through `Voice.sayPump`
  (merged, never cut, "Blast off!" with the 3rd); count lines (countSel collect, camp) ONE line each, queued + never cut; the
  pennant line is the launch's praise; `unfold` / `chute` / `land` / `wipe` / surprises rare and droppable;
  `weather.windSource = world`.
- Touches reach the world only through `DK.Input` (`down/move/up(x, y, ev)` — two numbers in logical px; HUD, speech bubble
  and menus never reach the canvas); `rapidTaps` in the pump phase (an extra finger = a new stomp). The DOM speech bubble
  sits exactly at `world.layout.bubble`; it (and the HUD) steps back while the rocket's canopy floats under it.
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/mat_art.test.js && node tests/e2e/smoke.js`
  (full: `node tests/e2e/functional.js` — 4 device shapes + 10 bot sessions, ages 3–7 × EN/VI, every tap a real CDP touch;
  visual QA: `node tests/e2e/screens.js`; playtest sims: `tests/sim/`).
