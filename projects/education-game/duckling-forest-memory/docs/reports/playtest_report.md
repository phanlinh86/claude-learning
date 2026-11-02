# Dee's Forest Memory — high-speed playtest report (2026-11-02)

Report-only: nothing in `game/` was changed. The numbers come from `tests/sim/pt_*.js`. The tables they produced are in `tests/sim/out/pt_*.md`
(`pt_kids_base`, `pt_ab_compare`, `pt_ab_compare2`, `pt_crowd`, `pt_variety`, `pt_absent`, `pt_idlepause`, `pt_stuck1`, `pt_browser`).
Screenshots are in `tests/sim/out/pt_browser/`.

## Verdict in one paragraph
The game feels different from the "drop it in the basket" games. Tapping to flip a card, Dee naming the card, the spin-and-burst on a
match and the forest filling up all work, and the motion looks good on screen. The timing fits the skill rules (typical 4-year-old: chapter
**93 s**, session p90 **406 s**, no errors in about 3 900 played sessions and 0 browser console errors). The weak point is the one the parent named:
**within a session and from session to session it is the same loop 16 times.** These things never change:
- the same 4 chapters in the same order every session ("Play again" reuses **89 %** of the chapter values at age 4);
- one face type and one reward kind per chapter;
- the same spoken prompt 4 times per chapter;
- only 2 grid shapes at age 4 on a phone (2×2, 2×3);
- 2–3 pairs every round (91 % of rounds give 3 stars).

A 4-year-old will like the first session, but by "Play again" it will feel like "the same game again". Highest priority is **variety, not
difficulty**: topic rotation + one surprise round per chapter + spoken lines that already exist but are never used. Two real interaction holes
also need fixing: tapping the same card again and again gets no help for **114 s**, and a spammer can skip seeing the mismatched faces.

## 1. What was run
- **Headless** (`pt_lib.js`: the World plus child models that tap through `world.pointerDown` at real card positions with hand-travel time):
  - Baseline `pt_kids_base`: 540 sessions, 10 drivers × ages 3–7 × iPhone portrait 720×1556 / wide 1600×720 / iPad landscape.
  - Before/after runs: 5 × 462 sessions at ages 3–4.
  - Smaller runs: crowding 4 × 64, idle-pause 240, same-card stress 20, variety audit 3 000 content sessions.
  - About **2 000 sessions at age 4** in total.
  - The first full 2 600-session matrix was stopped at 500 because the machine was shared with other test agents. The reduced matrix
    covers the same drivers.
- **Drivers:**
  - `typical` (per age);
  - `weak4`: careful 4-year-old who forgets half of what she sees (recall 0.5), always waits;
  - `impatient4`: taps a 3rd card at once after a mismatch;
  - `toddler`;
  - `slow3`: dreamy 3-year-old, 2.5–4.5 s between taps;
  - `repeat4`: taps the same card 4× before moving on;
  - `tapper` (random taps);
  - `spam4`: 4 taps/s anywhere on the screen;
  - `spam4c`: 4 taps/s on cards;
  - `stuck1`: taps one card forever;
  - `bot0.6`;
  - `absent`: nobody taps.
- **Browser** (`pt_browser.js`, Playwright Chromium, mobile touch contexts):
  - Part A: `?speed=8&bot=1&autostart=1&autorestart=1&mute=1` × ages 3–7 × iPhone portrait / landscape / iPad landscape.
  - Part B: one full session played with real `page.touchscreen.tap` on `DM.debug.cardScreen(id)` at speed 1.5 (iPhone portrait, age 4).
    48 screenshots were reviewed.

## 2. Key numbers (baseline, `pt_kids_base`)
| driver, age 4 | session mean / p90 | chapter mean (p10–p90) | mismatches per round | rounds with a hint | 3★ rounds | stars | share of time spent playing |
|---|---|---|---|---|---|---|---|
| typical | 382 / 406 s | 93 (83–105) ✔ | 0.9 | 4 % | 87 % | 94 % | 60 % |
| weak4 (forgets 50 %) | 413 / 446 s ✔ | 101 (88–114) | 1.1 | 8 % | 85 % | 93 % | 63 % |
| impatient4 | 320 / 345 s | 78 | 0.8 | 4 % | 91 % | 95 % | 53 % |
| toddler | 405 / 441 s | 99 | 1.7 | 23 % | 66 % | 85 % | 60 % |
| slow3 | 506 / **566 s** ✗ (95 % of chapters cut to 3 rounds) | 124 | 1.7 | 22 % | 64 % | 83 % | 72 % |
| repeat4 | 424 / 453 s | 104 | 1.0 | 7 % | 86 % | 93 % | 67 % |
| tapper | 424 / 458 s | 104 | 3.6 | 44 % | 44 % | 70 % | 62 % |
| spam4 (anywhere) | 421 / 474 s | 103 | 3.4 | 44 % | 46 % | 71 % | 65 % |
| **spam4c (on cards)** | **227 / 239 s** | **55** | 4.0 | 49 % | 39 % | 69 % | 40 % |
| bot 0.6 | 263 / 270 s | 64 | 0.1 | 0 % | 100 % | 97 % | 49 % |

Typical children at ages 3–7: chapters 93–99 s, session p90 405–423 s. The careful/weak child at age 4 has p90 446 s (target ≤ 480 ✔).

**Where the time goes** (typical, age 4, per session):

| part | time | share |
|---|---|---|
| play + resolve | 228 s | 60 % |
| peek | 42 s | 11 % |
| deal | 16.5 s | 4 % |
| hide | 4.6 s | 1 % |
| mismatch shown | 14 s | 4 % |
| round end + stars | 35 s | 9 % |
| intro + level done + Talk after | 26 s | 7 % |
| Talk question | 15.5 s | 4 % |

Pure waiting (everything except play, peek and Talk) is about 25 %, or about 3.5 s between rounds. That is fine; I would not shorten it further.
The waiting is not where the boredom comes from.

**Card size** (logical px, short side 720):

| viewport | ages 3–4 | ages 5–7 |
|---|---|---|
| iPhone portrait | 210 (2×2, 2×3) | as small as 148 (2×5) |
| wide 1600×720 | 170–210 | 155 |
| iPad landscape | 147–160 | 127 |

Every card is at or above the age minimum.

**Reward crowding** (share of rewards whose final box overlaps another by > 40 %):
- 0 % on landscape phones at every age.
- iPad landscape: 0 % at age 4, 13–15 % at ages 6–7.
- **iPhone portrait: 22 % at age 4.** The count chapter is at 69 %: 10 acorn piles share a 720 px ground strip. Ages 5–7 are at 37–43 %.
- In the browser the acorn piles are tiny and sit at the very bottom edge (`B_L2_r4done_rewards.png`). In portrait the lanterns stack in
  narrow side columns, and one lantern's string runs into the one below (`B_L1_r4done_rewards.png`).

## 3. Absent child, idle, help (`pt_absent.md`, `pt_idlepause.md`, `pt_stuck1.md`)
- **Absent from the start of play:** nudges at 12 s, 30 s, 57 s and 87 s (spoken, with a pair glowing from the 2nd), then `pause()` at 117 s.
  After that: silent, music off, the pause menu. The child is left at 117 s. ✔
- **Absent during Talk time:** re-asks at 12, 24 and 36 s (the answer glows from the 2nd), `pause()` at 48 s. This matches the skill
  rule "stop after 3". ✔
- **Present but slow:** no child model reached 5 nudges in one round (0 of about 3 400 rounds), so a child who is playing never gets paused. ✔
- **Edge case:** `idleSaid` is only reset by the next `round` event. After `resume()` the next nudge (30 s later) is the 6th, so the game
  pauses again **without saying anything** (P3).
- **Same card again and again (P1):** tapping the one open card counts as activity. It resets the idle timer and is never a mismatch, so the
  `stuck1` child got **0 hints and 0 nudges in 114 s**.

## 4. Real browser (`pt_browser.md`)
- **Part A** (15 runs): 0 console errors and 0 page errors; 1–2 full sessions per 70 s at speed 8.
  - iPhone portrait: 37–51 fps, 16–31 % slow frames.
  - iPhone landscape: 50–53 fps.
  - iPad: 41–48 fps.
  - Caveats: headless Chromium with software rendering at dpr 2–3, on a shared machine with load 3–8. These are not iPhone numbers; the
    finding is that nothing breaks.
- **Part B:** a full session in 220 s wall time at speed 1.5, 80 real touch taps, 16 rounds, Talk answered by touch, 0 errors.
  - My pick logic remembered almost everything (it re-checked faces on every poll), so 0 mismatches. It is a flow and feel run, not a
    difficulty run.
- **Feel:**
  - Cards are big and clear, the faces read well, the card backs are pretty, and the season changes are lovely.
  - The animal-friends row at the bottom (`B_L3_r3_two_up.png`) is the best "the forest is alive" moment.
  - Weak spots:
    - (a) In the first round on a phone without safe-area insets, the 2 pairs are laid out as a **1×4 column** to the right of Dee
      (`B_L0_peek.png`). This is the tie-break "more rows in portrait" between a 1×4 and a 2×2 that are both capped at 210 px.
    - (b) After a round, an **empty mossy panel** fills half the screen during the round-end pause (`B_L2_r4done_rewards.png`).
    - (c) Acorn rewards are almost invisible.
    - (d) The voice log shows the same prompt 4× per chapter, and the season lines `weather.0..3` and the reward lines `reward.*` exist in
      i18n but are **never spoken**.

## 5. Designer judgement
- **Is the peek long enough?** 2.2 s is fine for 4 cards and short for 6–8, because a 4-year-old scans about 0.5 s per card while Dee says
  "Look carefully!". Making the peek depend on the card count costs no time overall (proposal P2-2).
- **Is 4 pairs too hard at age 4?** No. The tuned table never deals 4 pairs at age 4; the maximum is 3. The weak-memory child still gets
  85 % 3-star rounds. With a 4-pair finale (`[2,2,3,4]`): typical chapter 98 s, weak4 p90 468 s, still inside the targets. But it adds
  6 s per chapter, and that budget is better spent on surprise rounds. Use the finale only if the surprise round is not built.
- **Does a spammer win?** On speed, yes: mashing the cards finishes a session in 227 s (fastest of all children) and still collects 69 % of
  the stars. A tap during a mismatch skips straight on, so the spammer never even sees the faces. Proposal P2-1 fixes this without slowing
  down a patient child.
- **Reward rhythm:** one reward per match and one per round-end star rain is good. The round-end burst is the high point. Rewards that stay
  for the whole chapter are a nice "collection". But all butterflies or all acorns for 10 matches in a row adds to the sameness.
- **Waiting:** fine (see §2).
- **Variety** (`pt_variety.md`):
  - 1 chapter order per age, every session.
  - 5.7 distinct pair values per chapter at age 4. Colour chapters can only use 3 "safe" colours, so the same butterflies come back every
    round, and 23 % of rounds show no new value.
  - 1 reward kind per chapter.
  - 89 % overlap with "Play again".
  - This is the main risk for a child who is easily bored.

## 6. Recommended changes (exact)

### P1 — must do
**P1-1 Rotate the chapters per session** (content.js, world.js, main.js)
- Add `DM.AGE_POOLS`:
  - 3: `['colors','animals','size','shapes']`
  - 4: `['colors','animals','shapes','count','size']`
  - 5: `['shapes','count','letters','animals','colors']`
  - 6: `['lower','initial','add','count','letters']`
  - 7: `['initial','add','sub','oddeven','count']`
- Add `DIFFICULTY = ['colors','animals','size','shapes','letters','count','lower','initial','add','sub','oddeven']`.
- `Content.topicsFor(age, rng, last)` picks:
  - chapter 1: the easiest pool topic that was not chapter 1 in `last`;
  - chapters 2–4: 3 of the remaining topics, preferring ones left out of `last`, sorted by `DIFFICULTY` (easiest first stays true).
- `World.newSession()` passes `this.rng` and `this.lastTopics`.
- main.js stores `dm:lastTopics` with `DM.Storage.setJSON('lastTopics', world.levels)` on `sessionDone`, and sets `world.lastTopics`
  at boot.
- Effect: reward kinds rotate too. At age 4, a session leaves out 1 of 5 topics, so "Play again" differs in at least 1 chapter. Session
  time is unchanged: all age-4 topics run 19.3–20.2 s per round.

**P1-2 One surprise round per chapter** (world.js and render; content unchanged)
- Config: `CONFIG.surpriseRound: 2` (the 3rd round) and `CONFIG.surpriseTypes: ['shuffle','golden','pond']`.
- The type for chapter L is `types[(L + sessionOffset) % 3]`, where `sessionOffset = rng.int(0, 2)` at `newSession`.
- `shuffle`: a new phase `'shuffle'` between `hide` and `play`.
  - Pick 1 pair of face-down slots (2 pairs from age 5) and swap their `slot`/`hx`/`hy`.
  - Move each card along a raised bezier with `lift = 1` over `CONFIG.shuffleTime = 0.9` s (the card x/y spring follows `hx`/`hy`).
  - Emit `shuffle {a, b}`. main.js plays an autumn "whoosh" and says `say.shuffle` ("Whoosh! The wind moved two cards — watch!").
  - Cost: +1.1 s. It trains tracking as well as memory.
- `golden`: one random pair key of the round is marked `cur.golden`. The card backs stay identical, so there is no cue.
  - On its match: emit `reward {kind:'rainbow'}`. A rainbow arc sweeps the sky for 2.5 s, Dee splashes in the pond (`cheer`, 3 hops), and
    main.js says `reward.golden` ("A magic pair! A rainbow!").
  - Cost: about +1.5 s.
- `pond`: the slots sit on lily pads, in a gentle arc or a staggered row instead of a grid.
  - `chooseGrid` gets `style:'arc'`: the same cw ×0.92, slots on an ellipse arc of the board, and a check that neighbours keep a gap of
    at least `gapMin`.
  - The hit test is unchanged (rects). Cost: 0 s.
- Total about +5 s per session (typical 4-year-old p90 ≈ 411 s; budget 480 s).

**P1-3 Use the lines that already exist** (main.js `onEvent`)
- `level`: after the chapter line, queue `speak(T('weather.' + e.level))` (not interrupting).
- `land`: on the first reward that lands in each round, if `!DM.Voice.isSpeaking()`, `speak(T('reward.' + e.kind))`. Throttle: at most
  1 per round and at least 4 s after the last match line.
- `p.<topic>` becomes an array of 3 per topic in en and vi (e.g. "Find the colour pairs!" / "Which butterflies are twins?" / "Find two
  the same colour!"). `T()` already picks from arrays. Keep the first round's prompt fixed (as a teaching anchor) and rotate from round 2.

**P1-4 Help the "same card again and again" child** (world.js `pointerDown`)
- Before `this._idleT = 0`:
  - compute `var same = c && c.state === 'up' && this.open.length === 1 && this.open[0] === c.id;`
  - reset the idle timer only when `!same`;
  - when `same`: `this._sameN = (this._sameId === c.id ? this._sameN : 0) + 1; this._sameId = c.id; if (this._sameN >= CONFIG.sameTapHint /*3*/) { this._sameN = 0; this._autoHint(); }`
  - reset `_sameN` on any other card.
- Sim (`stuck1`, 10 × 120 s): **0 hints / 0 nudges → 170 hints + 40 nudges**, and the longest stretch without help drops from 114 s to 8 s.
  `repeat4`: mismatches per round 0.9 → 0.3, 3-star rounds 86 → 98 %, chapter 104 → 101 s.

### P2 — should do
**P2-1 A spammer has to see the mismatch** (world.js `pointerDown`, third-tap branch)
- Add `CONFIG.thirdTapAfter = 0.5`.
- Before the fast reset: `if (!this._mis || this._mis.t < cfg.thirdTapAfter) return null;`
- spam4c age 4: chapter 54 → 67 s, session p90 241 → 303 s.
- impatient4 and typical: unchanged (they tap later than 0.5 s).

**P2-2 Peek scales with the card count**
- Add `CONFIG.peekPerCard = true`.
- In `_beginRound`: `cur.peek = peekByAge[age] * (0.6 + 0.1 * cards.length)`. At age 4 that gives 4 cards 2.2 s, 6 → 2.6 s, 8 → 3.1 s.
- Combined with P1-4 and P2-1 (`pt_ab_compare2`): typical 4 chapter 92 → 92 s, weak4 p90 438 → 435 s.

**P2-3 Less crowding in portrait** (CONFIG only)
- `acornSpread: 34 → 24` and `perchStep: 64 → 52`.
- iPhone portrait, crowded rewards: age 4 26 % → 5 % (count chapter 80 → 20 %), ages 5–7 47 % → 35 %.
- iPad landscape at age 6: 23 → 7 %.
- Also make acorns bigger in the reward: `sizes.acorn: 22 → 28`. Re-check `pt_crowd` after this.

**P2-4 Grid tie-break** (world.js `chooseGrid`)
- When two candidates tie within 0.5 px (both at the 210 px cap), prefer the smaller `|cols − rows|` and board A before the
  portrait/landscape rule.
- This stops the 1×4 column on iPhones without insets.

**P2-5 Hide the empty board panel** during `roundDone`/`talk` (render), so the forest and its rewards fill the screen at the reward moment.

### P3 — nice to have
- main.js `resume()`: set `idleSaid = 0` (and `world._idleN = 0`) so a returning child hears a nudge before the game pauses again.
- Skill vs CONFIG mismatch: the skill says the chapter limit is 75 s, but `chapterTimeLimit` is 80. Either set `chapterTimeLimit: 75` or
  note the exception in MECHANICS §10. 75 cuts the slow3 p90 slightly.
- Do **not** raise `pairsByAge[4]`. If P1-2 is skipped, `[2,2,3,4]` is safe (typical 98 s, weak4 p90 468 s; `pt_ab_compare2`).
- Merge rewards in long portrait chapters at ages 5–7 (≥ 12 rewards): for example, stars join into a constellation line and lanterns
  hang on one garland.
- slow3 at age 4 (p90 566 s) is over 8 min even with 95 % of chapters cut. It is INFO only; P1-2 does not change this.

## 7. Before/after evidence
| run (ages 3–4, 462 sessions each, same seeds) | typical 4 chapter / session p90 | weak4 p90 | repeat4 mismatches per round | spam4c chapter | tapper 4 session p90 |
|---|---|---|---|---|---|
| `ab_base` (today) | 92 / 399 s | 438 s | 0.9 | 54 s | 447 s |
| `ab_patchonly` (P1-4 + P2-1 + P2-2) | 92 / 396 s | 435 s | 0.3 | 67 s | 464 s |
| `ab_final` (+ pairs 4: [2,2,3,4]) | 98 / 420 s | 468 s | 0.4 | 71 s | 522 s |

The proposals are simulated as patches to `DM.World.prototype`, inside the sim only (`pt_kids.js --patch sameTapHint,misMin,peekPerCard`).
The CONFIG proposals were simulated with `new DM.World({config})`.

## Status after fixes (lead, 2026-11-02)
Applied: P1-1 topic rotation (`DM.AGE_POOLS`, `topicsFor`, `dm:lastTopics`), P1-2 one surprise round per chapter
(shuffle / golden magic pair with a rainbow / lily-pond layout) with its own voice line and sound, P1-3 season lines on each
chapter, a reward line once per round, 3 wordings per prompt (repeats say the same wording), P1-4 same-card hint,
P2-1 `thirdTapAfter` 0.5, P2-2 peek scales with the card count, P2-3 reward spacing/sizes, P2-4 squarer grids,
P2-5 the clearing panel fades out between rounds, P3 `idleSaid` reset on resume. Kept: chapter limit 80 s, pairsByAge[4].
