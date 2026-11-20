# Pip's Reef Tower · Tháp San Hô Của Bạch Tuộc Pip

A learning game for children aged 3–7 (default 4). Pip, a little peach-coloured octopus with a mint diving mask pushed
up on her head, builds a shell tower on the seabed for her fish friends. A golden starfish rides a little pink jellyfish
high above the rock: "Let's build our tower all the way up to the starfish!" Pip asks "Find the RED block!" and the
child **taps** it: a bubble wraps the block, carries it up over the tower and pops — the block sinks slowly through the
water, rocking like a falling leaf and trailing bubbles, and settles with a soft *plonk* and a puff of sand; the tower
sways gently in the water. Dragging works too. A wrong block bonks softly off the tower and drifts home ("Bloop! That's
the blue block. Let's find red!"). When the tower reaches the starfish, it lands on top like a crown, a glowing pearl
pops up on every block while Pip counts, Pip blows a stream of bubbles, the pearls float away and a school of little fish
swirls around the tower. The weather above the waves changes each chapter: sunny → a sea current (the tower sways, Pip
holds it) → rain on the waves → a rainbow party.

Made on 2026-11-20 with `/build-education-game random 4`. Mechanic family *build* (tap to send, slow underwater sinking
and swaying physics). One swap from the roll: helper owl → a little octopus (owls don't live under the sea).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/octopus-reef-tower/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Pip's voice, answering by talking. No losing, no timers. After two misses the right block glows and a ghost hand shows
the tap; after three, the wrong blocks float away. Nothing leaves the device. If nobody plays for about 2 minutes the
game pauses itself.

Topics (four per session, one per weather, rotating): colours, shapes, counting (count-up towers 1, 2, 3… then pearl
dots), sea animals and clues ("Who has big claws?"), big & small (age 3); capital letters (5); small letters, first
letters, adding (6); taking away, odd & even (7+).

## Develop
```bash
cd projects/education-game/octopus-reef-tower
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/e2e/smoke.js                    # one real touch TAP + one real drag + bot sessions on iPhone/iPad viewports
node tests/e2e/functional.js [groups]      # real touch, gate, settings, volume, tap-to-send, drags, rotation, talk time
node tests/visual/rt_capture.js            # screenshots into docs/reports/visual
node tests/sim/hs_playtest.js --n 60       # headless playtests with child models (tests/sim/hs_designer.js for voice)
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.RT.debug` exposes the world, state and controls.

Reports from the test team are in `docs/reports/`.
