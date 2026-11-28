# Mit's Treasure Map · Cún Mít Ghép Bản Đồ Kho Báu

A jigsaw learning game for children aged 3–7 (default 4). Mit the pirate puppy (a round cream puppy in a folded paper pirate
hat) found an old treasure map — but the wind blew its pieces into the sea! The pieces come **floating back on a wave** and
bob in the shallow water at the shore. Mit asks "Find the RED piece!": the child scoops a piece out of the water (it drips,
and Mit says its name: "The red boat!"), carries it to its shadow on the map parchment and lets go — the piece is pulled in,
**clicks** into place and sparkles. Coin pieces are counted aloud ("One, two, three coins!"). A complete picture **comes
alive**, Mit barks "Arf arf!", the map **rolls up into a scroll** that flies into Mit's paws, and the next one unrolls. The
island weather goes from a sunny day to a breezy day (palm trees bend in the gusts), a warm rain shower and a rainbow — and
at the end a **treasure chest** pops out of the sand and opens.

Made on 2026-11-28 with `/build-education-game random 4` (mechanic family *build*: a jigsaw — drag each piece into the
shadow it fits; theme swapped from "busy city street" to **pirate island** so it does not repeat Pom's Puzzle Town).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/puppy-pirate-map/game/

## Ages and topics (4 chapters per session, easiest first)
| age | chapters |
|---|---|
| 3 | colours (2 pieces) · shapes (2) · big & small (the same thing big and small) · sea animals (2) |
| 4 (default) | colours (3) · shapes (3) · counting 1–5 (gold coins) · sea animals (3) |
| 5 | shapes with mixed colours (4) · counting 1–10 (dot cards) · capital letters · sea animals (4) |
| 6 | capital ↔ small letters · first letter of an animal's name · adding within 10 · counting to 12 |
| 7+ | adding within 20 · taking away within 10 · first letter · odd & even |

Things: boat, flag, bucket, beach umbrella, pirate hat, shell, kite, message bottle; animals: parrot, turtle, fish, monkey,
octopus, seagull, dolphin, starfish.

## How to play
- Listen to Mit (or read the bubble), **drag** the asked piece out of the water into its shadow on the map.
- Let go near the shadow (the zone is generous, especially above it) → click! Let go elsewhere on the map → the piece floats
  home and its shadow pulses ("It goes here!"); the next drop anywhere on the map fits.
- A different piece on the map → it wiggles and splashes back into the water; Mit says kindly what it was and what we need.
- A quick tap on a piece → it bobs and Mit says its name. Tap Mit or the bubble to hear the question again.
- After two tries the right piece glows and a ghost hand shows the way; no losing, no timers. Stars: 3 / 2 / 1 per picture.
- After each chapter: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises: a crab scuttles sideways along the frame (tap it — it waves its claws), or a little fish blows bubbles (pop them!).

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language (English / Tiếng Việt), child's name, volume,
sound effects, music, Mit's voice, answering by talking. Nothing leaves the device; all art is original and all sound is
synthesized. If nobody plays for about 2 minutes the game pauses.

## Develop
```bash
cd projects/education-game/puppy-pirate-map
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics: layout, content, world (float, wash-in, drag / snap / near miss / wrong, roll-up, chest), weather, bot
node tests/unit/i18n_voice.test.js         # language + voice + drag input layer
node tests/unit/puzzle_art.test.js         # canvas puzzle art (pieces, shadows, parchment boards, water tray, chest, scroll, fish)
node tests/e2e/smoke.js                    # one REAL touch drag (placed) + one wrong drag + fast bot sessions, iPhone portrait/landscape
node tests/e2e/functional.js               # full functional QA on 4 touch devices (~11 min)
node tests/sim/hs_playtest.js --n 60       # high-speed headless playtest (child models, report in tests/sim/out/)
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.TM.debug` exposes the world, state, the event log (a rolling window of the last 300) and controls.

Design contract: `docs/DESIGN.md` (§0 = what this game changed from Pom's Puzzle Town); tuned numbers + render contract:
`docs/MECHANICS.md`; voice + input: `docs/VOICE.md`; art sheets: `docs/art/`.
