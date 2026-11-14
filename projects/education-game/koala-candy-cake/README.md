# Lulu's Jungle Tower · Hươu Lulu Xếp Tháp

A learning game for children aged 3–7 (default 4). Lulu, a baby giraffe with a seafoam neckerchief, builds towers in a
jungle clearing. A bunch of bananas hangs from a branch above an old tree stump, and three wooden blocks wait on the
grass. Lulu asks "Stack the RED block!" and the child drags the block up over the tower and lets go: it drops, lands with
a *clonk* and a squash, and the whole tower sways and settles like a real stack of blocks. A wrong block boings off the
top and hops back home ("Boing! That's blue. Find red!"). When the tower reaches the bananas the blocks light up and
count "one, two, three!", flowers bloom up the tower and a cheeky monkey swings down on a vine to grab the bananas. The
day passes from a misty morning to noon, a golden sunset and a starry night with fireflies.

Made on 2026-11-04 with `/build-education-game random 4`. Mechanic family *build*: drag up and let go to stack, with
real wobble physics. No tapping hiding places, no rocket, no card grid, no popping, no catching into a basket.

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/giraffe-jungle-tower/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Lulu's voice, answering by talking. No losing, no timers. After two misses the right block glows and a ghost hand shows
the drag; then even a tap on it stacks it. Nothing leaves the device. If nobody plays for about 1.5 minutes the game
pauses itself.

Topics (four per session, one per time of day, rotating): colours, shapes, counting (count-up towers 1, 2, 3… then dice
dots), jungle animals and their sounds ("Who says roar?"), big & small (age 3); capital letters (5); small letters,
first letters, adding (6); taking away, odd & even (7+).

## Develop
```bash
cd projects/education-game/giraffe-jungle-tower
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/e2e/smoke.js                    # one real touch drag + bot sessions on iPhone/iPad viewports
node tests/e2e/functional.js [groups]      # real touch, gate, settings, volume, drags, rotation, talk time (~7 min)
node tests/visual/ck_capture.js            # screenshots into docs/reports/visual
node tests/sim/hs_playtest.js --n 60       # headless playtests with child models (tests/sim/hs_designer.js for voice)
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.CK.debug` exposes the world, state and controls.

Reports from the test team are in `docs/reports/`.
