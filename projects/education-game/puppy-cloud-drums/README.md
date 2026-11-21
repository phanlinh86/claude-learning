# Bibi's Cloud Drums · Trống Mây Của Cún Bibi

A music learning game for children aged 3–7 (default 4). Bibi, an apricot puppy in a white sailor collar, plays drums on the
clouds of a rainbow land. Bouncy cloud drums stand on little floating cloud cushions. Bibi asks "Boom the RED drum!": the
child taps it — **BOOM**, the drum squashes, hops off its cushion and lands again, its skin ripples, and a music note flies up
and **lights a star lantern**. Counting is a rhythm: "Three times! Beat the big drum three times!" — boom, boom, boom, each
beat lighting a dot on the number card and counted aloud. Animals peek over their drums and sing: "Who says moo? Tap the
cow!" When the round's notes are in, the child plays the song: every drum bounces in a wave and Bibi crashes the cymbal.
The day passes from a pink morning to a bright noon, a violet sunset and a starry night.

Made on 2026-11-21 with `/build-education-game random 4` (mechanic family *music*; see `REQUIREMENT.md` for how it differs
from Kiki's Camp Chimes and Pip's Reef Tower).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/puppy-cloud-drums/game/

## Ages and topics (4 chapters per session, easiest first)
| age | chapters |
|---|---|
| 3 | colours (2 drums) · shapes (2) · big & small drum · animals (2 singers) |
| 4 (default) | colours (3) · shapes (3) · counting 1–5 (beat the big drum N times) · animals (3, by their sound) |
| 5 | shapes with mixed colours (4) · counting 1–10 (drums with dots) · capital letters · animals (4) |
| 6 | capital ↔ small letters · first letter of an animal's name · adding within 10 · counting to 12 |
| 7+ | adding within 20 · taking away within 10 · first letter · odd & even |

## How to play
- Listen to Bibi (or read the bubble) and **tap** the asked drum. A swipe works too: the first drum the finger reaches is the
  answer, other drums the swipe brushes only boom softly (never a mistake).
- Right → the note flies up and lights a star lantern. Another drum → a soft "bumpf" wobble and Bibi kindly says what it was
  and what we're looking for. After two tries the right drum glows and a ghost hand taps it. No losing, no timers.
- Counting: beat the big drum as many times as the card shows. Stopping halfway → "Two! One more!".
- Song: tap or swipe the drums (it plays by itself after a few seconds) — the drums bounce in a wave and the cymbal crashes.
- After each chapter: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises: a fluffy cloud lamb (tap: it puffs up and bounces), a little bird on the lantern string (tap: it sings your last
  note), twinkle stars at night. The session ends with Bibi dancing under a rainbow and every star lantern you lit.

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language (English / Tiếng Việt), child's name, volume,
sound effects, music, Bibi's voice, answering by talking. Nothing leaves the device; all art is original and all sound is
synthesized. If nobody plays for about 2 minutes the game pauses.

## Develop
```bash
cd projects/education-game/puppy-cloud-drums
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics: layout, content, drum world (bounce, beat mode, judging, song), weather, bot
node tests/unit/i18n_voice.test.js         # language + voice + input layer
node tests/unit/drum_art.test.js           # canvas drum art (drums, cushions, star lanterns, cymbal, card, icons)
node tests/e2e/smoke.js                    # REAL touch taps (right + wrong) + a real song swipe + fast bot sessions, iPhone
node tests/e2e/functional.js               # full functional QA on 4 devices (≈ 15 min)
node tests/visual/screens.js               # visual QA screenshots (tests/out/visual)
node tests/sim/hs_playtest.js --n 60       # high-speed headless playtest (child models)
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.CD.debug` exposes the world, state, the event log and controls (`drumScreen(id)`, `stageScreen()`,
`cymbalScreen()`, `cardScreen()`, `bandScreen()`, `bibiScreen()`, `lambScreen()`, `birdScreen()`, `fireflyScreen()`,
`answer()`, `toScreen(x, y)` …).

Design contract: `docs/DESIGN.md`; tuned numbers + render contract: `docs/MECHANICS.md`; voice + input: `docs/VOICE.md`;
QA reports: `docs/reports/`; art sheets: `docs/art/`.
