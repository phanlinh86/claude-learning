# Pip's Camp Hide & Seek · Cáo Pip Chơi Trốn Tìm

A learning game for children aged 3–7 (default 4). Pip, a baby fox in a teal camping bandana, plays hide-and-seek with
the animal friends at a mountain campsite. Pip covers both eyes and counts "One… two… three!" while the friends scamper
behind bushes, tents, leaf piles and snowmen. A clue always peeks out: a woolly hat, a flag with a shape, a sign with
stars, a pair of ears. Pip asks "Where is the friend in the RED hat?" and the child taps a hiding place: it rustles open
and — boo! — a friend pops up. The right friend jumps out and hops to the campfire bench; a wrong one giggles, says
what it has, and ducks back down. Find everybody and the campfire flares for a little dance. The campsite changes from
spring blossoms to summer tents, autumn leaves and winter snow, and the session ends with a winter-night campfire party.

Made on 2026-11-03 with `/build-education-game random 4`. Mechanic family *seek*: tap a hiding place to peek and read a
partial clue. No dragging into containers, no popping, no card grid, no flying, so it plays differently from the last games.

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/fox-camp-hide-seek/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Pip's voice, answering by talking. No losing, no timers. After two misses the right hiding place glows. Nothing leaves
the device. If nobody taps for about two minutes the game pauses itself.

Topics (four per session, one per season, rotating): colours (hats), shapes (flags), counting (signs with stars; a
count-up round finds 1, 2, 3…), animals by their ears and sounds ("Who says moo?"), big & small (age 3); capital letters
(5); small letters, first letters, adding (6); taking away, odd & even (7+).

## Develop
```bash
cd projects/education-game/fox-camp-hide-seek
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/e2e/smoke.js                    # one real touch tap + bot sessions on iPhone/iPad viewports
node tests/e2e/functional.js [groups]      # real touch, gate, settings, volume, peeks, rotation, talk time (~9 min)
node tests/visual/fc_capture.js            # screenshots into tests/out/visual
node tests/sim/playtest.js                 # headless playtests; tests/sim/hs_playtest.js for child models
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.FC.debug` exposes the world, state and controls.

Reports from the test team are in `docs/reports/`.
