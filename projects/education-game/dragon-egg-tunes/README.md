# Rio's Cloud Eggs · Trống Mây Của Cún Rio

A music learning game for children aged 3–7 (default 4). Rio, an apricot puppy in a white sailor collar, plays eggs on the
clouds of a rainbow land. Bouncy cloud eggs stand on little floating cloud cushions. Rio asks "Boom the RED egg!": the
child taps it — **BOOM**, the egg squashes, hops off its cushion and lands again, its skin ripples, and a music note flies up
and **lights a star lantern**. Counting is a rhythm: "Three times! Beat the big egg three times!" — boom, boom, boom, each
beat lighting a dot on the number card and counted aloud. Animals peek over their eggs and sing: "Who says moo? Tap the
cow!" When the round's notes are in, the child plays the song: every egg bounces in a wave and Rio crashes the cymbal.
The day passes from a pink morning to a bright noon, a violet sunset and a starry night.

Made on 2026-11-21 with `/build-education-game random 4` (mechanic family *music*; see `REQUIREMENT.md` for how it differs
from Kiki's Camp Chimes and Pip's Reef Tower).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/puppy-cloud-eggs/game/

## Ages and topics (4 chapters per session, easiest first)
| age | chapters |
|---|---|
| 3 | colours (2 eggs) · shapes (2) · big & small egg · animals (2 singers) |
| 4 (default) | colours (3) · shapes (3) · counting 1–5 (beat the big egg N times) · animals (3, by their sound) |
| 5 | shapes with mixed colours (4) · counting 1–10 (eggs with dots) · capital letters · animals (4) |
| 6 | capital ↔ small letters · first letter of an animal's name · adding within 10 · counting to 12 |
| 7+ | adding within 20 · taking away within 10 · first letter · odd & even |

## How to play
- Listen to Rio (or read the bubble) and **tap** the asked egg. A swipe works too: the first egg the finger reaches is the
  answer, other eggs the swipe brushes only boom softly (never a mistake).
- Right → the note flies up and lights a star lantern. Another egg → a soft "bumpf" wobble and Rio kindly says what it was
  and what we're looking for. After two tries the right egg glows and a ghost hand taps it. No losing, no timers.
- Counting: beat the big egg as many times as the card shows. Stopping halfway → "Two! One more!".
- Song: tap or swipe the eggs (it plays by itself after a few seconds) — the eggs bounce in a wave and the cymbal crashes.
- After each chapter: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises: a fluffy cloud lamb (tap: it puffs up and bounces), a little bird on the lantern string (tap: it sings your last
  note), twinkle stars at night. The session ends with Rio dancing under a rainbow and every star lantern you lit.

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language (English / Tiếng Việt), child's name, volume,
sound effects, music, Rio's voice, answering by talking. Nothing leaves the device; all art is original and all sound is
synthesized. If nobody plays for about 2 minutes the game pauses.

## Develop
```bash
cd projects/education-game/puppy-cloud-eggs
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics: layout, content, egg world (bounce, beat mode, judging, song), weather, bot
node tests/unit/i18n_voice.test.js         # language + voice + input layer
node tests/unit/egg_art.test.js           # canvas egg art (eggs, cushions, star lanterns, cymbal, card, icons)
node tests/e2e/smoke.js                    # REAL touch taps (right + wrong) + a real song swipe + fast bot sessions, iPhone
node tests/e2e/functional.js               # full functional QA on 4 devices (≈ 15 min)
node tests/visual/screens.js               # visual QA screenshots (tests/out/visual)
node tests/sim/hs_playtest.js --n 60       # high-speed headless playtest (child models)
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.SE.debug` exposes the world, state, the event log and controls (`eggScreen(id)`, `stageScreen()`,
`cymbalScreen()`, `cardScreen()`, `bandScreen()`, `rioScreen()`, `lambScreen()`, `birdScreen()`, `fireflyScreen()`,
`answer()`, `toScreen(x, y)` …).

Design contract: `docs/DESIGN.md`; tuned numbers + render contract: `docs/MECHANICS.md`; voice + input: `docs/VOICE.md`;
QA reports: `docs/reports/`; art sheets: `docs/art/`.
