# Puppy Garden Catch: high-speed playtest report

Playtester: report only. No file in `game/js` was edited. Every proposed change was simulated as a `PG.CONFIG`
override (`new PG.World({config})`) or, for content and code changes, as a monkey-patch inside the sim sandbox
(`tests/sim/playtest_variants.js`).

## TL;DR (verdict for a 4-year-old)

**Fun and fair: yes, mostly.** There is no fail state, misses never cost stars and Talk time always ends kindly. At age 4,
3★ rounds run from 67 % (spammer) and 69 % (tapper) up to 96 % (best bot). The first chapter takes 62–79 s and a
session takes 4.3–5.2 min for every active child model (7 min for the child who walks away 4 × 30 s). Chapter 1 at
age 4 is easy (0.15–0.28 wrong catches per round, 80–88 % 3★ rounds for the slow, late and weak models).

What does not work yet:
1. **5–6-year-olds who struggle get very long sessions.** At those ages there is no magnet, and "catch N" can ask for
   10 or 12 items. Tap-only children go over 8 min in 36–45 % of sessions and get stuck (> 40 s with no right catch)
   in up to 77 rounds per 80 sessions.
2. **The game partly plays itself, and blames the child for things he did not do.** An absent child (never touches)
   finishes 3.5 rounds in 10 min. Wrong bubbles fall into a basket that has stood still, so 15–43 % of an absent
   child's catches are "oops" and cost stars.
3. **Every round starts with an 8.3–9.0 s wait** (one bubble falling from the top) before the first catch. That is
   65–75 % of a short round at ages 3–4.
4. **Content bugs.** 41 % of colour Talk questions at ages 3–4 show red+green or blue+purple together, which breaks
   the colour-blind rule the rounds follow. 16 % of rounds repeat the previous round's target.
5. **Browser-only bug.** The adaptive render quality calls `applySize()` → `world.setViewport()`, which **cancels
   the child's drag**. Pip stops following a finger that is still on the glass.

The recommended set (rows 1–8 below) lowers sessions over 8 min **4.8 % → 1.0 %** (child models 7.6 % → 1.6 %) and
active stuck rounds **242 → 107**. Wrong-catch rate goes 15.2 % → 12.8 %, stars 85.4 % → 87.4 %, same-target repeats
16.4 % → 2.2 % and Talk content errors 528 → 0. The absent child now finishes 1.2 rounds in 10 min (was 3.5) and
gets 0 % wrong catches (was 31 %). Everything comes from 3 200 + 3 200 paired sessions.

## Ranked recommendations

| # | change (exact) | type | why | key before → after (paired sims) |
|---|---|---|---|---|
| 1 | `magnetMaxAge: 4 → 6` | CONFIG | ages 5–6 have no assist, so a weak or tap-only child can wait minutes for luck | full matrix: > 8 min 4.5 % → 1.3 %, active stuck 97 → 42, wrong rate 15.2 → 13.6 %. Age 6 tapper > 8 min 40.6 % → 0 %, slowKid 6 session 373 → 325 s. Bots unchanged (±1 %) |
| 2 | `PG.Content.COUNT_RANGE: {5: [3,10] → [3,6], 6: [4,12] → [4,8]}` | CONTENT | catching 10–12 fruit takes 46–53 s (tapper) and 80–105 s at p90. It is also the main reason chapters get cut to 3 rounds | full matrix: > 8 min 4.5 → 2.9 %, chapters cut to 3 rounds 12.6 → 10.2 %. Ages 5–6: bot0.3 chapters cut 14 % → 1–2 % |
| 3 | world `_spawn`: a **wrong** bubble is never aimed within `0.5·basket.w + 0.25·size + 40` px of a Pip that has not moved for 1 s (new keys `stillWrongGap: 40`, `stillTime: 1.0`) | CODE | an "oops" (and a lost star) for doing nothing is unfair, and the "game plays itself" effect also comes from here | absent wrong-catch rate 29 % → 0 %, wrong into still basket 0.10 → 0.08 per round, idleKid stars +5–10 pts. No change to durations |
| 4 | world `_stepSpawner`: **idle hold**. Finger up and no touch for `idleHold: 15` s → no new bubbles, except one right bubble at a time every `idleTrickle: 8` s, aimed just outside catch + magnet reach | CODE | a child who walks away keeps "playing". Bubbles land by luck and the voice talks to an empty room | absent: rounds per 10 min 3.5 → 1.2 (only the warm-up), round progress needs a touch again. Active children are unaffected (bots, slowKid, lateKid ±0) |
| 5 | `makeTalk('colors')`: apply the same colour-blind clash rule as the rounds below age 5 (no red+green, no blue+purple among the 3 choices) | CONTENT bug | 41 % (528 / 1 301) of age 3–4 colour Talk questions broke the rule | Talk content errors 222 → 0 (528 → 0 in the large run) |
| 6 | `makeRound`: no target repeated from the previous round of the chapter. For `size`: not the same size **and** colour | CONTENT | "Catch the red ball!" twice in a row feels like a bug to a parent. 16 % of round pairs repeated (size 50 %, colours at age 3 25 %) | same target 16.5 % → 2.4 % (the rest is size with a new colour) |
| 7 | `fallSpeed: {3: 58 → 62, 4: 64 → 68}` (5–7 unchanged), `firstSpawn: 0.8 → 0.6` | CONFIG | shorter wait for the first bubble, with no measurable cost in misses | first catch 9.0 → 8.3 s (age 3), 8.3 → 7.7 s (age 4). Age-4 toddler chapter 69 → 64 s (still inside 60–100). Miss/round slowKid 4: 0.77 → 0.91 (+0.14), wrong rate unchanged |
| 8 | main.js `applySize()`: only call `world.setViewport()` (which cancels the steer) when the logical W/H or insets really change. An adaptive-quality step should only resize the canvas backing store | CODE bug | the browser probe saw a quality drop at t = 35.3 s cancel a held drag. In one iPhone-landscape session the bot then missed 23 bubbles (chapter 3 took 148 s instead of 80 s) | browser session 340 s vs 280 s headless for the same seed. Clean reruns without the drop agree to ±3 % (table below) |
| 9 | (follow-up) cap the lane width on very wide screens: new `maxLaneW ≈ 820` px, lanes centred; the art stays full width | CODE | iPhone landscape lanes are 1 100 px (iPad 794). 198 of the 242 active-stuck rounds happen there | proxy (side insets +150 px), with the recommended set, ages 3–5 on iPhone landscape: tapper > 8 min 16.7 % → 0 %, active stuck 21 → 5, spammer stuck 13 → 2, session med 408 → 359 s. Bots unchanged |
| 10 | (option, needs a REQUIREMENT decision) **a tap on a RIGHT bubble sends Pip under it**. A tap on a wrong one still only names it and Pip stays | CODE | toddlers tap what they want. Today a tap-only 3-year-old is the remaining stuck case | on top of 1–8: active stuck 41 → 22, tapper age 3 > 8 min 9.4 % → 0 %, p90 458 → 396 s. Wrong rate does not rise (12.7 → 12.4 %), because wrong taps still do not move Pip |

**Rejected (measured):**

- `chapterTimeLimit 75 → 85 / 95`: it does keep more chapters at 4 rounds (12.6 → 8.8 % cut), but sessions over
  8 min go 4.5 → 6.9 % / 7.7 %. With changes 1 and 2 the cut rate already drops to 7 %, so keep **75**.
- An idle hold **without** the trickle (no bubbles at all until a touch): a child who comes back and waits to see
  something gets an empty sky forever. The idleKid model, which only touches once it sees a bubble, never finished
  (160 of 160 sessions). Keep the 8 s trickle.
- "Rescue" (a right bubble aimed at Pip after 20 s with no right catch while the child is touching): small effect
  (tapper 5 stuck 33 → 23) and made redundant by change 1.
- `magnetMaxAge 5`: good for age 5, but age 6 tap-only kids still go over 8 min in 25 % of sessions. 6 is better and
  costs bots nothing.
- `fallSpeed 66/72 + firstSpawn 0.5` (stronger version of 7): first catch 7.2 s, but age-4 bot chapters fall to
  55–58 s, below the 60 s target.
- Fewer kinds in the air in chapter 1 at age 4: our child models pick wrong bubbles independently of how many
  distractors there are, so this cannot be measured here. With 3 colours, chapter 1 is already easy (80–88 % 3★).

## Method

- **Harness:** `tests/sim/playtest.js` (new; reuses `lib.js` drivers and viewports, and adds the metrics below plus a
  `lateKid` model). Worlds run at 1/30 s frames (1/120 s sub-steps), exactly like main.js at speed 8.
- **Matrix:** ages 3–7 × 4 viewports (iPhone landscape 1556×720, iPhone portrait 720×1556, iPad landscape 1036×720,
  iPad portrait 720×1036, with safe-area insets) × child models × en/vi alternating. Large paired run: 20 seeds per
  cell, giving **3 260 sessions per variant** (652 per age). Variant runs: 8 seeds per cell (1 320 per variant).
  **28 600 headless sessions in total.**
- **Child models:** `bot0.3/0.6/0.9` (PG.Bot); `tapper` (random taps on bubbles, Pip, sky and grass, plus short
  drags); `slowKid` (slow 3-year-old: 1.5–3.5 s reactions, 40 % short drags); `lateKid` (new: notices the bubble at
  50–70 % of its fall, lunges 60–160 px past the goal, corrects after 0.7–1.3 s); `spammer` (rapid multi-touch
  chaos); `idleKid` (walks away for 30 s once per chapter); `absent` (never touches, capped at 600 s, never ends
  because Talk time waits for an answer).
- **Metrics:**
  - durations;
  - active stuck: a round with > 40 s and no right catch, counted only while the child touched within the last 10 s;
  - hints per minute and the smallest gap between hints;
  - share of round time with only wrong bubbles in the air;
  - wrong-catch rate;
  - wrong catches into a basket that has not moved for > 1 s;
  - hands-off catches: finger up and no touch for > 3 s;
  - same target as the previous round;
  - Talk-time correctness: answer in the choices, answer matches the picture, colour-blind rule, prompts and names
    resolve in both languages;
  - stars distribution.
- **Reproduce:**
  - `node tests/sim/playtest.js --n 20 --ages 4 --name x [--variant final2]`, then
    `node tests/sim/pt_report_tables.js A B` / `pt_compare.js A B` / `pt_table.js A B …`;
  - `node tests/sim/pt_speech_check.js`;
  - `node tests/sim/browser_playtest.js 4 2`, then `node tests/sim/headless_twin.js`.

  Variant names: `final2` = rows 1–7 (row 8 is a browser fix), `final2Tap` = plus row 10, and single changes as named
  in `playtest_variants.js`.

## Baseline → recommended set (3 200 + 3 200 paired sessions, absent excluded unless stated)

### By age

| age | session med s | p90 | max | > 8 min | chapter med s | round med s | 1st catch s | active stuck | hints/min | wrong-catch rate | 3★/2★/1★ rounds | stars % max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 325 → 309 | 453 → 451 | 596 → 567 | 5.0 % → 2.7 % | 80 → 76 | 17.1 → 16.0 | 9.0 → 8.3 | 63 → 59 | 0.6 | 9.6 % → 9.5 % | 81/15/3 → 81/16/3 | 90.3 → 90.5 % |
| 4 | 284 → 270 | 394 → 407 | 484 → 486 | 0.2 % → 0.3 % | 69 → 66 | 12.1 → 11.5 | 8.3 → 7.7 | 10 → 11 | 1.0 | 10.1 % → 9.6 % | 79/17/4 → 80/16/4 | 89.5 → 89.8 % |
| 5 | 314 → 281 | 479 → 433 | 772 → 495 | 9.8 % → 1.1 % | 80 → 70 | 14.5 → 13.7 | 7.1 → 6.9 | 114 → 11 | 2.3 → 1.3 | 16.4 % → 12.1 % | 68/19/13 → 74/19/7 | 82.9 → 87.0 % |
| 6 | 303 → 273 | 471 → 415 | 817 → 499 | 8.9 % → 0.5 % | 75 → 64 | 13.2 → 12.5 | 6.5 → 6.3 | 29 → 0 | 3.0 → 1.9 | 17.9 % → 13.9 % | 64/19/17 → 70/19/11 | 80.6 → 84.3 % |
| 7 | 249 → 245 | 402 → 414 | 477 → 510 | 0.0 % → 0.5 % | 60 → 59 | 10.9 → 10.7 | 6.0 → 5.8 | 26 | 2.8 → 2.6 | 19.9 % → 18.2 % | 70/18/12 → 72/17/11 | 84.0 → 85.1 % |
| **all** | 303 → 283 | 447 → 424 | 817 → 567 | **4.8 % → 1.0 %** | 74 → 69 | 13.1 → 12.6 | 7.5 → 7.2 | **242 → 107** | 1.9 → 1.4 | 15.2 % → 12.8 % | 72/18/10 → 75/17/7 | 85.4 → 87.4 % |

### By child model (all ages)

| model | session med s | p90 | > 8 min | chapter med s | active stuck | wrong-catch rate | hands-off catches | stars % max | Talk right |
|---|---|---|---|---|---|---|---|---|---|
| bot0.3 | 271 → 256 | 308 → 290 | 0 % | 61 → 59 | 0 | 13.2 → 12.7 % | 0 % | 86.1 → 86.9 % | 62 → 66 % |
| bot0.6 | 261 → 249 | 301 → 284 | 0 % | 59 → 57 | 0 | 8.1 → 8.0 % | 0 % | 91.8 → 92.2 % | 80 → 81 % |
| bot0.9 | 257 → 246 | 296 → 281 | 0 % | 58 → 56 | 0 | 2.5 → 2.4 % | 0 % | 97.6 → 97.8 % | 95 → 96 % |
| tapper | 368 → 318 | 555 → 417 | **18.3 % → 2.5 %** | 86 → 78 | 157 → 69 | 26.3 → 21.0 % | 0 % | 74.1 → 78.4 % | 34 → 35 % |
| slowKid (3-yo) | 347 → 315 | 423 → 375 | 2.8 % → 0 % | 80 → 75 | 2 → 0 | 15.5 → 14.4 % | 1.1 → 1.3 % | 84.4 → 85.2 % | 59 → 58 % |
| lateKid | 286 → 273 | 328 → 313 | 0 % | 65 → 63 | 0 | 11.6 → 11.9 % | 1.1 → 1.0 % | 88.0 % | 67 → 68 % |
| spammer | 347 → 303 | 460 → 400 | 8.0 % → 1.3 % | 81 → 75 | 83 → 38 | 26.3 → 22.1 % | 0 % | 74.3 → 77.3 % | 36 → 35 % |
| idleKid | 437 → 438 | 478 → 470 | 9.3 % → 4.3 % ¹ | 105 → 107 | 0 | **14.9 → 7.2 %** | 34.0 → 27.1 % | 87.2 → 92.9 % | 82 → 80 % |
| absent (60) | never ends (Talk) | | | | | **30.7 → 0 %** | 100 % | 3★ rounds 57 → 100 % | |

¹ idleKid is away for 4 × 30 s = 120 s of every session. Without that time, no idleKid session is over 8 min. The
model only touches again once it sees a bubble, so the idle hold adds a few seconds per return. A real child touches
at once.

### By viewport

| viewport | session med s | p90 | > 8 min | active stuck | wrong-catch rate |
|---|---|---|---|---|---|
| iPhone landscape | 340 → 315 | 496 → 456 | 13.4 % → 3.5 % | 198 → 94 | 14.4 → 12.4 % |
| iPhone portrait | 297 → 280 | 415 → 404 | 0.5 % → 0.1 % | 6 → 0 | 16.0 → 13.5 % |
| iPad landscape | 313 → 292 | 454 → 433 | 5.3 % → 0.4 % | 37 → 13 | 14.6 → 11.8 % |
| iPad portrait | 290 → 271 | 390 → 399 | 0 % | 1 → 0 | 15.7 → 13.4 % |

iPhone landscape is the outlier (lanes 1 100 px wide). See recommendation 9.

### One change at a time (paired, 1 280 child-model sessions each, 8 seeds per cell)

| run | session med | p90 | max | > 8 min | > 8 min (child models) | age-4 toddler ch. | ch. cut to 3 rds | 1st catch | active stuck | wrong rate | wrong into still / round | stars % | same target | Talk errors | absent rounds / 10 min | absent wrong rate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 303 | 447 | 727 | 4.5 % | 7.1 % | 69 | 12.6 % | 7.5 | 97 | 15.2 % | 0.10 | 85.4 % | 16.5 % | 222 | 3.5 | 29.0 % |
| 1 magnetMaxAge 6 | 295 | 420 | 618 | 1.3 % | 2.0 % | 69 | 10.2 % | 7.4 | 42 | 13.6 % | 0.09 | 86.4 % | 16.4 % | 222 | 3.7 | 21.6 % |
| 2 COUNT_RANGE | 300 | 436 | 665 | 2.9 % | 4.6 % | 69 | 10.2 % | 7.5 | 82 | 15.0 % | 0.10 | 85.8 % | 16.4 % | 222 | 3.5 | 29.0 % |
| 3 wrong avoids still basket | 304 | 447 | 727 | 4.2 % | 6.8 % | 69 | 12.2 % | 7.5 | 96 | 14.5 % | 0.08 | 86.0 % | 16.5 % | 223 | 3.5 | **0.0 %** |
| 4 idle hold ² | 303 | 460 | 727 | 6.0 % | 9.6 % | 68 | 12.9 % | 7.5 | 97 | 14.7 % | 0.09 | 85.8 % | 16.4 % | 219 | **1.2** | 7.9 % |
| 5 Talk colour rule | 303 | 447 | 727 | 4.5 % | 7.1 % | 69 | 12.6 % | 7.5 | 97 | 15.2 % | 0.10 | 85.4 % | 16.5 % | **0** | 3.5 | 29.0 % |
| 6 no repeat | 302 | 447 | 711 | 4.8 % | 7.8 % | 68 | 12.4 % | 7.5 | 91 | 15.0 % | 0.10 | 85.6 % | **2.4 %** | 221 | 3.5 | 29.2 % |
| 7 fallSpeed 62/68 + firstSpawn 0.6 | 292 | 443 | 931 | 3.9 % | 6.3 % | 64 | 11.8 % | **7.2** | 87 | 15.2 % | 0.10 | 85.4 % | 16.3 % | 218 | 3.6 | 30.0 % |
| chapterTimeLimit 85 (rejected) | 305 | 458 | 806 | 6.9 % | 11.0 % | 69 | 8.8 % | 7.5 | 101 | 15.3 % | 0.10 | 85.3 % | 16.4 % | 221 | 3.7 | 28.6 % |
| config only (1 + 7) | 287 | 413 | 590 | 0.5 % | 0.8 % | 64 | 9.6 % | 7.2 | 42 | 13.6 % | 0.09 | 86.4 % | 16.3 % | 218 | 3.7 | 21.9 % |
| **all of 1–7** | 283 | 424 | 541 | 1.3 % | 2.0 % | 64 | 7.1 % | 7.2 | 41 | 12.7 % | 0.07 | 87.5 % | 2.2 % | 0 | 1.3 | 0.0 % |
| 1–7 + 10 (tap right) | 283 | 422 | 541 | 0.8 % | 1.3 % | 65 | 7.0 % | 7.2 | 22 | 12.4 % | 0.07 | 87.6 % | 2.2 % | 0 | 1.3 | 0.0 % |

² The idle hold alone only lengthens idleKid sessions (the model artifact in ¹). It is paired with 1–3 for the
time savings.

## Other measurements (baseline unless stated)

- **Hints:** 1.9 per min overall (bots 0.1–0.8, tapper/spammer 3–5 at ages 5–7). 25 % of rounds have at least one
  hint. The smallest gap between two hints is **6.0 s** in every run, so the cooldown holds.
- **Only wrong bubbles in the air:** 0.9 % of round time (0.2 % at age 4, 1.9 % at age 7). Spells longer than 1 s
  happen 0.16 times per minute. Fair.
- **Too "auto"?** Hands-off catches (finger up for > 3 s): 0 % for active models, 34 % for idleKid, 100 % for absent.
  The absent child finished 3.5 rounds per 10 min, a whole chapter except Talk time. 23 % of all wrong catches landed
  in a basket that had not moved for > 1 s. Rows 3 and 4 fix both.
- **Repetition:** same target as the previous round 16.4 %. The same exact pool (target plus distractors) appears
  3.9 % of the time. Topics per age are fixed (the same 4 chapters every session at a given age). That is fine for
  learning, but a parent will notice. Possible later: rotate one chapter topic per session.
- **Talk time and voice text** (`pt_speech_check.js`, 12 000 rounds + 12 000 Talk questions, en + vi): 0 missing,
  unresolved or "undefined" prompts or item names. Every Talk answer matches its picture (colour, shape, size, count,
  sound, letter, initial, sum, difference, parity). The only error is the colour-blind clash (row 5). Talk right rate:
  bots 62/80/95 %, random tappers 34–36 % (= 1/3 chance, so the answer position is not biased).
- **Chapter length:** age 4 toddler models 64–78 s (target 60–100 s). Age 7: 49–60 s, sessions 3.5–4 min and 85–98 %
  of the stars, which is short and easy. Raising `need` at age 7 or adding a round could be considered (not
  simulated).
- **Every round completable:** 0 runtime errors in 28 600 sessions. Every session with an active child ended (the only exceptions were in the rejected no-trickle idle hold).
  Rounds only "stall" when nobody touches the screen.

## Real browser at high speed (Playwright Chromium, `?speed=8&bot=1&autostart=1&mute=1&age=4&seed=…`)

4 devices (iPhone 852×393 / 393×852 at dpr 3, iPad 1180×820 / 820×1180 at dpr 2) × 2 seeds × en/vi. Each run is
34–48 s of wall time for a ~270 s game session. No console errors, and every session reached the done screen. The
headless twin uses the same world seed, age and logical viewport with bot 0.8 (the browser bot's own seed differs):

| device | seed | browser session s | headless s | browser stars | headless | browser misses |
|---|---|---|---|---|---|---|
| iPhone L | 101 | 276.5 | 269.0 | 51 | 49 | 3 |
| iPhone L | 102 | **339.7** | 280.2 | 48 | 48 | **23** ³ |
| iPhone P | 101 | 266.9 | 277.9 | 48 | 47 | 0 |
| iPhone P | 102 | 277.1 | 271.9 | 48 | 48 | 1 |
| iPad L | 101 | 264.8 | 265.0 | 52 | 51 | 0 |
| iPad L | 102 | 272.9 | 269.5 | 51 | 49 | 1 |
| iPad P | 101 | 269.2 | 266.2 | 49 | 50 | 1 |
| iPad P | 102 | 285.2 | 276.1 | 49 | 49 | 2 |

Headless distribution with 30 seeds per device (bot 0.8, age 4): median 256–260 s (p10–p90 242–274), stars 50–51,
misses 0 (max 5). **Browser and headless agree to a median of +1 %** on the same seed, except for ³. That session is
the adaptive-quality drag cancel (row 8). A probe counted `cancelDrag()` calls: under CPU load, 2 extra
`setViewport()` calls happened mid-play, one of them with the finger down at t = 35.3 s. On a clean run there were
none. An older iPad that drops frames will hit this during real play.

## Files

- `tests/sim/playtest.js`: harness with the extra metrics and the `lateKid` model
- `tests/sim/playtest_variants.js`: every variant (CONFIG overrides and sandbox patches)
- `tests/sim/pt_summary.js`, `pt_compare.js`, `pt_table.js`, `pt_report_tables.js`: tables
- `tests/sim/pt_speech_check.js`: prompt, name and Talk correctness, both languages
- `tests/sim/browser_playtest.js`, `tests/sim/headless_twin.js`: real-browser run and headless comparison
- `tests/sim/out/*.md`: generated tables (`report_tables.md`, `single_changes.md`, `pt2_compare.md`). The raw
  `out/*.json` files (~100 MB) are gitignored.
