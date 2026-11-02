# Bim's Rainbow Rocket · Tên Lửa Cầu Vồng Của Voi Bim

A learning game for children aged 3–7 (default 4). Bim, a baby elephant in pilot goggles, flies a little rocket up
through Rainbow Cloud Land. Cloud islands float above the rocket, each carrying a colour, a shape, some stars or an
animal friend. Bim asks "Fly to the red cloud!" and the child taps the right island (or draws a line to it from the
rocket). The rocket rumbles, blasts off on a curving flight with a rainbow trail, lands with a bounce and pulls the
treasure into its little cloud wagon. The camera climbs with every hop. After each round the child taps the rocket for a
big BOOST through a cloud bank, and the sky changes from morning to noon to sunset to a starry night, where the islands
turn into tiny planets. It ends with a party on the moon.

Made on 2026-11-02 with `/build-education-game random 4`. The mechanic family is *path*: tap a destination, then
boost. There is no dragging into containers, no balloon popping and no card grid, so it plays differently from the last
games.

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/elephant-rainbow-rocket/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Bim's voice, answering by talking. No losing, no timers. A wrong island wobbles and Bim says kindly what it was; after
two misses the right island glows. Nothing leaves the device. If nobody taps for about two minutes the game pauses itself.

Topics (four per session, rotating): colours, shapes, counting (count up hop by hop, then "the cloud with 3 stars"),
animals and their sounds ("Who says moo?"), big & small (age 3–4); capital letters (5); small letters, first letters,
adding (6); taking away, odd & even (7+). Animal friends: cat, dog, cow, pig, sheep, duck, lion, frog.

## Develop
```bash
cd projects/education-game/elephant-rainbow-rocket
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/e2e/smoke.js                    # one real touch tap + bot sessions on iPhone/iPad viewports
node tests/e2e/functional.js [groups]      # real touch, gate, settings, volume, drags, boost, rotation, talk time (~35 min)
node tests/visual/rr_capture.js            # screenshots into tests/out/visual
node tests/sim/playtest.js                 # headless playtests; tests/sim/hs_playtest.js for child models
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.RR.debug` exposes the world, state and controls.

Art: original SVG from the generators in `tools/` (`art_bim.py`, `art_animals.py`, `art_env.js`); islands, tokens,
flames and the ribbon are drawn by code in `game/js/sky_art.js`. Reports from the test team are in `docs/reports/`.
