# Puppy Garden Catch · Cún Con Hứng Quà

A gentle learning game for children aged 3–7. Pip the puppy stands in a garden with a big basket; magic bubbles float
down from the clouds carrying balls, shapes, fruit and animals. Pip says (out loud, in English or Vietnamese) what to catch —
"Catch the red ball!" / "Bé ơi, hứng quả bóng màu đỏ nhé!" — and the child drags or taps to move Pip under it.
Four chapters (sunny, breezy, rainy, rainbow) of four rounds, each ending with a short **Talk time** question that can be
answered by tapping or by speaking. No timers, no losing: wrong catches hop back out, missed bubbles float back up,
the right bubble glows after two tries, and stars only go up.

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/puppy-garden-catch/game/

## On iPhone / iPad
1. Open the link in Safari. Tap once anywhere — iOS only allows sound and speech after the first tap.
2. Optional: **Share → Add to Home Screen** for a full-screen icon (speech answers only work in Safari itself).
3. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".
4. If you hear nothing: check the silent switch and the volume.

## How to play
- Drag anywhere: Pip follows your finger left and right. Tap the grass: Pip runs there.
- Tap a bubble: Pip says what is inside (he doesn't move). Tap Pip or the speech bubble: he repeats the question.
- The wooden tag on the basket shows what to catch (a picture, so children who can't read know too).

## For parents
Hold the ⚙ button on the title screen for 2 seconds to open settings: age (3, 4, 5, 6, 7+), language, child's name,
sound effects, music, Pip's voice, answering by talking. Nothing leaves the device.

| Age | Chapters |
|---|---|
| 3 | colours (2 in the air) · shapes (2) · big & small · animals (2) |
| 4 | colours (3) · shapes (3) · counting 1–5 · animals (3) |
| 5 | shapes, mixed colours (4) · counting 3–6 · capital letters · animals by their sound (4) |
| 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting 4–8 |
| 7+ | adding within 20 · taking away within 10 · first letter of a word · odd & even |

## Develop
```bash
cd projects/education-game/puppy-garden-catch
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/e2e/smoke.js                    # bot plays full sessions on iPhone/iPad viewports
node tests/e2e/functional.js               # real touch, settings, rotation, talk time, … (~14 min)
node tests/visual/capture.js screens       # screenshots into tests/out/visual
node tests/sim/playtest.js                 # headless playtests (see docs/reports/playtest_report.md)
```
URL switches for testing: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.PG.debug` exposes the world, state and controls.

## Layout
```
game/     index.html, css/, js/ (rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, render, ui, main),
          assets/default/ (SVG art), assets/icons/ (PNG home-screen icons), manifest.webmanifest
docs/     DESIGN.md (contract), MECHANICS.md, VOICE.md, art/ (contact sheets), reports/ (QA + playtest)
tests/    unit/, e2e/, sim/, visual/
tools/    art generators, icon renderer, scene composer
```
