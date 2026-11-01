# Kitten's Balloon Farm · Bóng Bay Nông Trại Mèo Con

A gentle learning game for children aged 3–7. Miu, a little cream kitten in a straw hat, is holding a balloon party on
the farm. Big shiny balloons float up over the fence and bob in the breeze; Miu says (out loud, in English or Vietnamese)
which one to pop — "Pop the red balloons!", "Pop the star balloon!", "Pop 3 balloons!", "Pop the balloon with the pig!" —
and the child taps it. POP! Confetti flies, Miu says the word or counts, and animal balloons drop a farm friend onto the
grass. The day passes as you play: pink morning, bright noon, orange sunset and a starry night with fireflies. Every
chapter ends with a short **Talk time** question (e.g. "Which animal says moo?" — tap or speak the answer).
No timers, no losing: a wrong balloon just boings and wobbles, the right one glows after two tries, and stars only go up.

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/kitten-balloon-farm/game/

## On iPhone / iPad
1. Open the link in Safari. Tap once anywhere — iOS only allows sound and speech after the first tap.
2. Optional: **Share → Add to Home Screen** for a full-screen icon (speech answers only work in Safari itself).
3. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".
4. If you hear nothing: check the silent switch and the volume.

## How to play
- Tap a balloon. Tapping its string just below it counts too.
- Tap Miu, the sign or the speech bubble: Miu repeats the task. The sign shows the task as a picture
  (a colour, a shape, a number with dots, an animal), so children who can't read know too.

## For parents
Hold the ⚙ button on the title screen for 2 seconds to open settings: age (3, 4, 5, 6, 7+), language, child's name,
sound effects, music, Miu's voice, answering by talking. Nothing leaves the device. If nobody taps for about two minutes,
the game pauses itself.

| Age | Chapters (morning · noon · sunset · night) |
|---|---|
| 3 | colours (2) · big & small · shapes (2) · farm animals (2) |
| 4 | colours (3) · shapes (3) · counting 1–5 · farm animals (3) |
| 5 | shapes, mixed colours (4) · counting 3–10 · capital letters · farm animals (4) |
| 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting to 12 |
| 7+ | first letter of a word · adding within 20 · taking away within 10 · odd & even |

Farm friends: cow, pig, sheep, duck, horse, goat, chick, bunny, puppy.

## Develop
```bash
cd projects/education-game/kitten-balloon-farm
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/e2e/smoke.js                    # one real touch tap + bot sessions on iPhone/iPad viewports
node tests/e2e/functional.js               # real touch, parent gate, settings, rotation, talk time, … (~12 min)
node tests/visual/capture.js               # screenshots into tests/out/visual
node tests/sim/playtest.js                 # headless playtests; tests/sim/pt_run.js for the child models
```
URL switches for testing: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.KB.debug` exposes the world, state and controls.

## Layout
```
game/     index.html, css/, js/ (rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, balloon_art,
          render, ui, main), assets/default/ (SVG art), assets/icons/ (PNG home-screen icons), manifest.webmanifest
docs/     DESIGN.md (contract), MECHANICS.md, VOICE.md, art/ (contact sheets), reports/ (QA + playtest)
tests/    unit/, e2e/, sim/, visual/
tools/    art generators (art_miu.py, art_animals.py, art_env.js), icon renderer, scene composer
```
