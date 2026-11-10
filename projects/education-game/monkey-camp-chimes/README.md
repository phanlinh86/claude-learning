# Kiki's Camp Chimes · Chuông Gió Lửa Trại Của Khỉ Kiki

A music learning game for children aged 3–7 (default 4). Kiki, a little chestnut monkey in a cream polka-dot bandana, is
camping in the mountains and has hung a row of **wind chimes** from a log beam over the campfire. Kiki asks "Ring the RED
bell!": the child taps the chime (or swipes through it) — it **swings like a real pendulum** and rings its note, and a
glowing music note floats up and **lights a paper lantern** on the garland. Bell strings are counted aloud ("One, two,
three bells!") while each little bell lights up. When the round's notes are in, it's **song time**: one swipe across the
chimes (or a tap on the beam) rings them all in a shimmering cascade while Kiki dances. The day passes from morning mist
on the lake to a bright noon, an orange sunset and a starry night with fireflies.

Made on 2026-11-10 with `/build-education-game random 4` (mechanic family *music*; see `REQUIREMENT.md` for how it differs
from Bop's Rainy Band).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/monkey-camp-chimes/game/

## Ages and topics (4 chapters per session, easiest first)
| age | chapters |
|---|---|
| 3 | colours (2 bells) · shapes (2 chime plates) · big & small bell · animals (2 wooden animal chimes) |
| 4 (default) | colours (3) · shapes (3) · counting 1–5 (bell strings) · animals (3) |
| 5 | shapes with mixed colours (4) · counting 1–10 (dot plates) · capital letters · animals (4) |
| 6 | capital ↔ small letters · first letter of an animal's name · adding within 10 · counting to 12 |
| 7+ | adding within 20 · taking away within 10 · first letter · odd & even ("ring all the ODD numbers") |

## How to play
- Listen to Kiki (or read the bubble) and **tap** the asked chime — or swipe: the first chime body the finger reaches is
  the answer, any other chime the same swipe brushes only rings softly (never a mistake).
- Right → the note flies up and lights a lantern. Another chime → it swings with a soft "bonk" and Kiki kindly says what it
  was and what we're looking for. Taps on the sky or the beam just wobble the beam.
- After two tries the right chime glows and a ghost hand taps it; no losing, no timers. Stars: 3 / 2 / 1 per round.
- Song time: swipe across the chimes (or tap the beam) — after 4 s it plays by itself.
- After each chapter: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises: a hedgehog trundles past the fire (tap: it curls up and rolls), a songbird lands on the beam (tap: it sings
  your last note), fireflies at night (tap: they twinkle). The session ends with Kiki dancing under every lantern you lit.

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language (English / Tiếng Việt), child's name, volume,
sound effects, music, Kiki's voice, answering by talking. Nothing leaves the device; all art is original and all sound is
synthesized. If nobody plays for about 2 minutes the game pauses.

## Develop
```bash
cd projects/education-game/monkey-camp-chimes
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics: layout, content, world (pendulums, tap / swipe judging, song), weather, bot
node tests/unit/i18n_voice.test.js         # language + voice + input layer
node tests/unit/chime_art.test.js          # canvas chime art (bells, plates, strings, animals, beam, lanterns, fire, icons)
node tests/e2e/smoke.js                    # REAL touch taps (right + wrong) + a real song swipe + fast bot sessions, iPhone
node tests/e2e/functional.js               # full functional QA on 4 devices (≈ 12 min)
node tests/visual/screens.js               # visual QA screenshots (tests/out/visual)
node tests/sim/hs_playtest.js --n 60       # high-speed headless playtest (child models, report in tests/sim/out/)
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.CC.debug` exposes the world, state, the event log and controls (`chimeScreen(id)`, `beamScreen()`,
`bandScreen()`, `kikiScreen()`, `hedgehogScreen()`, `birdScreen()`, `fireflyScreen()`, `answer()`, `toScreen(x, y)` …).

Design contract: `docs/DESIGN.md`; tuned numbers + render contract: `docs/MECHANICS.md`; voice + input: `docs/VOICE.md`;
QA reports: `docs/reports/`; art sheets: `docs/art/`.
