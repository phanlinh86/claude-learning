# Bun's Dino Dig · Thỏ Bun Đào Kho Báu

A learning game for children aged 3–7 (default 4). Bun, a bunny explorer in a khaki hat, has found a sandy dig site in
Dinosaur Valley. Little treasures peek out of the sand mounds — the tip of a coloured egg, the point of a star stone, a
toy duck's head, a bone. Bun asks "Find the RED egg!": the child taps that mound and **digs** — every tap is a big
shovel scoop that flings sand (one tap is enough, the shovel keeps going; tapping along digs faster). The treasure pops
out of the hole: a right **egg hatches a baby dinosaur** that hops onto Bun's treasure shelf; stones, toys and bones
spin up onto the shelf too. Shapes ("Dig up the TRIANGLE!"), counting ("Dig up 3 bones!", counted aloud), big & small,
toy animals ("Where is the DUCK?"); letters, adding, taking away and odd/even for older children. The valley turns from
morning to noon to sunset to a starry night with fireflies and a lantern glow over the dig.

Made on 2026-11-08 with `/build-education-game random 4` (mechanic family *seek*: treasure dig — tap the sand to find
the answer).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/bunny-dino-dig/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Bun's voice, answering by talking. No losing, no timers. Digging the wrong mound is fine: the thing waves hello, Bun
says kindly what it is and what we are looking for, and it stays in its open hole. After two taps without progress the
right mound glows and a ghost hand shows the way; a child who keeps tapping around gets the shovel guided for them.
Tap Bun or the speech bubble to hear the question again. Nothing leaves the device. If nobody plays for about
2 minutes the game pauses.

Four chapters per session (morning, noon, sunset, night; topics rotate between sessions), four rounds each, then one
Talk-time question (tap or say the answer). Surprises: a mole pops out of the sand, or a baby pterosaur glides by (tap
them!). The session ends with every treasure the child found dancing around Bun.

## Develop
```bash
cd projects/education-game/bunny-dino-dig
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests (layout, content, world, weather, bot)
node tests/unit/i18n_voice.test.js         # language + voice + input tests
node tests/unit/dig_art.test.js            # canvas dig art (things, mounds, shovel, shelf, icons)
node tests/e2e/smoke.js                    # one real touch dig + bot sessions per age, iPhone/iPad
node tests/e2e/functional.js               # real touch: boot, gate, settings, audio, dig/wrong/already/busy, count, talk, pause, rotate, surprises
node tests/visual/screens.js               # screenshots → tests/out/visual/ (kept set in docs/reports/visual/)
node tests/sim/hs_playtest.js --n 100      # high-speed headless playtest (also tests/sim/hs_kids.js child models)
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.DD.debug` exposes the world, state and controls (`moundScreen(id)`, `bunScreen()`, `answer()` …).

Design contract: `docs/DESIGN.md`; tuned numbers: `docs/MECHANICS.md`; voice: `docs/VOICE.md`; art sheets: `docs/art/`;
QA reports: `docs/reports/`.
