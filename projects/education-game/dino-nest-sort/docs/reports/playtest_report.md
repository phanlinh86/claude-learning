# Dino Nest Sort — high-speed playtest report

Report only: no game code was changed. Everything below comes from headless simulations in `tests/sim/`. Proposed
changes were re-simulated in three ways: CONFIG overrides through `new DN.World({ config })`, monkey-patches that live
only inside the sim sandbox (`tests/sim/variants.js`), and a speech-policy model that mirrors `main.js` + `voice.js`.

**Verdict: no blocker, but needs tuning.** The engine is solid. Across 3 840 baseline sessions and ~13 000 variant
sessions there were 0 errors, 0 invariant breaks, 0 structurally stuck rounds, 0 unreachable items and fully
deterministic replays. The problems are in **feel and pace for small children**:
- Tapping an item counts as a drop.
- Chapters run too long for 3–4-year-olds.
- Hints spam when a child plays at random.
- Bo cuts himself off on every round end, and never says the final number in a count round.
- Two Talk-time questions need reading at ages 3–4.

> Code version: these numbers come from the code as it stood at 23:10 (md5 list in `tests/sim/out/code_md5_run2.txt`).
> That already includes the visual-QA changes made during this playtest (portrait item band ×1.2, `spreadPick`
> packing, colour-blind colour pairs, no `I` in the lower-case pool). Older runs were thrown away.

---

## 1. How it was tested

| | |
|---|---|
| Harness | `tests/sim/lib.js` loads `rng, i18n, content, world, bot` into a node `vm` with a fake `window` (same as `tests/unit/load.js`). It drives only the public API: `pointerDown/Move/Up`, `talkAnswer`, `cancelDrag`. Frames are 1/30 s; the world runs fixed 1/120 s steps. |
| Matrix | 5 ages (3–7) × 2 languages (en, vi) × 4 viewports × 12 drivers × 8 seeds = **3 840 full sessions** (`node tests/sim/run_matrix.js --n 8`, ≈ 8 min on 2 cores). Each variant: 9 drivers × 4 seeds = 1 440 sessions on the same seeds as `baseline_sub`. |
| Viewports (logical, insets converted from CSS) | iPhone portrait 720×1556 (insets top 108, bottom 62) · iPhone landscape 1556×720 (left/right 108, bottom 38) · iPad landscape 960×720 (top 32, bottom 27) · iPad portrait 720×960 (top 32, bottom 27) |
| Drivers | `DN.Bot` at skills 0.3 / 0.6 / 0.9 / 1.0, plus the child models below |
| `toddler` | Hand 300–500 px/s with an 18 px wobble. Reaction 1–3 s. Picks a random nest 35 % of the time. 30 % of drops are released 60–150 px above the nest centre, 20 % just beside or below it (5–45 px outside), 8 % mid-way. Grabs off-centre and sometimes re-grabs items that are on their way home. |
| `typical` | Age-scaled kid: reaction 1.6–2.4 s at age 3 down to 0.7–1.2 s at age 7; hand speed 400–650 → 700–1000 px/s; random nest 20 % → 8 %. |
| `dropsHigh` | Always the right nest, always released 60–120 px above the nest centre. |
| `beside` | Always the right nest, released 5–45 px outside the nest sprite (side or below). |
| `tapper` | Random items dragged to random points, 30 % taps in place, 15 % taps on empty space. |
| `spammer` | Grab/release every 30–220 ms. Grabs items in every state (incl. flying and returning), teleports and flings to nests, tries a second grab while holding, calls `cancelDrag` at random, answers Talk twice. |
| `idleKid` | Does nothing for 30 s in round 3 of every chapter, then waits 30 s before answering Talk time. |
| `bruteForce` | Tries the nests left → right until one accepts (the "no understanding" exploit). |
| Speech model | Mirrors `main.js onEvent` + `voice.js` (interrupt = flush + cancel, MAXQ 2, stale 5 s, grab names only when silent and ≥ 0.7 s apart, every other miss). Line length ≈ 0.25 s + words / 2.3 (en) or syllables / 3.0 (vi). A "cut" means a line that was interrupted before it finished. |

Other scripts: `tap_test.js` (tap every item in place), `determinism.js`, `content_stats.js` (variety and Talk
questions), `idle_absent.js`, `compare.js` (variant vs same-seed baseline), `summarize.js`. Raw outputs are in `tests/sim/out/`.

---

## 2. Baseline results

### 2.1 Durations, stars, help (game seconds; 64 sessions per cell = 2 languages × 4 viewports × 8 seeds)

| driver | age | session s (mean / p90) | chapter s (mean / p90) | round s | 1st correct s* | stars /64 | hints/min | near-nest misses |
|---|---|---|---|---|---|---|---|---|
| **toddler** | 3 | **517 / 572** | **129 / 151** | 21.9 | 6.1 | 48.6 | 0.7 | 4.2 % |
| **toddler** | 4 | **686 / 765** | **171 / 225** | 30.3 | 6.3 | 41.9 | 1.2 | 2.4 % |
| toddler | 5 | 900 / 1002 | 225 / 307 | 41.0 | 6.7 | 38.7 | 1.6 | 2.4 % |
| **typical** | 3 | 416 / 442 | 104 / 116 | 16.9 | 4.7 | 54.7 | 0.2 | 1.5 % |
| **typical** | 4 | 465 / **498** | 116 / 142 | 19.4 | 4.3 | 51.7 | 0.3 | 0.6 % |
| **typical** | 5 | **507 / 551** | 127 / 157 | 21.6 | 3.9 | 50.6 | 0.3 | 0.6 % |
| typical | 6 | 358 / 385 | 90 / 107 | 14.2 | 3.2 | 57.5 | 0.1 | 0.5 % |
| typical | 7 | 316 / 333 | 79 / 90 | 12.1 | 2.7 | 57.1 | 0.1 | 0.3 % |
| bot 0.3 | 3–7 | 286–410 | 71–102 | 10.8–17.0 | 3.2–3.5 | 37–45 | 1.8–2.9 | 0 |
| bot 0.6 | 3–7 | 238–337 | 60–84 | 8.4–13.4 | 2.7 | 47–53 | 0.6–1.0 | 0 |
| bot 1.0 | 3–7 | 194–270 | 48–68 | 6.2–10.0 | 2.1 | 64 | 0 | 0 |
| dropsHigh | 3–7 | 249–364 | 62–91 | | | 63.5 | 0 | **0 %** (every high drop accepted) |
| beside | 3 / 4–7 | 331 / 449–586 | | | | 63.6 / 44–50 | 1.1–3.5 | **20.8 % / 9–11 %** |
| idleKid | 3–7 | 535–704 | 134–176 | | | 54–60 | 0.1 | 0.5–1 % |
| tapper | 3–7 | 55/64 sessions finish at age 3, 0/64 at age 5 (30 min cap) | 345–652 | 66–139 | 17–21 | 23–33 | **33–36** | 1–4 % |
| spammer | 3–7 | 222–498 | 55–124 | | 1.6–2.1 | 23–32 | **41–59** | 0 |
| bruteForce | 3–7 | 263–509 | | | | 21–31 | 0–7 | 0 |

\* Time to first correct drop is measured from the `round` event, so it includes the ≈ 0.5–0.9 s pop-in.

Stars per round (share of 3 / 2 / 1 stars): typical age 3 68/25/8 %, age 4 60/23/16 %. Toddler age 3 50/31/19 %,
age 4 39/18/43 %. bruteForce 0–25 / 0–15 / 75–85 %. tapper 11–25 / 1–14 / 74–82 %. Stars separate real play from
random play well, and the 1-star floor keeps it kind.

### 2.2 Robustness (all 3 840 sessions)

| check | result |
|---|---|
| Errors thrown / invariant breaks (NaN position, over-full nest, `reserved > slots`) | **0 / 0**, including 640 spammer sessions with multi-grab, flings, `cancelDrag` and grabs during `fly`/`return` |
| Structurally stuck rounds (nothing grabbable or in flight while the round is unfinished) | **0** |
| Rounds > 300 s | 126, all from the random `tapper` (rounds are completed by chance; nothing is blocked) |
| Unreachable items (outside the safe area, under the HUD, behind Bo) | **0** of ~370 000 item placements |
| Items packed below 0.75× / pack fails | 0. Minimum scale 0.9 (iPad landscape) |
| Talk soft-lock | No lock: an answer is always possible. But a child who doesn't answer gets **0 events in 5 min** (no re-prompt, no timeout; F6). |
| One-nest dumper exploit (everything onto nest 1) | **No exploit**: 3 000 drops → 1 correct, 2 999 wrong, round never ends. But it fired **2 997 hints** (F3). |
| Count-mode brute force | Always 3 stars (the nest stops at N, so no counting is needed; P4) |
| Determinism | 10/10 cases give the same event hash on re-run **and** when 1/30 s-frame inputs are replayed at 1/120 s and 1/60 s frames (`tests/sim/out/determinism.md`). en and vi give identical worlds for ages 3–4 (language-neutral content), as expected. |
| en vs vi | Same session lengths (417 vs 420 s) and same speech-cut rates. Vietnamese lines are shorter in seconds. |

### 2.3 Viewports

| viewport | items resting inside a nest drop zone | tap on an item judged as a WRONG nest (`tap_test.js`) | min pack scale |
|---|---|---|---|
| iPhone portrait | 3.2 % | 1.6 % | 1.0 |
| iPhone landscape | 0.7 % | 0 % | 1.0 |
| iPad landscape | 6.5 % | 0 % | 0.9 |
| **iPad portrait** | **35.4 %** | **21.1 %** | 1.0 |

Why: the nest drop zone reaches `nestPadUp` = 90 px above the nest top, but the play area ends only `playNestGap` = 24 px
above it. Every item in the bottom row (centre ≈ 24 + size/2 ≈ 80 px above the top) therefore rests **inside** a
drop zone. The new `spreadPick` packing fills the corners, so the bottom row is almost always used.

### 2.4 Speech ("does Bo talk over himself?")

| | toddler | typical | bot 0.6 | tapper | spammer |
|---|---|---|---|---|---|
| speech-triggering events / min (grab, correct, wrong, miss, land, hint, idle, roundDone) | 36 | 50 | 78 | — | — |
| max triggering events in any 1 s / 3 s | 4 / 7 | 4 / 7–9 | 5–6 / 10–12 | 9 / 18 | 24 / 48 |
| lines Bo starts / min | 21 | 21 | 16 | | |
| lines cut / min (cut before half-way) | 6 (3) | 8–20 (4) | 23 (10) | 42 | 106 |

Top cut pairs ("line cut ← by"):
- `correct ← roundDone`: **85 % of all sort rounds**. The last praise is cut after ≈ 0.4 s by "Great job!".
- `count ← roundDone`: **9 600 / 9 600 count rounds**. The final number, i.e. the target N, is **never spoken**. It is queued and flushed in the same step.
- `correct ← correct`, `grab ← correct`, `round ← correct` for quick players.
- `hint ← hint`, `wrong ← hint`, `hint ← wrong` for random players: 8–28 per minute.

### 2.5 Idle

Idle prompts come exactly every 12.0 s (1 280 gaps measured; min 12.0). A 30 s pause gives 2 prompts, which is
fine. A child who walks away gets **24 prompts in 5 min**, forever, at the same rate (F5).

---

## 3. Findings

| # | severity | finding | evidence |
|---|---|---|---|
| F1 | **High** | **A tap is treated as a drop.** Tapping an item to hear its name (the most natural thing a 3-year-old does) is judged as a miss 100 % of the time ("Oops! Drop it in a nest!"). The 2nd tap fires the auto-hint. On iPad portrait **21 % of taps are judged a WRONG nest** (shake, "try again", −1 star) and 9 % drop the item into a nest by accident. | `tap_test.js`, §2.3 |
| F2 | **High** | **Chapters are too long for ages 3–4.** Toddler chapter 129 s (age 3) and 171 s (age 4) against a 60–100 s target. Typical session 465 s (p90 498) at age 4 and **507 s (p90 551)** at age 5 against ≤ 480 s. | §2.1 |
| F3 | **High** | **Hint spam.** Every miss after the 2nd on the same item fires a new hint and an interrupting voice line, even while the nest still glows: 33–36 hints/min for a random tapper, 41–59/min for a spammer, 2 997 hints in 3 000 drops for a one-nest dumper. Hints cut each other 8×/min. | §2.2, §2.4 |
| F4 | **High (pedagogy)** | **Size Talk at age 3 needs reading.** The choices are rendered as the words "big" / "small" (`ui.js _choiceVisual` has no `size` case). The question also shows one egg alone, so "big or small" has no reference. | `content_stats.js` Talk table |
| F5 | Medium | **Bo cuts himself off at every round end.** The final praise is cut by "Great job!" in 85 % of sort rounds. In count mode the **final number (N) is never said**: "one, two, three, … Great!" — the most important word in the round is lost. | §2.4 |
| F6 | Medium | **Talk time never re-prompts or times out.** A child who doesn't answer hears nothing more. Combined with F4, a 3-year-old can sit on a question they cannot read with no help. | `idle_absent.js` |
| F7 | Medium | **Near-nest misses above target for sloppy drops.** Toddler 4.2 % (age 3); a "just beside / below" drop is rejected 21 % of the time with 2 nests (age 3) and 9–11 % with 3–4 nests. `nestPadSide` = 30 px also sets the bottom pad. | §2.1 |
| F8 | Medium (pedagogy) | **Count Talk at ages 4–5 shows digits only.** The in-round count sign has dots, but the Talk choices are bare numerals. | Talk table |
| F9 | Medium (pedagogy) | **Difficulty ramp is flat or inverted.** Age 5 starts with its hardest chapter (shapes, 4 nests, 7.2 items, 3.6 errors/round for bot 0.3) and its easiest chapter (count) is 2nd. Ages 4, 6 and 7 put the easiest chapter (count/initial) 3rd or 4th. | §5 table |
| F10 | Medium (pedagogy) | **Count targets ignore `COUNT_RANGE[age][0]`.** The lower bound is hard-coded as `Math.min(2, r[1])`. Age 6 gets N ≤ 3 in 34 % of rounds and age 5 in 41 %. The round auto-stops at N, so blind dumping always earns 3 stars. | count histogram §5 |
| F11 | Low | **Idle nudges never back off.** 24 nudges in 5 min for an absent child. | §2.5 |
| F12 | Low | **Low variety in some chapters.** Size: every round is identical (2 nests, 4 eggs of one colour). Age-5 homes: all 4 homes in every round (100 % identical nest set). Colours at age 4: yellow 24 % vs green 13 %, a side effect of the new colour-blind pair rule. Initial Talk answers: B 24 % (4 words) vs D/H/A/R 5–6 %. | `baseline.content.md` |
| F13 | Info | **Verified OK:** high drops (60–120 px above the centre) are always accepted. Grabbing items on their way home works. Multi-grab is ignored safely. Flings count via the finger fallback. A full count nest with fruit still in the air bounces extras back without a penalty. The lower-case pool now excludes `I` (fixed during this run). | |

---

## 4. Recommended changes, re-simulated

### 4.1 CONFIG (`world.js` → `DN.CONFIG`)

| key | old → new | why | re-simulated gain (same seeds) |
|---|---|---|---|
| `nestPadSide` | 30 → **45** | Catches "beside / below" drops up to 45 px out (it also sets the bottom pad). Nests are ≥ 24 px apart and the nearest centre still wins, so neighbours are unaffected. | Near-nest misses: toddler age 3 **4.7 % → 0.0 %**, age 4 2.4 % → 0.0 %; beside 11.8 % → 0.0 %. Toddler misses per drop 8.8 % → 3.8 %. Toddler-3 chapter 128 → 123 s. |
| `playNestGap` | 24 → **44** | Resting items must sit *outside* the 90 px upward drop zone (bottom-row centre ≥ 44 + ½ size − jitter ≈ 92 px above the nest top). | Items resting in a drop zone: iPad portrait **35.4 % → 0.0 %**, iPad landscape 6.5 → 0.7 %, iPhone portrait 3.2 → 0.0 %. Taps judged a wrong nest: 21.1 % → **0 %**. Cost: min pack scale 0.9 → 0.8 on iPad landscape (floor 0.75, 0 pack fails). |
| `roundsPerLevel` | 5 → **4** | Main lever on length (F2). Each chapter still has a warm-up plus 3 real rounds. | With the 3 timing keys below: toddler-3 chapter **128 → 103 s**, typical-5 session **503 → 397 s** (p90 541 → 423), typical-4 466 → 363 s. Stars as % of max unchanged (76 % / 82 %). |
| `roundDoneTime` | 2.0 → **1.7** | 3 stars plus hop-out still fit (leave starts at 1.0 s and takes 0.4 s). | (included above) |
| `leaveDelay` | 1.2 → **1.0** | Must stay below `roundDoneTime − leaveTime`. | (included above) |
| `levelDoneTime` | 2.4 → **2.0** | Small trim. | (included above) |

Not recommended: lowering `nestPadUp`. High drops are 100 % accepted today and should stay that way. F1 is fixed by
`playNestGap` plus the tap guard instead. `idleTime` 12 s is right for the first nudge.

### 4.2 Small code changes (each proven with a sandbox patch in `tests/sim/variants.js`)

| # | where | change | re-simulated gain |
|---|---|---|---|
| C1 (F1) | `world.js` `pointerDown` / `_drop` | **Tap guard:** remember the finger-down point. In `_drop`, if the finger moved < 24 px and the hold was < 0.35 s, call `_planReturn(it,'miss')` with **no** `miss` event, no `misses++` and no auto-hint. Flicks still count because the finger travels. | Tap test: "miss" 100 % → 0 %, wrong 21 % → 0 %, auto-hints after taps 50 % → 0 %. Tapper hints 34 → 20/min. |
| C2 (F3) | `world.js` `_autoHint` | Skip if the target nest is still glowing (`_glowT > 0`) or a hint fired < 6 s ago. | Hints/min: tapper **34 → 8**, spammer **53 → 7**, beside 2.5 → 1.6, toddler 1.2 → 0.9. Hint←hint cuts disappear. |
| C3 (F2, age 4) | `world.js` `roundDone` branch | **Chapter time-box:** after ≥ 3 rounds, go to Talk once the chapter has run > 75 s. Fast kids keep all 4 rounds. | Toddler-4 chapter **135 → 104 s** (p90 172 → 127), session 540 → 416 s. Toddler-3 103 → 96 s. Typical ages 6–7 unchanged. |
| C4 (F11) | `world.js` idle | Idle interval ×1.5 after each nudge (12 → 18 → 27 → 30 s cap); reset on grab and on a new round. | Absent 5 min: **24 → 11** nudges. The 30 s idle kid still gets 2. |
| C5 (F5) | `main.js` `onEvent` | (a) Count mode: skip the `land` line for the final fruit and say `"<N>! " + great` on `roundDone`. (b) For the last sort item skip the praise; say "great" as `priority` (queued) instead of `interrupt`. (c) Throttle praise: skip a new praise if one started < 1.2 s ago (sfx only). (d) Don't re-say a hint while a hint is playing, and queue (don't interrupt) a hint that follows a "wrong" line. | Never-spoken lines **1.0 → 0.0/min**; final count number spoken **0 % → 100 %**; cuts/min typical-4 **9.3 → 5.7**, toddler-4 5.8 → 3.1, bot 0.6 23 → 15, spammer 106 → 51. |
| C6 (F6) | `main.js` / `world.js` talk | Re-ask the Talk question after 12 s without an answer. After the 2nd re-ask, glow the correct choice (same help as the nest hint). No timeout needed. | Not simulated (UI); today 0 events in 5 min. |

**All recommended changes together** (`variant recommended` = 4.1 + C1–C5):

| group | metric | baseline | recommended |
|---|---|---|---|
| toddler age 3 | chapter s (mean / p90) | 128 / 146 | **95 / 105** |
| toddler age 3 | session s | 512 | **380** |
| toddler age 4 | chapter s (mean / p90) | 172 / 226 | **102 / 129** |
| toddler age 4 | session s | 689 | **407** |
| typical 3 / 4 / 5 | session s (p90) | 422 / 466 / 503 (451 / 498 / 541) | **335 / 350 / 356 (360 / 368 / 385)** |
| typical 6–7 | session s | 338 | 267 |
| toddler 3 / 4 | near-nest misses | 4.7 % / 2.4 % | **0.0 % / 0.0 %** |
| all | items resting in a drop zone (iPad portrait) | 35.4 % | **0.0 %** |
| tapper / spammer | hints per min | 34 / 53 | **7 / 6** |
| typical 4 | speech cuts/min (never spoken) | 9.3 (1.0) | **6.0 (0.0)** |
| all | stuck rounds, errors, invariant breaks | 0 | 0 |
| toddler 4 / typical 5 | stars as % of max | 65 % / 81 % | 70 % / 82 % |

Every target is met: toddler chapters at ages 3–4 are 95–102 s (p90 ≤ 129), typical sessions are ≤ 6.5 min (p90),
no stuck rounds, near-nest misses 0 %. Full table: `tests/sim/out/compare.md`.

### 4.3 Content / UI changes (pedagogy)

| # | file | change (old → new) | why / evidence |
|---|---|---|---|
| P1 (F4) | `ui.js` `_choiceVisual` | Add `case 'size': return { sprite: 'egg_plain', scale: c.value === 'big' ? 1.3 : 0.72 };` (draw the two eggs at their real scale and keep the word in `<small>`). Show the Talk egg next to a reference nest or medium egg. | Age 3 size Talk is the only age-3 answer that needs reading today. |
| P2 (F8) | `ui.js` `_choiceVisual` | For `number` choices when age ≤ 5: digit **plus** n dots (reuse `render._dots`). | Count Talk at ages 4–5 is digits-only; the in-round sign already pairs digits with dots. |
| P3 (F9) | `content.js` `DN.AGE_TOPICS` | `4: [colors, shapes, count, homes]` → `[colors, count, shapes, homes]`; `5: [shapes, count, letters, homes]` → `[count, letters, shapes, homes]`; `6: [lower, initial, add, count]` → `[count, initial, lower, add]`; `7: [add, sub, initial, oddeven]` → `[initial, add, sub, oddeven]` | Re-simulated (`variant reorder`). Chapter time typical / toddler, age 5: **96 / 143 → 111 / 195 → 149 / 281 → 149 / 275 s** (was 149, 95, 111, 150 — hardest first). Age 7: 64 → 84 → 82 → 85 s (was 85, 82, 63, 84). Age 4 keeps `colors` first, so DESIGN's "first chapter trivially easy" still holds. |
| P4 (F10) | `content.js` `makeRound` count | `rng.int(Math.min(2, r[1]), r[1])` → `rng.int(Math.max(2, r[0]), r[1])`, and `COUNT_RANGE` `5:[1,10] → [3,10]`, `6:[1,12] → [4,12]`, `7:[1,12] → [4,12]`. Warm-up for age ≥ 6: `rng.int(1,3)` → `rng.int(2,4)`. | At age 6 the share of rounds with N ≤ 3 drops from 34 % to ≈ 13–17 % (only warm-ups, which are uniform over 2–4), and the mean N rises from 6.0 to ≈ 7 (exact for uniform draws; no session sim needed). Longer term (design): for ages ≥ 5, don't auto-stop — let the child stop at N — because blind dumping earns 3 stars today. |
| P5 (F12) | `content.js` `makeTalk('initial')` | Pick the initial uniformly, then a word with that initial. | Answer share B 24 % / D 5 % → ≈ 11 % each. |
| P6 (F12) | `content.js` `homes`, age 5 | Use 3 of the 4 homes per round (or keep 4 but vary which animals appear). | Age-5 homes: 100 % identical nest set in consecutive rounds. It also cuts 7.2 → 5.4 items per round, which helps F2 at age 5. |
| P7 (F12) | `content.js` `size` | Optional: at round ≥ 2, use 2 colours, or 3 eggs per size, so rounds differ. | 100 % identical rounds. |

Ages 3–4 reading audit: in-round, every nest label is pictorial (colour egg, shape, home picture, size egg, digit plus
dots), the prompts are spoken, and the items are pictures. Talk time is fine for colours, shapes and homes (picture
plus word). It fails for **size** (P1) and leans on numerals for **count** (P2).

---

## 5. Pedagogy and difficulty data

Chapter ramp: typical s / toddler s / items per round / errors per round (bot 0.3), in session order.

| age | ch 1 | ch 2 | ch 3 | ch 4 |
|---|---|---|---|---|
| 3 | colors 102 / 128 / 3.6 / 1.7 | shapes 101 / 126 / 3.6 / 1.7 | size 111 / 139 / 4.0 / 2.0 | homes 102 / 124 / 3.6 / 1.8 |
| 4 | colors 130 / 193 / 5.4 / 2.8 | shapes 130 / 200 / 5.4 / 2.6 | count 75 / 96 / 5.8 / **0.3** | homes 130 / 197 / 5.4 / 2.6 |
| 5 | **shapes 149 / 280 / 7.2 / 3.6** | count 97 / 145 / 7.6 / 0.5 | letters 112 / 194 / 5.4 / 2.6 | homes 149 / 281 / 7.2 / 3.6 |
| 6 | lower 97 / 195 / 5.4 / 2.5 | initial 71 / 141 / 3.6 / 1.8 | add 93 / 186 / 5.1 / 2.5 | count 97 / 154 / 8.2 / 0.5 |
| 7 | add 85 / 199 / 5.4 / 2.6 | sub 82 / 185 / 5.2 / 2.7 | **initial 63 / 138 / 3.5 / 1.7** | oddeven 86 / 183 / 5.6 / 2.9 |

The age 3 → 4 step is big: 3.6 → 5.4 items and 2 → 3 nests, and toddler 3-star rounds fall from 50 % to 39 %. That is
acceptable because age 4's warm-up rounds use 1 item per nest.

Variety (320 bot sessions, 6 400 rounds; `tests/sim/out/baseline.content.md`):
- Colours, shapes and letters cover their whole pool every few chapters, and identical nest sets in consecutive rounds stay ≤ 10 %.
- Letters: 20/20 used, ≈ 11 distinct per chapter, no letter > 8 %.
- Add at age 7: 181 distinct expressions; sub at age 7: 55.
- Count fruit: 3 of 4 kinds per chapter.
- Distractor fruit: +3 when N ≤ 3, else +2 (≈ 56 % / 44 % at age 4). Sensible: there is always something left over, never a flood.

---

## 6. Reproduce

```
cd projects/education-game/dino-nest-sort
node tests/sim/run_matrix.js --n 8 --variant baseline            # 3 840 sessions → tests/sim/out/baseline.json
node tests/sim/summarize.js baseline                             # tables → tests/sim/out/baseline.md
node tests/sim/content_stats.js baseline                         # variety + Talk audit
D=toddler,typical,bot0.6,bot1,beside,dropsHigh,idleKid,tapper,spammer
for v in baseline touch tapGuard hintCooldown idleBackoff pace timebox speech reorder recommended; do
  node tests/sim/run_matrix.js --n 4 --variant $v --name $( [ $v = baseline ] && echo baseline_sub || echo $v ) --drivers $D --seed0 1000; done
node tests/sim/compare.js baseline_sub touch tapGuard hintCooldown idleBackoff pace timebox speech recommended
node tests/sim/tap_test.js [--config '{"playNestGap":44}'] [--variant tapGuard]
node tests/sim/determinism.js ; node tests/sim/idle_absent.js [idleBackoff]
```
