# Momo's Toy Train · Chuyến Tàu Đồ Chơi Của Cú Momo

A learning game for children aged 3–7 (default 4). Momo, a little caramel owl in a striped engineer's cap, drives a
wooden toy train around the playroom. Each round a train chugs in and stops on the track; toys pop onto the rug above
it. The child drags each toy into the right car — red blocks into the red car, the star into the star car, three
teddies into the "3" car, the cow into the barn car. A toy dropped into the wrong car boings back home with kind words
("That's the blue car. The red block wants the red car!"). When every car is loaded, Momo says "All aboard! Pull the
whistle!" — the child taps the brass whistle: TOOT TOOT! The train jolts off on springy couplings, cargo bouncing,
steam puffing, and disappears into the toy-block tunnel; the next train rolls in. Through the window the day goes from
morning to noon, sunset and a starry night (night-light stars on the wall, the engine's headlamp on).

Made on 2026-11-06 with `/build-education-game random 4`. Mechanic family *container* (train ride: load the right cargo),
with a ride reward the child releases themselves. Theme swapped from "mountain camping" to a toy room (Pip's Camp Hide &
Seek on 2026-11-03 was already a campsite).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/owl-toy-train/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Momo's voice, answering by talking. No losing, no timers. A tap is not a drop (the toy hops home and Momo names it).
After two misses the right car glows and a ghost hand shows the way. If the child forgets the whistle, it glows after
6 s and Momo pulls it herself after 12 s. Nothing leaves the device. If nobody plays for about 2 minutes the game pauses.

Topics (four per session, one per time of day, rotating): colours, shapes, counting cargo (load N toys, counted aloud;
a full car is never a mistake), animal homes (barn, pond, tree, burrow), big & small (age 3); ABC blocks (5); small
letters, first letters, adding (6); taking away, odd & even (7+). One Talk-time question per chapter (tap or say it).
Surprises: a toy bunny hitches a ride, or a balloon is tied to the last car (tap them!).

## Develop
```bash
cd projects/education-game/owl-toy-train
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/e2e/smoke.js                    # one real touch drag + bot sessions on iPhone/iPad viewports
node tests/e2e/functional.js               # real touch: gate, settings, volume, drags, count, whistle, rotation, talk
node tests/sim/hs_playtest.js --n 300      # high-speed headless playtest
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.TT.debug` exposes the world, state and controls.

Design contract: `docs/DESIGN.md`; tuned numbers: `docs/MECHANICS.md`; voice: `docs/VOICE.md`; art sheets: `docs/art/`.
