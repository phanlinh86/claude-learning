# Bao's Bubble Sky · Gấu Trúc Bảo Thổi Bong Bóng (education game, 2026-11-13)

## Goal
Bubble-popping learning game for ages 3–7 (default 4) with Bao the little panda on a cloud with a bubble wand, through
spring → summer → autumn → winter in a rainbow cloud land, EN/VI voice. Requirement: `REQUIREMENT.md`. Mechanic family
*pop* (Bao blows a field of floating soap bubbles; tap the bubble(s) with the thing asked — 1 to 3 per round; each right
pop frees the thing and it paints a piece of a rainbow; the finished rainbow shimmers, then Bao's whoosh blows the leftovers
away).

## Stack
- HTML5 canvas + plain JS on `window.PB` in `game/` (classic scripts, no build step; GitHub Pages serves it as is).
- Started as a copy of `../puppy-farm-parade/` (state machine, voice, input, storage, loud audio with volume, ui, main,
  tests), namespace `FP → PB`, storage prefix `fp: → pb:`. The parade world was replaced by a floating-bubble world.
- Modules by owner (DESIGN §5): mechanics engineer `world.js` / `content.js` / `weather.js` / `bot.js` / `rng.js`
  (+ `MECHANICS.md`, `tests/unit/run.js`, `tests/sim/*`); voice & input engineer `i18n.js` / `voice.js` / `input.js`
  (+ `VOICE.md`, `tests/unit/i18n_voice.test.js`); character artist B `bubble_art.js` (+ `tests/unit/bubble_art.test.js`);
  character artist A `characters/*` / `icon.svg` / `bao_points.js`; environment artist `env/*` / `particles/*` /
  `tools/env_scenes.js`; **integrator** `storage.js` / `assets.js` / `audio.js` / `render.js` / `ui.js` / `main.js` /
  `index.html` / `style.css` / `tests/e2e/*`.
- Art: original SVG from `tools/` (`art_bao.py` → Bao frames, bird, kite, icon; `art_animals.py` → 12 animals reused from
  the parade; `art_env.js` → cloud-land layers per season, cushion, sun/moon, particles; `env_scenes.js` = the env RECIPE
  copied verbatim into `render.js`). Bubbles, the things inside, the rainbow, drops, badges, snowflakes and the hint hand
  are canvas code in `bubble_art.js` (`PB.BubbleArt`).
- Render order (`render.js`): sky → sun → clouds → far → mid (season crossfade) → back particles → ground → rainbow (+ a
  cloud mist at its feet; drawn **over** the floor, not behind it — see "Deviations" below) → Bao's cushion → Bao (wand film
  in the SVG) → kite string + kite → bubbles (back-to-front by y: film back → thing → shine front; growing ones on the
  wand) → bird → freed things flying → drops / minis → snowflakes → hint hand → front particles → fx → banner.
- Script order: rng, i18n, content, bao_points, world, weather, bot, storage, assets, audio, voice, input, bubble_art,
  render, ui, main.

## Rules
- Keep all code inside this folder; `docs/DESIGN.md` is the contract, `docs/MECHANICS.md` the tuned numbers (`PB.CONFIG`),
  events and the render contract, `docs/VOICE.md` the event → line table main.js follows; integration decisions in
  `docs/reports/integration.md`.
- Kid-friendly and original only; no fail states; soft taps, surprises and Bao taps are never mistakes; a wrong bubble
  squishes and bounces, it never pops; kind words name what was tapped, then the goal. Exactly `k` target bubbles per round
  and every other bubble clearly not (content self-checks). An assisted round gets ≤ 2★.
- Colour pairs below age 5: never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round; no pink.
- Every text key in both `en` and `vi` with identical `{params}`; the helper is "Bao" (EN "Bao", VI lines "Bảo", titles
  "Gấu trúc Bảo").
- URL test flags never saved; storage prefix `pb:`. Loud audio chain + volume setting (skill rule); all sound synthesized.
- Speech policy (VOICE §1.1): prompts are protected (`speakPrompt`); countPop counts and the countSel run are queued +
  protected and never cut; a question is repeated only while `world.interactive` (Bao / bubble taps during the blow /
  rainbow / whoosh just giggle when nothing speaks); the long `.first` question only in a chapter's round 0; the whoosh is
  named rarely; one praise at `rainbowDone` only after a miss or in the chapter's last round. `main.js` sets
  `weather.windSource = world` so leaves / petals / snow gust with the bubbles (MECHANICS §0.5).
- Touches reach the world only through `PB.Input` (`down/move/up(x, y, ev)` — two numbers in logical px; HUD, speech bubble
  and menus never reach the canvas). The DOM speech bubble sits exactly at `world.layout.bubble` (no tail in portrait).
- Test: `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/unit/bubble_art.test.js && node tests/e2e/smoke.js`
  (full: `node tests/e2e/functional.js` — 4 device shapes + 10 bot sessions, ages 3–7 × EN/VI, every tap a real CDP touch;
  playtest sims: `tests/sim/`).

## Deviations from DESIGN the integrator made (documented)
- **Rainbow drawn over the cloud floor, not behind it** (DESIGN §7 order). The floor's top sits 150 px (landscape) /
  250–300 px (portrait) above `groundY`, so at `cy = groundY + 30` the arch's lower pieces hid in the clouds and the freed
  things flew into them; in portrait the whole arch was hidden. `render.js` draws the rainbow after the ground with a soft
  cloud mist (`_rainbowMist`) melting its feet into the floor, and `world.computeLayout` lifts the arch in portrait to just
  above Bao's head (`cfg.rainbowPortraitLift 24`; landscape unchanged, DESIGN §2). The matching unit assertion in
  `tests/unit/run.js` was updated. Full note in `docs/reports/integration.md`.
