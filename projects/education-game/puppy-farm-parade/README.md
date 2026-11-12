# Bo's Farm Parade · Cún Bo Tìm Bạn Lạc Đàn

An odd-one-out learning game for children aged 3–7 (default 4). Bo, a little caramel puppy with one dark-brown ear and a
leather collar, leads the farm's parade. A little parade marches in along the farm path — buckets, boots and toy tractors
riding wooden wagons, shape blocks, apple crates or farm animals — and Bo asks "They're all red… but one! Which one is NOT
red?". The child taps the one that doesn't belong: Bo barks "woof!", it **boings out of the line in a big hop** onto the
hay-bale stage and Bo says why ("The blue bucket! It's not red."); apple crates are counted aloud, animals that don't live
on the farm show their home. Then "Open the barn!" — tap the doors, they swing open, and the friends **march into the barn
in step** while the weathervane spins and stars burst from the roof. The day passes from a misty morning to a bright noon,
a warm sunset and a starry night with fireflies.

Made on 2026-11-12 with `/build-education-game random 4` (mechanic family *seek*, odd one out; see `REQUIREMENT.md`).

**Play:** https://phanlinh86.github.io/claude-learning/projects/education-game/puppy-farm-parade/game/

## Ages and topics (4 chapters per session, easiest first)
| age | chapters |
|---|---|
| 3 | colours (3 members) · shapes · big & little ("Which one is the little one?") · animals (the same animal + one other) |
| 4 (default) | colours ("not red", 3–5 members) · shapes ("not a circle") · counting 1–5 (apple crates) · animals (who doesn't live on the farm) |
| 5 | shapes with mixed colours · counting 1–10 · capital letters · animals (4–5 members) |
| 6 | capital ↔ small letters · first letter of a word · adding within 10 · counting to 12 |
| 7+ | adding within 20 · taking away within 10 · first letter · odd & even |

## How to play
- Listen to Bo (or read the bubble) and **tap** the one that is different — a quick flick that starts just beside it
  counts too.
- Right → it hops onto the hay bale and Bo says what it is and why. A matching one → it does a little "no-no" wiggle and
  Bo kindly says it matches its friends, then repeats the goal. Taps on the empty path only puff a little dust.
- After two tries the odd one glows and a ghost hand taps it; no losing, no timers. Stars: 3 / 2 / 1 per round.
- "Open the barn!" — tap the doors (or any friend); after 4 s they open by themselves.
- After each chapter: **Talk time** — one question with 2–3 picture answers (tap, or say the answer if the mic is on).
- Surprises: a chick joins the end of the parade (tap: it peeps and flaps, and marches in too), a rooster lands on the
  fence (tap: "cock-a-doodle-doo!"), fireflies at night (tap: they twinkle). At the end all the friends parade out of the
  barn while Bo dances.

## On iPhone / iPad
1. Open the link in Safari and tap once (iOS only allows sound after the first tap).
2. Sound is loud by default and plays through the media volume; adjust it in settings or with − / + in the pause menu.
3. Optional: **Share → Add to Home Screen** for a full-screen icon.
4. Vietnamese voice: Settings → Accessibility → Spoken Content → Voices → Vietnamese → download "Linh".

## For parents
Hold ⚙ on the title screen for 2 seconds: age (3, 4, 5, 6, 7+), language (English / Tiếng Việt), child's name, volume,
sound effects, music, Bo's voice, answering by talking. Nothing leaves the device; all art is original and all sound is
synthesized. If nobody plays for about 2 minutes the game pauses.

## Develop
```bash
cd projects/education-game/puppy-farm-parade
python3 -m http.server -d game 8000        # then open http://localhost:8000
node tests/unit/run.js                     # mechanics: layout, content, world (walking, hop, count, gate, march), weather, bot
node tests/unit/i18n_voice.test.js         # language + voice + input layer
node tests/unit/parade_art.test.js         # canvas parade art (wagons, blocks, crates, tiles, stage, badges, icons, hand)
node tests/e2e/smoke.js                    # REAL touch tap on the odd one + the barn doors + fast bot sessions, iPhone
node tests/e2e/functional.js               # full functional QA on 4 devices + 10 bot sessions (≈ 11 min)
node tests/visual/screens.js               # visual QA screenshots × 4 devices × EN / VI (tests/out/visual)
node tests/sim/hs_playtest.js --n 60       # high-speed headless playtest (child models, report in tests/sim/out/)
```
URL switches: `?speed=8&bot=1&autostart=1&autorestart=1&seed=3&mute=1&debug=1&age=5&lang=vi&level=2&novoice=1&skill=0.6`
(never saved). `window.FP.debug` exposes the world, state, the event log and controls (`memberScreen(id)`, `doorScreen()`,
`boScreen()`, `chickScreen()`, `roosterScreen()`, `fireflyScreen()`, `answer()`, `toScreen(x, y)`, `audio()`, `voiceLog`,
`setSpeed(n)`, `setBot(on, skill)`, `gotoLevel(i)` …).

Design contract: `docs/DESIGN.md`; tuned numbers + render contract: `docs/MECHANICS.md`; voice + input: `docs/VOICE.md`;
team notes + integration decisions: `docs/reports/`; art sheets: `docs/art/`.
