# Owlet's Snow Garden: high-speed playtest report

This report only measures the game. Nothing in `game/` was changed. All proposals below were re-simulated with
`new SG.World({ config })` overrides, or with a speech-policy flag in the simulator's main.js mirror.

**Tools added (`tests/sim/`)**

| file | what it does |
|---|---|
| `playtest.js` | Headless matrix runner (worker threads). Child models, invariant checks every 4th update, tap-guard instrumentation, a `MainSpeech` mirror of main.js's voice policy fed through a `VoiceQueue` model of voice.js (MAXQ 2, 5 s stale, interrupt = flush + cancel + 90 ms), and absent-child runs. Usage: `node tests/sim/playtest.js --n 60 --name base`, then `--config '{…}' --policy '{…}'`, then `--report a,b`. |
| `playtest_report.js` | Builds the markdown tables (`tests/sim/out/pt_<name>.md`). |
| `browser_speed.js` | Plays a real Chromium session with the bot at `?speed=8` (ages 3 and 4). It records every `SG.Voice.say()` and every world event with game time, then replays them through the queue model. |
| `pad_scan.js` | Scans `potPadUp × playPotGap` and reports pack scale, seeds resting in a drop zone and miss rates. |
| `out/.gitignore` | Raw JSON dumps (up to 13 MB) stay out of git. The `.md` tables are kept. |

**Volume:** 2 700 baseline sessions (5 ages × 9 drivers × 60, 4 viewports, en and vi alternating), 100 absent-child runs,
4 × 1 000 sessions for the variant comparison on the same seeds (`base2`, `pad`, `time60`, `prop`), 240 tapper and
spammer sessions before and after, 240 `chapterMinRounds` sessions, the 1 920-round pad scan, 12 800 packing rounds,
and 2 real browser sessions. All times are game seconds.

## 1. Verdict

| check | result |
|---|---|
| exceptions, NaN, overfull pot, structural "no progress possible" | **0** in 2 700 + 4 240 sessions |
| every round completable / session finishes | 100 % for every child model and bot. The random tapper finishes 93–100 % within 40 min. All 62 of its "stuck" rounds are random play over 300 s, none are structural. |
| resting seed off-screen / seeds overlapping at rest / resting in a drop zone / unreachable home | **0 / 0 / 0 / 0** over 7.4 M checks |
| taps judged as drops | **0** of 114 000 taps (tap guard holds) |
| hint cooldown | min gap between hints 6.0 s (cooldown 6 s respected) |
| idle nudge spacing | 12 → 18 → 27 → 30 → 30 … s. **They never stop**: 21 spoken nudges in 10 min for an absent child. |
| Talk time, nobody answers | 25 re-asks in 5 min, **only 3 spoken**, answer glows from the 2nd. State kept, and the session finishes afterwards. |
| ask mode: same animal twice in a row | 0 of 17 894 consecutive asks |
| counting lines in count rounds | 100 % of rounds start every number. Child models hear 100 % of them to ≥ 60 %. The **random tapper hears only 67 %**, because taps interrupt the count. |
| typical 4-year-old session | 346 s (p90 375); chapter 86 s, but only **68 % of chapters are in 60–100 s** (p90 105 s) |
| drops 60–120 px above the pot rim | **49 % are misses** (1.28 hints per round), the biggest feel problem found |

## 2. Durations (baseline, mean / p90; complete table in `tests/sim/out/pt_base.md`)

| driver | age 3 session | age 4 session | age 5 session | age 4 chapter (mean / p90) | age 4 chapters 60–100 s | age 4 ≤ 8 min |
|---|---|---|---|---|---|---|
| bot 0.3 | 230 / 250 | 264 / 283 | 310 / 335 | 66 / 83 | 68 % | 100 % |
| bot 0.6 | 195 / 209 | 222 / 242 | 263 / 283 | 55 / 68 | 35 % | 100 % |
| bot 0.9 | 169 / 181 | 191 / 203 | 225 / 245 | 48 / 56 | 2 % | 100 % |
| typical kid | 332 / 358 | 346 / 374 | 363 / 388 | 87 / 104 | 64 % | 100 % |
| toddler (35 % random pot) | 377 / 407 | 418 / 483 | 515 / 580 | 105 / 132 | 47 % | 88 % |
| slow 3-year-old | **435 / 474** | 551 / 617 | 689 / 778 | 138 / 184 | 16 % | 3 % |
| drops high (rim + 60–120 px) | 351 / 380 | 380 / 414 | 427 / 463 | 95 / 115 | 65 % | 100 % |
| spammer | 199 / 220 | 290 / 326 | 340 / 384 | 73 / 103 | 57 % | 100 % |
| random tapper | 676 / 895 | 1037 / 1610 | 1363 / 2003 | 259 / 454 | 7 % | 0 % |

The slow 3-year-old model is only realistic at the age-3 setting: 92 % of those sessions are ≤ 8 min. Bots are much
faster than children, so their short chapters are expected. The slowest topics for a typical 4-year-old are colours
and shapes with 3 pots × 2 seeds (22 s per round, p90 30 s). Count rounds are the quickest (12 s).

## 3. Help, stars, input, Talk (pooled over ages)

| driver | hints / round | min hint gap | stars / session (max 52) | rounds 3★ / 2★ / 1★ | wrong / drop | miss / drop | Talk right |
|---|---|---|---|---|---|---|---|
| bot 0.3 | 0.43 | 6.0 | 34.1 | 37 / 24 / 40 % | 21.6 % | 8.4 % | 64.6 % |
| bot 0.6 | 0.13 | 6.0 | 41.5 | 56 / 28 / 16 % | 12.1 % | 4.8 % | 79.8 % |
| bot 0.9 | 0.01 | – | 49.6 | 87 / 11 / 1 % | 2.9 % | 1.3 % | 95.7 % |
| typical | 0.08 | 6.1 | 43.4 | 68 / 22 / 10 % | 8.5 % | 3.8 % | 76.1 % |
| toddler | 0.48 | 6.1 | 29.8 | 43 / 24 / 33 % | 20.3 % | 8.9 % | 60.2 % |
| slow 3-year-old | 0.82 | 6.0 | 28.6 | 46 / 24 / 31 % | 16.7 % | **19.8 %** | 55.2 % |
| drops high | **1.29** | 6.0 | 44.7 | 100 / 0 / 0 % | 0 % | **49.5 %** | 90.3 % |
| random tapper | 9.67 | 6.0 | 18.9 | 19 / 6 / 75 % | 12.6 % | 43.0 % | 36.5 % |
| spammer | 1.97 | 6.0 | 23.5 | 19 / 6 / 75 % | 27.6 % | 23.1 % | 35.6 % |

Stars track skill and never go below 1 per round. A miss (a drop outside every pot) costs no star but triggers hints
and "Oops" lines. For the drops-high child that means a **hint in 67 % of rounds** even though they know every answer.
Talk accuracy equals each model's input accuracy, so the Talk flow does not distort answers.

## 4. Voice (main.js policy → voice.js queue model)

| driver | lines / min | MAXQ drops / min | max pending | cut before half / min | same line back-to-back < 2 s (per session) | count rounds heard ≥ 60 % |
|---|---|---|---|---|---|---|
| bot 0.6 | 38.9 | 0.01 | 3 | 8.0 | 1.3 | 100 % |
| typical | 31.3 | 0.00 | 3 | 2.5 | 0.1 | 100 % |
| toddler | 25.0 | 0.00 | 2 | 1.0 | 0.1 | 100 % |
| slow 3-year-old | 21.2 | 0.00 | 2 | 0.6 | 0.2 | 100 % |
| drops high | 30.1 | 0.02 | 3 | 2.5 | 1.3 | 100 % |
| random tapper | 48.7 | 0.06 | 3 | 11.4 | **156** | **58.5 %** |
| spammer | 93.0 | 0.23 | 3 | 50.6 | 46 | 21 % |

* The repeated lines are the **seed names**: "blue", "blue seed", "star"… A tap speaks with `interrupt` every time.
  A grab re-says the name when the child re-grabs the same seed after a miss, because the throttle is only 0.7 s.
* Taps also **cut the counting** ("One! — blue — Three!").
* A 3rd queued line (max pending 3) happens only in animals (ask) rounds. A queued "Now the snow hare!" can still be
  waiting when the next correct drop queues "Now the seal!". On a slow device the **stale target line** can then be
  spoken after the target has moved on.

### Real browser at ?speed=8 (Chromium, bot skill 0.8)

| age | session | voice lines | errors | queue overflow (3rd line) | same line back-to-back < 2 s | count rounds |
|---|---|---|---|---|---|---|
| 3 | 167 s | 85 | 0 | 2 (both animals: stale "Now the snow hare!" + seed name queued behind "Plant a flower for the seal!") | 0 | – (no count topic at 3) |
| 4 | 189 s | 102 | 0 | 2 (animals, same pattern) | 0 | N=3: One Two Three · N=3 · N=3 · N=2: One Two (all present) |

At speed > 1, main.js mutes the synthesizer but still calls `SG.Voice.say`. Its throttles use wall-clock ms, so at ×8
they cover 8× more game time and the browser run under-counts spam. The headless model above uses game time.

## 5. Content variety (consecutive rounds inside one chapter, from the baseline run)

| age | topic | identical pot set | shares ≥ 1 label | note |
|---|---|---|---|---|
| 3 | size | 100 % | 100 % | only big and small exist (by design) |
| 3 | colours (2 pots) | 9 % | 67 % | colour-blind rule leaves 4 colours |
| 4 | colours (3 pots) | 10 % | 97 % | 3 of 4 safe colours each round, so a repeat is unavoidable |
| 4 | animals | 2 % | 77 % | first target animal same as previous round: 11.6 % |
| 4 | count | **22.5 % same N** | – | **same seed colour 17.8 %** (random, no memory) |
| 5 / 6 | count | 9.5 % / 8.4 % same N | – | same colour 17 % |
| 7 | odd/even | 100 % | 100 % | by design |

Count N (rounds 1–3): age 3–4 gives 2–5 evenly (warm-up 1–3), age 5 gives 3–10 evenly, age 6–7 gives 4–12 evenly.
No skew was found.

## 6. Absent child

| | baseline | proposed (`idleBackoff 2, idleMax 60` + speak only the first 4 nudges per round) |
|---|---|---|
| idle nudges in 10 min | 21 (12, 18, 27, then every 30 s forever) | 11 (12, 24, 48, then every 60 s) |
| idle lines spoken in 10 min | **21** | **4** |
| Talk re-asks spoken in 5 min | 3 of 25 | 3 of 25 |
| state kept, session finishes after | 100 % | 100 % |

None of the playing child models ever reached an idle nudge (0.0 per session), so this change only affects an empty room.

## 7. Recommended changes and before/after (same seeds; 40 sessions × 5 ages per driver)

### CONFIG (`game/js/world.js`)

| key | old → new | why |
|---|---|---|
| `potPadUp` | 90 → **120** | Children release high above the pot. Today 49 % of 60–120 px-above-rim drops miss. |
| `playPotGap` | 44 → **74** | Needed with the taller zone so resting seeds stay out of it (64 still leaves 3 217 homes inside). |
| `chapterTimeLimit` | 75 → **60** | Puts a typical 4-year-old's chapters into the 60–100 s target. |
| `idleBackoff` | 1.5 → **2** | Fewer nudges to an empty room. |
| `idleMax` | 30 → **60** | Same reason. |

Re-simulated with the config overrides:

| metric | base2 | pad only | time60 only | **all (prop)** |
|---|---|---|---|---|
| drops-high: miss / drop | 49.1 % | 0.0 % | 48.9 % | **0.0 %** |
| drops-high: hints / round | 1.28 | 0.00 | 1.27 | **0.00** |
| drops-high age 4: session | 374 s | 267 s | 347 s | **267 s** |
| slow 3-year-old: miss / drop | 19.6 % | 8.8 % | 19.6 % | **8.7 %** |
| slow 3-year-old age 3: session mean / p90 | 433 / 483 | 405 / 437 | 418 / 482 | **374 / 408** |
| slow 3-year-old age 3: ≤ 8 min | 85 % | 100 % | 88 % | **100 %** |
| slow 3-year-old age 3: chapters 60–100 s | 36 % | 51 % | 45 % | **75 %** |
| typical age 4: session mean / p90 | 346 / 375 | 345 / 368 | 301 / 319 | **300 / 318** |
| typical age 4: chapters 60–100 s | 68 % | 68 % | 93 % | **92 %** |
| typical age 3 / 5: chapters 60–100 s | 93 / 84 % | 93 / 83 % | 96 / 97 % | **97 / 99 %** |
| toddler age 3: chapters 60–100 s | 69 % | 72 % | 98 % | **99 %** |
| toddler age 4: session p90, chapters 60–100 s | 465 s, 39 % | 439 s, 43 % | 454 s, 43 % | **435 s, 49 %** |
| typical age 4: rounds / chapter, stars | 3.85, 41.9 | 3.87, 40.9 | 3.38, 37.4 | 3.39, 36.8 |
| bot 0.6 (accurate dropper) | 223 s | 226 s | 223 s | 226 s (unchanged) |
| exceptions / stuck / resting in zone / overlap / off-screen / tap → drop | 0 | 0 | 0 | **0** |
| worst pack scale | 0.85 | **0.70** | 0.85 | 0.70 (see content change C1) |

Pad scan (bot 0.9, all ages × 4 viewports, 1 920 rounds each):

| potPadUp / playPotGap | worst pack | homes in a drop zone | miss: drops high | miss: slow 3-year-old |
|---|---|---|---|---|
| 90 / 44 (today) | 0.85 | 0 | 48.6 % | 18.8 % |
| 100 / 54 | 0.80 | 0 | 33.1 % | 15.8 % |
| 110 / 64 | 0.70 | 0 | 15.4 % | 11.9 % |
| **120 / 74** | 0.70 | 0 | **0.0 %** | **8.9 %** |
| 120 / 64 | 0.70 | 3 217 | 0.0 % | 9.0 % |

The 0.70 pack scale happens in only one case out of 12 800 generated rounds: **iPad landscape, age 3, size rounds
with 5 seeds** (big seeds are 1.3 × 116 px). Every 4-seed size round and every other topic stays at ≥ 0.75.

Optional, not in `prop`: `chapterMinRounds` 3 → 2 (with limit 60). Toddler age 4 chapters in 60–100 s go from
49 % to 84 % (session 390 → 334 s), and slow 3-year-old from 75 % to 83 %, but chapters drop to 2.8 rounds. Use it only
if real children still tire.

### Small code changes (stand-ins re-simulated with simulator policy flags)

| # | where | change | effect (sim) |
|---|---|---|---|
| M1 | `main.js` `case 'idle'` | Count idle events per round; `speak()` only for the first 4 (Lumi still does the think pose and the seeds wiggle). This mirrors Talk's `e.n <= 3`. | Absent child: 21 → **4** spoken nudges / 10 min |
| M2 | `main.js` `case 'tap'` and `case 'grab'` | A tap is no longer `interrupt`: speak only if `!SG.Voice.isSpeaking()`. Skip a tap or grab name if the same name was spoken < 3 s ago. | Tapper: back-to-back repeats 166 → **2.3** per session, lines/min 49 → 31, count rounds heard 67.5 % → **100 %**. Spammer: repeats 45 → 11. Typical kid: 0.1 → 0.0. |
| M3 | `main.js` `case 'ask'` (not first) | Before queuing `p.animalsNext`, remove any queued, not-yet-started ask, askNext or seed-name line (needs a small `SG.Voice.dropQueued(predicate)` or a tag in `say` opts). | No stale "Now the snow hare!" after the target moved on (2 per session at ×8 in the browser). Drops-high max pending 3 → 2. |
| C1 | `content.js` size round | `cnts = warm ? [1, 1] : rng.pick([[2, 2], [2, 3], [3, 2]])` → `rng.pick([[2, 2], [1, 3], [3, 1]])` (always 4 seeds) | Keeps every round ≥ 0.75 pack scale with `playPotGap 74` (the only < 0.75 case was the 5-seed size round). It also shortens the slowest age-3 round (size: 19.4 s typical). |
| C2 | `content.js` count / `world.js` `_beginRound` | Pass the previous count round's `{n, color}` and re-roll N and the seed colour once if they repeat. | Same N twice in a row 22.5 % → about 0 %. Same colour 17.8 % → 0 %. Variety only, no timing change. |

## 8. Not changed (checked and fine)

* Hint after 2 misses, glow 3 s, cooldown 6 s: the min observed gap is exactly 6.0 s.
* The tap guard (`tapMovePx 24`, `tapTime 0.35`) sends 0 taps through as drops. Quick flicks (> 24 px in < 0.35 s)
  count as drops, which is intended.
* Talk re-ask every 12 s, glow from the 2nd, voice stops after 3: works as designed.
* Packing, overlap, safe areas, HUD and Lumi exclusion: 0 violations on 4 viewports.
* Ask queue: never the same pot twice in a row. Every pot is asked.

## Applied (lead + mechanics, 2026-10-31)
Config: `potPadUp` 120, `chapterTimeLimit` 60, `idleBackoff` 2, `idleMax` 60, `playPotGap` → `layout.playGap` = max(74, flower-head clearance).
Code: M1 (≤ 4 spoken idle nudges per round), M2 (seed names only when Lumi is quiet, no repeat within 3 s, taps never interrupt),
M3 (`Voice.dropQueued()` before "Now the …!"), C1 (size rounds 2+2 / 1+3 / 3+1), C2 (count N and colour never repeat back-to-back).
Re-sim (mechanics): typical age 3/4 chapters 77/76 s, high drops 0 % misses, absent child 6 nudges in 5 min.
