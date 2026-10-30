# Dino Nest Sort · Khủng Long Xếp Tổ

A gentle learning game for children aged 3–7. Bo, a baby dinosaur, asks the child (out loud, in English or
Vietnamese) to drag eggs, shapes, fruit and animals into the right nest. Four chapters — sunny, breezy, rainy and
rainbow — five rounds each, then a short **Talk time** question that can be answered by tapping or by speaking.
No timers, no losing: wrong drops float back, the right nest glows after two tries, and stars only go up.

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/dino-nest-sort/game/

## On iPhone / iPad
1. Open the link in Safari. Tap once anywhere — iOS only allows sound and speech after the first tap.
2. Optional: **Share → Add to Home Screen** for a full-screen icon (speech answers only work in Safari itself).
3. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".
4. If you hear nothing: check the silent switch and the volume; sound effects follow the silent switch.

## For parents
Hold the ⚙ button on the title screen for 2 seconds to open settings: age (3, 4, 5, 6, 7+), language, child's name
(Bo uses it when praising), sound effects, music, Bo's voice, answering by talking. Nothing leaves the device;
settings and stars are stored in the browser.

| Age | Chapters |
|---|---|
| 3 | colours (2 nests) · shapes (2) · big & small · animal homes (2) |
| 4 | colours (3) · shapes (3) · counting 1–5 · animal homes (3) |
| 5 | shapes, mixed colours (4) · counting 1–10 · capital letters · animal homes (4) |
| 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting to 12 |
| 7+ | adding within 20 · taking away within 10 · first letter of a word · odd & even |

## Develop
```bash
cd projects/education-game/dino-nest-sort
python3 -m http.server -d game 8000        # then open http://localhost:8000 (or open game/index.html directly)
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice matcher tests
node tests/e2e/smoke.js                    # bot plays full sessions on iPhone/iPad viewports
node tests/e2e/functional.js               # touch, settings, rotation, talk time, …
node tools/render_icons.js                 # re-render home-screen icons from icon.svg
```
URL switches for testing: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved into settings). `window.DN.debug` exposes the world, state and controls.

## Layout
```
game/            index.html, css/, js/ (rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, render, ui, main),
                 assets/default/ (SVG art), assets/icons/ (PNG home-screen icons), manifest.webmanifest
docs/            DESIGN.md (module contract), MECHANICS.md, VOICE.md, art/ (contact sheets), reports/ (QA reports)
tests/           unit/, e2e/, sim/, visual/
tools/           art generators, icon renderer
```
