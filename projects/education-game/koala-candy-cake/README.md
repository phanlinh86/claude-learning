# Koko's Cake Tower · Tháp Bánh Kem Của Koala Koko

A learning game for children aged 3–7 (default 4). Koko, a little koala baker in a cream chef's hat and a mint apron,
bakes the tallest cake in Candy Village. A cherry floats above the cake stand on a cotton-candy cloud, and soft cake
layers wait on the plaza. Koko asks "Stack the RED layer!" and the child drags the layer up over the cake and lets go:
it drops with a soft *flump*, squishes and the whole cake jiggles like real sponge. A wrong layer boings off the frosting
and hops home ("Boing! That's the blue layer. Let's find red!"). When the cake reaches the cherry, the cherry plops on
top, a candle lights for every layer while Koko counts, Koko blows them out and sprinkles rain down. The weather changes
each chapter: sunny → breezy (the cake sways, Koko holds it steady) → sugar-drop rain → a rainbow party.

Made on 2026-11-14 with `/build-education-game random 4`. Mechanic family *build* (drag up and let go to stack, with
squishy wobble physics). One swap from the roll: theme jungle → Candy Village (the roll repeated Lulu's Jungle Tower).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/koala-candy-cake/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Koko's voice, answering by talking. No losing, no timers. After two misses the right layer glows and a ghost hand shows
the drag; after three, the wrong layers puff away. Nothing leaves the device. If nobody plays for about 2 minutes the
game pauses itself.

Topics (four per session, one per weather, rotating): colours, shapes, counting (count-up cakes 1, 2, 3… then candy
dots), animal cookies and their sounds ("Who says moo?"), big & small (age 3); capital letters (5); small letters,
first letters, adding (6); taking away, odd & even (7+).

## Develop
```bash
cd projects/education-game/koala-candy-cake
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
