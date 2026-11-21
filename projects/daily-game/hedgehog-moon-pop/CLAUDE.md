# Bristle's Moon Pop (daily game, 2026-11-21)

## Goal
A family-friendly bubble popper on the Moon: Bristle the hedgehog skates and does floaty low-gravity jumps, curling into a
spiky ball to pop cupcake bubbles rising out of craters; air pops bounce him again (chains). Twist: a magnet bubble pulls
bubbles to him. Sleepy moon pebbles (telegraphed by a floor ring) cost a heart. Levels are times of day: dawn → noon →
sunset → night, then an endless loop. Requirement: `REQUIREMENT.md` (theme swapped from rainy-day garden to outer space to avoid
repeating Nimbus's Bubble Garden). Made with `/build-game random`.

## Status
v1.0 on 2026-11-21 (integration scaffolded from `../snail-cloud-catch/`; mechanics, art and renderer are new).
- QA round (`docs/reports/`): functional 317/323 at first (How to Play hidden on iPhone landscape, stale picture preview,
  vents re-shuffled on resize, NEW! badge, go.mod name); visual 2 P1 / 11 P2 / 9 P3 (pebble ring hidden under Bristle, board
  tilting into the floor, sky seams, popup overlaps, faint magnet ring/crater telegraph, …); playtest: pebbles 100 % fair
  (0 / 10,184 unavoidable bonks), no dominant exploit, sky pops too rare, night too long for kids.
- Fixes applied: all P1/P2 and most P3 visual items, both functional P2s + P3s 3–5; playtest `tierY` 220 → 240 and Normal
  `boxTargets` 20/24/28/32 → 20/24/26/28; `ceilY` 124; the board is flat on the floor.
- Tests after fixes: unit 21/21, smoke clean, functional 323/323 (`--quick`), mobile_qa 67/67, `test_extras.js` passed, exe builds (PE32+).
- Open: magnet sinks bubbles to the floor so experts score less while it's on (hard-coded 0.6 sink in `world.js _stepItems`;
  idea: a `magnetSink` CONFIG key or tier ≥ 2 for magnet pops in the air); wrapper origin check before bindings (functional P3-6);
  pebbles spawning behind the HUD score near x 480 (visual P3 #19); endless loop flattens after lap 4.
- Not yet verified: nobody has listened to the sound or played on a real iPhone/iPad (touch emulated in Chromium); the exe hasn't been run on Windows.

## Stack
Same as the other games in `projects/daily-game/`: HTML5 canvas + plain JS on `window.MP`; `world.js` headless and
deterministic (fixed 1/120 s steps), static 960×540 scene, flat floor y 492; mobile extended layout from the sister game;
Go + WebView2 wrapper (`dist/BristlesMoonPop.exe`, port 47629); original SVG art from `tools/art-*`; WebAudio sound;
Node unit tests + Playwright e2e/visual + player-model sims.

## Rules
- Keep all code inside this folder. `docs/DESIGN.md` is the contract; `docs/MECHANICS.md` documents world/weather/bot numbers.
- Kid-friendly (bonks are soft and dizzy, pebbles sleepy-cute), original art and sound only; Bristle is a chestnut-brown hedgehog — never blue, no shoes/gloves.
- Every pebble must stay avoidable (`tests/sim/deep.js` fairness checker); popups and warnings never cover Bristle.
- Storage keys use the `hmp:` prefix (all games share one GitHub Pages origin).
- After changing `audio.js` / `index.html`, re-run `python3 shared/daily-mobile/apply.py hedgehog-moon-pop` and `test_extras.js`.
- `app/web/`, `build/`, `dist/` and `tests/out/` are build outputs and are gitignored.
