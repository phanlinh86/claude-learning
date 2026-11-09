# Pom's Puzzle Town · Voi Pom Ghép Hình

A jigsaw learning game for children aged 3–7 (default 4). Pom, a round baby elephant in a cream knitted scarf, loves
puzzles. On Puzzle Street every picture board has a few pieces missing — you can see their soft dark **shadows**. Pom asks
"Find the RED piece!": the child picks a piece up from the wooden tray (it lifts, and Pom says its name: "The red car!"),
carries it to its shadow and lets go — the piece is pulled in by a magnet, **clicks** into place and sparkles. Balloon
pieces are counted aloud ("One, two, three balloons!") while each balloon lights up. When the picture is complete it
**comes alive** — the car drives, the balloons float, the animals hop — Pom trumpets a happy toot, and the board turns
away like a page. The street goes from spring blossoms to summer sun, autumn leaves and winter snow.

Made on 2026-11-09 with `/build-education-game random 4` (mechanic family *build*: a jigsaw — drag each piece into the
shadow it fits).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/elephant-city-jigsaw/game/

## Ages and topics (4 chapters per session, easiest first)
| age | chapters |
|---|---|
| 3 | colours (2 pieces) · shapes (2) · big & small (the same thing big and small) · animals (2) |
| 4 (default) | colours (3) · shapes (3) · counting 1–5 (balloon bunches) · animals (3) |
| 5 | shapes with mixed colours (4) · counting 1–10 (dot tiles) · capital letters · animals (4) |
| 6 | capital ↔ small letters · first letter of an animal's name · adding within 10 · counting to 12 |
| 7+ | adding within 20 · taking away within 10 · first letter · odd & even ("put in all the ODD numbers") |

## How to play
- Listen to Pom (or read the bubble), **drag** the asked piece from the tray into its shadow on the picture.
- Let go near the shadow (the zone is generous, especially above it) → click! Let go elsewhere on the picture → the piece
  glides home and its shadow pulses ("It goes here — look at the shadow!"); the next drop anywhere on the picture fits.
- A different piece on the picture → it wiggles and flies home, Pom says kindly what it was and what we are looking for.
- A quick tap on a piece → it hops and Pom says its name. Tap Pom or the bubble to hear the question again.
- After two tries the right piece glows and a ghost hand shows the way; no losing, no timers. Stars: 3 / 2 / 1 per picture.
- After each chapter: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises: a pigeon waddles along the pavement, or soap bubbles float up (tap them!). The session ends with all the
  finished pictures coming alive around a cheering Pom.

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language (English / Tiếng Việt), child's name, volume,
sound effects, music, Pom's voice, answering by talking. Nothing leaves the device; all art is original and all sound is
synthesized. If nobody plays for about 2 minutes the game pauses.

## Develop
```bash
cd projects/education-game/elephant-city-jigsaw
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics: layout, content, world (drag / snap / near miss / wrong), weather, bot
node tests/unit/i18n_voice.test.js         # language + voice + drag input layer
node tests/unit/puzzle_art.test.js         # canvas puzzle art (pieces, shadows, boards, tray, icons)
node tests/e2e/smoke.js                    # one REAL touch drag (placed) + one wrong drag + fast bot sessions, iPhone portrait/landscape
node tests/sim/hs_playtest.js --n 60       # high-speed headless playtest (child models, report in tests/sim/out/)
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.PZ.debug` exposes the world, state, the event log and controls (`pieceScreen(id)`,
`slotScreen(id)`, `pomScreen()`, `pigeonScreen()`, `bubbleScreen()`, `answer()`, `toScreen(x, y)` …).

Design contract: `docs/DESIGN.md`; tuned numbers + render contract: `docs/MECHANICS.md`; voice + input: `docs/VOICE.md`;
art sheets: `docs/art/`.
