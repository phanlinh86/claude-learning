# Dee's Forest Memory · Vịt Dee Lật Thẻ

A memory-card learning game for children aged 3–7. Dee, a fluffy duckling in a leaf cape, lives by a pond in a fairy
forest. Cards lie face down on a mossy clearing: Dee shows them for a moment, then turns them over, and the child taps two
cards to find a pair. Dee names every card that turns (in English or Vietnamese), and each pair found comes alive in the
forest — a butterfly flutters out, a shape lantern lights up on a branch, acorns tumble out, or the animal hops out and
stays to watch. The seasons change as you play: spring blossoms, summer, autumn leaves and a snowy winter party.

Made after parents' feedback that the earlier games all felt like "dropping something into a basket": here there is no
dragging at all, every chapter has a **surprise round** (two cards swap places, a hidden magic pair with a rainbow, or
cards floating on lily pads), and the chapters rotate between sessions.

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/duckling-forest-memory/game/

## On iPhone / iPad
1. Open the link in Safari and tap once anywhere (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Dee's voice, answering by talking. No losing, no timers; after three misses in a row Dee shows where a pair is.
Nothing leaves the device. If nobody taps for about two minutes the game pauses itself.

Topics (four per session, picked from a pool so sessions differ): colours, shapes, counting (number ↔ acorns), forest
animals, big & small (age 3–4); capital letters (5); small letters, first letters, adding (6); taking away, odd & even (7+).
Forest friends: fox, deer, hedgehog, squirrel, bunny, frog, bear, owl, mouse.

## Develop
```bash
cd projects/education-game/duckling-forest-memory
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/e2e/smoke.js                    # one real touch tap + bot sessions on iPhone/iPad viewports
node tests/e2e/functional.js [groups]      # real touch, gate, settings, volume, phases, rotation, talk time… (~25 min)
node tests/visual/capture.js               # screenshots into tests/out/visual
node tests/sim/playtest.js                 # headless playtests; tests/sim/pt_*.js for child models
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.IM.debug` exposes the world, state and controls.
