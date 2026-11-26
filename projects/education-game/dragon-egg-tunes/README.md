# Rio's Singing Eggs · Trứng Biết Hát Của Rồng Rio

A listen-and-repeat music learning game for children aged 3–7 (default 4). Rio, a tiny mint baby dragon, lives in a
dinosaur valley where the eggs sing. Big eggs sit in straw rings on little floating mossy islands. "Listen to my tune!" —
Rio sings a glowing spark to the red egg (*la!*), then to the blue egg (*do!*), naming each one. "Your turn!" — the child
taps the eggs in the same order: each egg wobbles, hops and sings, and a seed-pod lantern on the vine blooms. A wrong egg
just bonks softly; Rio says what it was and plays the rest of the tune again. Counting: Rio taps the big spotted egg three
times ("One, two, three!") and the child copies. Animals: baby animals peek out of cracked eggs — "Quack! The duckling!"
When the tune is done, all the eggs sing it together and the little volcano puffs a ring of sparkles. The day passes from
a pink morning to a bright noon, a golden sunset and a starry night with fireflies.

Made on 2026-11-26 with `/build-education-game random 4` (mechanic family *music*, "copy my tune"; see `REQUIREMENT.md`
for the roll and why the rolled jigsaw was swapped).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/dragon-egg-tunes/game/

## Ages and topics (4 chapters per session, easiest first)
| age | chapters | tune |
|---|---|---|
| 3 | colours (2 eggs) · shapes (2) · big & small egg · baby animals (2) | 1–2 notes |
| 4 (default) | colours (3) · shapes (3) · counting 1–5 (copy Rio's taps on the big egg) · baby animals (3, by their sound) | warm-up 1, then 2–3 |
| 5 | shapes with mixed colours (4) · counting 1–10 (spotted eggs) · capital letters · baby animals (4) | 2–3 |
| 6 | capital ↔ small letters · first letter of an animal's name · adding within 10 · counting to 12 | 3–4, pods hidden |
| 7+ | adding within 20 · taking away within 10 · first letter · odd & even | 3–4, pods hidden |

## How to play
- **Listen:** Rio plays the tune — sparks fly to the eggs, each egg sings and Rio names it. Taps during the tune are harmless.
- **Your turn:** tap the eggs in the same order. The vine shows the tune as little pictures (ages ≤ 5) and the next pod pulses.
- Right → the egg sings and its pod blooms. Another egg → a soft bonk, kind words, and Rio replays the rest. After two tries
  the right egg glows and a ghost hand taps it. No losing, no timers. Tap Rio to hear the tune again.
- Then sing it together: tap any egg (or wait) — all the eggs sing in a wave and the volcano puffs sparkles.
- After each chapter: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises: a baby triceratops trots by (tap: a happy hop and a tiny "rawr"), a little bird on the vine (tap: it sings your
  last note), fireflies at night.

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
cd projects/education-game/dragon-egg-tunes
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics: layout, content, demo/echo world, judging, beat copy, song, weather, bot
node tests/unit/i18n_voice.test.js         # language + voice + input layer
node tests/unit/egg_art.test.js            # canvas egg art (eggs, islands, pods, volcano, tablet, spark, icons)
node tests/e2e/smoke.js                    # REAL touch taps + fast bot sessions, iPhone
node tests/e2e/functional.js               # full functional QA on 4 devices (≈ 22 min; ONLY=, TESTS=, SKIP_BOT=1, BOT_ONLY=1)
node tests/visual/screens.js               # visual QA screenshots (tests/out/visual)
node tests/sim/hs_playtest.js --n 60       # high-speed headless playtest (child models incl. demo tappers)
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&nodemo=1&skill=0.6`
(never saved). `window.SE.debug` exposes the world, state, the event log and test controls.

Design contract: `docs/DESIGN.md`; tuned numbers + render contract: `docs/MECHANICS.md`; voice + input: `docs/VOICE.md`;
QA reports: `docs/reports/`; art sheets: `docs/art/`. The drum game this started from: `docs/drums_ref/`.
