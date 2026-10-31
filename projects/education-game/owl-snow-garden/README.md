# Owlet's Snow Garden · Vườn Hoa Cú Tuyết

A gentle learning game for children aged 3–7. Lumi, a little snowy owlet in a mint scarf, keeps a magic flower garden
in the snow. Lumi says (out loud, in English or Vietnamese) what to plant — "Plant the red seed in the red pot!",
"Plant 3 flowers!", "Plant a flower for the seal!" — and the child drags big seeds into the flower pots. Each seed sinks
into the soil, sprouts and blooms. The day passes as you play: pink morning, bright noon, orange sunset and a starry
night with northern lights. Every chapter ends with a short **Talk time** question (tap or speak the answer).
No timers, no losing: wrong drops hop back home, the right pot glows after two tries, and stars only go up.

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/owl-snow-garden/game/

## On iPhone / iPad
1. Open the link in Safari. Tap once anywhere — iOS only allows sound and speech after the first tap.
2. Optional: **Share → Add to Home Screen** for a full-screen icon (speech answers only work in Safari itself).
3. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".
4. If you hear nothing: check the silent switch and the volume.

## How to play
- Drag a seed onto a pot. Drop it a little high — that's fine, the pot catches it.
- Tap a seed: Lumi says its name (it doesn't move). Tap Lumi or the speech bubble: she repeats the task.
- The sign on each pot shows what goes in (a picture, so children who can't read know too).

## For parents
Hold the ⚙ button on the title screen for 2 seconds to open settings: age (3, 4, 5, 6, 7+), language, child's name,
sound effects, music, Lumi's voice, answering by talking. Nothing leaves the device.

| Age | Chapters (morning · noon · sunset · night) |
|---|---|
| 3 | colours (2 pots) · big & small · shapes (2) · animal friends (2) |
| 4 | colours (3) · shapes (3) · counting 1–5 · animal friends (3) |
| 5 | shapes, mixed colours (4) · counting 3–10 · capital letters · animal friends (4) |
| 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting to 12 |
| 7+ | first letter of a word · adding within 20 · taking away within 10 · odd & even |

Animal friends: polar bear, seal, arctic fox, snow hare, reindeer, walrus, penguin, puffin, whale.

## Develop
```bash
cd projects/education-game/owl-snow-garden
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/e2e/smoke.js                    # bot plays full sessions on iPhone/iPad viewports
node tests/e2e/functional.js               # real touch, settings, rotation, talk time, … (~9 min)
node tests/visual/capture.js               # screenshots into tests/out/visual
node tests/sim/playtest.js                 # headless playtests (see docs/reports/playtest_report.md)
```
URL switches for testing: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.SG.debug` exposes the world, state and controls.

## Layout
```
game/     index.html, css/, js/ (rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, render, ui, main),
          assets/default/ (SVG art), assets/icons/ (PNG home-screen icons), manifest.webmanifest
docs/     DESIGN.md (contract), MECHANICS.md, VOICE.md, art/ (contact sheets), reports/ (QA + playtest)
tests/    unit/, e2e/, sim/, visual/
tools/    art generators, icon renderer, scene composer
```
