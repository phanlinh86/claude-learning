# Nuka's Snow Dig · Gấu Nuka Đào Tuyết

A learning game for children aged 3–7 (default 4). Nuka, a chubby polar-bear cub in a brown knitted scarf, plays on a
snowfield by the Arctic sea. Little treasures peek out of the snow drifts — the pompom of a knitted hat, the point of an
ice gem, the head of a fish, the ears of a plush fox. Nuka asks "Find the RED hat!": the child **rubs the snow** on that
drift — every swish back and forth is a big paw scoop that flings powder snow (a single tap works too: Nuka's paw keeps
digging by itself, just slower). The treasure pops out; a right find twirls and **floats up on a sparkle trail into the
northern lights**, where it glows in the aurora ribbon. After every round the aurora ripples and Nuka does a **belly
slide** across the snow. Shapes ("Dig up the TRIANGLE!"), counting ("Dig up 3 fish!", counted aloud), big & small,
arctic animals ("Where is the REINDEER?"); letters, adding, taking away and odd/even for older children. The year turns
from spring (melting snow, flowers) to summer (the midnight sun) to autumn (red tundra) to a winter night with snowfall
and a bright aurora.

Made on 2026-11-23 with `/build-education-game random 4` (mechanic family *seek*: treasure dig). It starts from the code
of Bun's Dino Dig (2026-11-08, same family) but plays differently: a new **rub** gesture, a float-up reward into the
aurora instead of a shelf, a belly-slide round end, and new art, sound and words throughout.

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/polar-bear-snow-dig/game/

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Nuka's voice, answering by talking. No losing, no timers. Digging the wrong drift is fine: the thing waves hello, Nuka
says kindly what it is and what we are looking for, and it stays in its hole. On the first question a ghost hand shows
how to rub the snow. After two tries without progress the right drift glows and the hand shows the way; a child who
keeps tapping around gets the paw guided for them. Tap Nuka or the speech bubble to hear the question again. Nothing
leaves the device. If nobody plays for about 2 minutes the game pauses.

Four chapters per session (spring, summer, autumn, winter; topics rotate between sessions), four rounds each, then one
Talk-time question (tap or say the answer). Surprises: a seal pup pops out of an ice hole, or an arctic tern glides by
(tap them!). The session ends with every find dancing in the aurora.

## Develop
```bash
cd projects/education-game/polar-bear-snow-dig
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests (layout, content, world incl. rub, weather, bot)
node tests/unit/i18n_voice.test.js         # language + voice + input tests
node tests/unit/dig_art.test.js            # canvas snow-dig art (things, drifts, paw, aurora, icons)
node tests/e2e/smoke.js                    # one real touch dig + bot sessions per age, iPhone/iPad
node tests/e2e/functional.js [group…]      # real touch: boot, gate, settings, tap + rub digs, count, talk, pause, rotate, slide
node tests/visual/screens.js               # screenshots → tests/out/visual/ (kept set in docs/reports/visual/)
node tests/sim/hs_playtest.js --n 100      # high-speed headless playtest (also hs_kids.js, hs_snow.js child models)
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.NK.debug` exposes the world, state and controls (`moundScreen(id)`, `rubMound(id)`,
`bunScreen()`, `answer()` …).

Design contract: `docs/DESIGN.md`; tuned numbers: `docs/MECHANICS.md`; voice: `docs/VOICE.md`; art sheets: `docs/art/`;
QA reports: `docs/reports/`.
