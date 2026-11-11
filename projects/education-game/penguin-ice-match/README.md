# Tuk's Ice Match · Cánh Cụt Tuk Lật Băng

A memory learning game for children aged 3–7 (default 4). Tuk, a round little penguin chick in a cherry-striped knitted hat,
plays on a frozen lake. Frosty **ice blocks** sit on the ice, each with a picture frozen inside. Tuk lets the frost melt
for a moment so the child can peek, then the frost grows back. The child **taps a block — or rubs it with a finger — and
the frost cracks off** in a spray of ice shards while Tuk says what is inside. Two blocks that match **glide together across
the ice, clink and melt**, and the picture comes alive: a fish of that colour leaps out and splashes into the sea, a snow
sculpture of the shape slides to the shore, fish jump out one by one to be counted, or an animal hops off to its home.
The weather changes as you play: a sunny morning, a snowy breeze, a soft rain, and a rainbow party at the end.

Made on 2026-11-11 with `/build-education-game random 4` (mechanic family *memory*; see `REQUIREMENT.md` for the roll, the
one swap — koala → penguin — and how it differs from yesterday's Kiki's Camp Chimes and from Dee's Forest Memory).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/penguin-ice-match/game/

## Ages and topics (4 chapters per session, easiest first)
| age | chapters |
|---|---|
| 3 | colours · big & small · shapes · animals (two of the same) |
| 4 (default) | colours · shapes · counting 1–5 (numeral ↔ fish) · animal homes (animal ↔ its home) |
| 5 | shapes in mixed colours · counting 1–10 · capital letters · animal homes |
| 6 | capital ↔ small letter · first letter · adding within 10 · counting to 12 |
| 7+ | first letter · adding within 20 · taking away within 10 · odd & even |

Polar friends and homes: polar bear ↔ snow den, seal ↔ ice floe, arctic fox ↔ burrow, snowy owl ↔ nest, whale ↔ sea,
puffin ↔ cliff, penguin chick ↔ pebble nest (plus an arctic hare and a walrus calf).

## How to play
- Listen to Tuk (or read the bubble). Tap a frosty block — or rub across blocks with one finger — to crack the frost off.
- Find two blocks that go together. A match glides together, clinks and melts; no match wobbles and frosts over again with
  kind words. After three tries in a row without a pair, one pair glows and peeks. No losing, no timers. Stars: 3 / 2 / 1.
- Surprise round each chapter: a frosty block glides to a new spot, a golden pair under the aurora, or blocks on bobbing ice floes.
- After each chapter: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language, child's name, volume, sound effects, music,
Tuk's voice, answering by talking. Nothing leaves the device. If nobody taps for about two minutes the game pauses itself.

## Develop
```bash
cd projects/education-game/penguin-ice-match
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics unit tests
node tests/unit/i18n_voice.test.js         # language + voice tests
node tests/e2e/smoke.js                    # one real touch tap + bot sessions on iPhone/iPad viewports
node tests/e2e/functional.js [groups]      # real touch, gate, settings, volume, phases, rotation, talk time… (~25 min)
node tests/visual/capture.js               # screenshots into tests/out/visual
node tests/sim/playtest.js                 # headless playtests; tests/sim/pt_*.js for child models
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.IM.debug` exposes the world, state and controls.
