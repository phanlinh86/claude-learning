# Lulu's Jungle Tower — high-speed playtest report (game-designer view, target child: 4 years old)

Playtester agent, 2026-11-04. Report only: no game file was edited. Every proposed change was re-simulated by patching
`JT.CONFIG` (`--config`), the content tables (`--blocks`), or, for code proposals, a harness-only wrapper (`--patch`, `--voice`)
in the same process. Seeds are identical before and after, so the differences come from the change alone.

## How it was played

| run | what | sessions |
|---|---|---|
| `hs_playtest.js --n 60` (existing harness) | 15 models × 5 ages: reproduces `hs_base.md` exactly (deterministic) | 4 050 |
| `hs_designer.js` `d_base` (new) | 17 models × 5 ages × 40, incl. 3 new models: **hoverer** (drags a block over the tower and never lets go), **returner** (drags it up, then back down to the grass and lets go), **hesitant** (holds 3–8 s over the tower before letting go). Adds a **voice model** that replays every `main.js` speech call into a copy of the `JT.Voice` queue rules (MAXQ 2, 5 s stale, priority / interrupt, `promptUntil`) with TTS at 12 (en) / 14 (vi) chars/s + 0.25 s | 3 400 |
| 12 experiments + `final` (all proposals together) | same seeds | ≈ 6 300 |
| `hs_browser_voice.js` (new) | the **real page** at `?speed=12&bot=1&mute=1&autorestart=1`, ages 3–7 × en/vi × 2 sessions back to back (Play again), console errors + every voice line stamped with the world clock | 20 |

Total: about 13 800 simulated sessions plus 20 real-browser sessions. To re-run: `node tests/sim/hs_designer.js --tag X [--config …] [--blocks …] [--patch graceAssist] [--voice …]`,
then `node tests/sim/hd_analyze.js X` and `node tests/sim/hd_compare.js d_base X chap,cut,sesP90,prompt,…`. The tables are in `tests/sim/out/hd_d_base.md` and `hd_final.md`.

## What already works (no change needed)
- **Real page:** 20/20 browser sessions finished, with **0 console errors or warnings**. Every one of 1 139 asks had its prompt line (`noPrompt 0`). Play again starts a new session, and the topics rotate (for example `colors,size,shapes,count` → `animals,colors,size,shapes`). Bot session times in the browser are 308–390 s, which matches headless bot 0.8 (327 s at age 4).
- **Pacing for a typical child:** chapter mean 92.5 / 90.4 / 92.0 / 94.2 / 93.9 s at ages 3–7. Session p90 is 401–413 s and the max is 432 s, so every session is under 8 min. No NaN. No ask over 60 s for any engaged model.
- **Surprises:** exactly 1 per chapter in 160/160 chapters per age (80 breeze, 80 butterfly), never 0 and never 2.
- **Variety:** the same answer as the previous ask comes 10 % of the time (only across tower boundaries). The answer slot is the same 3 times in a row 13 % of the time (chance is 11 %). A chapter has about 10 asks, 4.4 distinct answers, and the most-asked answer takes a 37 % share.
- **Random input:** spammer, tapper and confused models all finish thanks to the tap assist, and always get 1 ★. Random tapping is never rewarded.
- **Hints:** every 2nd miss is hinted. A typical 4-year-old is hinted on 5 % of asks, at 8.1 s, and needs 3.5 s after the hint.
- **Talk time:** 4.6 s mean, 5.8 s p90, 77 % right at age 4. An ignored Talk pauses at about 134 s.
- **Absent child:** idle nudges at 12, 30, 57, 87 and 117 s, then auto-pause at 121 s. Only 4 lines are spoken.

## Problems found, with before → after numbers

### P1-1 Lulu almost never finishes the instruction (voice pacing). Code and content in `main.js` / `i18n.js`
Voice model, typical 4-year-old: only **31 %** of prompts are heard to the end. 65 % are cut off (45 % by the praise line,
17 % by the wrong line) and 4 % are lost. The prompt starts **1.96 s** late because it waits behind the previous praise line.
Lulu talks **92 %** of the time.

Causes:
- (a) `promptUntil` is set when the prompt is *requested*, not when it is *spoken*. The prompt waits about 2 s in the queue, so the guard has expired before it even starts, and `wrong` / `miss` / `gust` / `butterfly` lines cut it.
- (b) The praise and wrong lines are long. "Red! Clonk! The tower is three blocks tall!" is 42 chars, about 3.7 s. "Boing, boing! That's the blue block. Let's find the red block!" is 60 chars, about 5 s.
- (c) Three lines arrive within 2.5 s at the end of a tower (`towerDone`, `monkey`, `great`). With MAXQ 2, **"We reached the bananas!" is dropped 91 %** of the time.
- (d) The count-up glow is **silent**. DESIGN says the blocks count "one, two, three!", but the `count` event only plays a chime. If you speak one line per number, 97 % of them are dropped at `countStep` 0.35 (still 83 % at 0.6).
- (e) Every poke on Lulu restarts the prompt with interrupt. The spammer model gets the same line again within 8 s **45.8×** per session, with up to 25 lines in 10 s.

Proposed changes:
1. Set `promptUntil` from the voice `onStart` of the prompt (or treat "a prompt is queued or speaking" as protected).
2. Make `sayStack` the name plus one sound, e.g. "Red! Clonk!" / "Màu đỏ! Cộp!". The tower height is already shown by the count-up.
3. Make `sayWrong` short: "Boing! That's blue. Find red!" / "Tưng! Đó là màu xanh dương. Tìm màu đỏ nhé!".
4. On the last block, replace the praise and `towerDone` with **one** count line, "One, two, three, four! We reached the bananas!", with interrupt. Also `countStep 0.35 → 0.45` so the glow keeps pace with the spoken numbers.
5. At `roundDone` keep only the star chime (drop `great`, because the count line already praised).
6. In `repeatPrompt`, ignore a poke while the prompt is speaking or < 3 s after it started.

| typical | prompt full / cut / lost % | prompt start delay | Lulu talking % | "bananas" line heard | wrong line heard | count heard |
|---|---|---|---|---|---|---|
| age 3 before → after | 49/50/1 → **88/12/0** | 2.09 → **1.01 s** | 90 → **82** | 3 → **100 %** | 15 → **86 %** | never → **100 %** |
| age 4 before → after | 31/65/4 → **81/19/0** | 1.96 → **0.80 s** | 92 → **84** | 9 → **100 %** | 5 → **71 %** | never → **100 %** |
| age 5 (`final`) | 17/74/9 → **70/29/1** | 1.80 → **0.61 s** | 94 → **88** | | | |
| spammer age 4: same line < 8 s / session · lines in 10 s | 45.8 → **6.8** · 25 → **13** | | | | | |

Robustness: with faster TTS (15 / 17 chars/s) the baseline is 63 % full and the fix gives 87 %. The browser run agrees:
67–78 % of lines are requested while the previous one would still be talking, and 20–53 interrupts per session land on a
fresh prompt.

### P1-2 A block held still freezes the game with no help and no pause. Code in `world.js` + `input.js`
The **hoverer** model (finger rests on a dragged block over the tower) gets 300 s of nothing: 0 idle nudges, 0 hints,
no auto-pause, and Lulu says 4 lines in total. `update()` stops the idle clock while dragging (`if (!dragging) this._idleT += h`),
and `input.js` ignores every other finger while one is down. On an iPad this happens when a thumb rests on a block in the
bottom row while the child plays with the other hand: then the whole game ignores her.

Proposal:
- Run the idle clock during a drag that moved < 20 px in the last 3 s.
- After 6 s held still: `cancelDrag()` (the block flies home) and Lulu says "Let go over the tower!".
- Let a new primary touch take over a still drag.

This could not be re-simulated without game code. The `returner` model (P2-4) shows that a released block then recovers.

### P1-3 A slow child plays 10 min at age 4. CONFIG `chapterMinRounds 3 → 2` together with `surpriseRound 2 → 1`
`chapterMinRounds 3` forces 3 towers before Talk time, so slow children overrun the 8-min session. Before:
slow3 at age 4 has chapter 143.6 s, session p90 637 s and **100 %** of sessions over 8 min. Hesitant at age 4 has 132 s, p90 587 s, 95 % over 8 min.
With `chapterMinRounds 2` alone, slow3 at age 4 goes to 84.8 s, p90 **369 s**, **0 %** over 8 min, and typical is unchanged (87.7 s, cut 73 %).
**But** the surprise tower (round 2) is then skipped for slow children: slow3 at age 4 gets a surprise in 3 of 160 chapters, down from 160.
So `surpriseRound` must go to 1 as well.

`final` with both changes: slow3 at age 4 has 160/160 chapters with a surprise, p90 397 s, 0 % over 8 min. Hesitant at age 4 has p90 437 s, 0 % over 8 min.
**Side effect:** at age 3 tower 1 has 2 blocks and the breeze needs ≥ 3 (`world.js` line 412 `sp = null`), so 80/160 age-3
chapters lose their surprise. Change that line so it falls back to `'butterfly'` instead of `null`.

### P1-4 The 4th and biggest tower is rarely seen, and count is always the cut chapter. Content `BLOCKS[4]` `[2,3,4,4] → [2,3,3,4]`, `BLOCKS[5]` `[3,4,5,5] → [3,4,4,5]`
At age 4, 73 % of chapters are cut to 3 towers by `chapterBudget`, so the HUD promises 4 dots and quietly fills them.
`topicsFor` always puts **count in chapter 4** at ages 3–5 (in 100 % of sessions, 77 % of sessions contain it), and its 4th tower is played only **18 %** of the time.

| typical | chapter s | cut % | count-chapter tower 4 played | session p90 |
|---|---|---|---|---|
| age 4 `[2,3,4,4]` → `[2,3,3,4]` | 90.4 → **89.9** | 73 → **52** | 18 → **56 %** | 405 → 412 s |
| age 5 `[3,4,5,5]` → `[3,4,4,5]` | 92.0 → 88.3 | 91 → **81** | 10 → 23 % | 397 → 395 s |

Rejected alternatives:
- `roundsPerLevel 3` gives 82.5 s chapters at age 4, but the 4th tower is never played.
- `chapterTimeLimit 80 → 95` with `chapterBudget 100 → 110` cuts fewer chapters (73 → 42 %) but makes them 99.8 s and the session p90 435 s, right at the edge of the target.

### P2-1 The tower sway is always at its cap, so landings feel the same and the breeze is not special. CONFIG `swayPeakMax 0.1 → 0.07`, `swayOffset 0.06 → 0.03`
Peak θ in the 2 s after a landing, typical 4-year-old: **86 %** of landings reach ≥ 0.08 rad. Aim errors are larger than
`landWithin` (0.18·S), so the offset term saturates. The top of a 4-block tower moves 39 px on average, about 6° every landing.
The breeze (`gustPeak` 0.1) moves the top 20 px, which is the same as an ordinary landing (20 px mean). The change keeps every
landing visible (no landing < 3 px) and calms the big towers:

| typical age 4 | θ < .02 / .02–.05 / .05–.08 / ≥ .08 rad % | top shift ≥ 30 px % | mean top shift by height 1·2·3·4 (px) | breeze vs landing |
|---|---|---|---|---|
| before | 0 / 5 / 9 / **86** | 26 | 8 · 19 · 29 · **39** | 20 vs 20 px |
| `swayPeakMax 0.07, swayOffset 0.03` | 0 / 9 / 86 / **5** | **5** | 6 · 14 · 21 · **28** | 20 vs 13–14 px (**1.5×**) |
Stars and pacing do not change, and bot 0.8 still reaches 3–5 % ≥ 0.08 rad when it lands off-centre.

### P2-2 Every 3-colour choice set holds yellow, and orange is almost never asked. Content `colourSet` in `content.js`
Ages 3–4: yellow is in **100 %** of the 3-colour sets (colours and shapes chapters), and orange is 3 % of colour answers.
The colour-blind rule is applied to the whole set. Proposal: check clashes only **answer vs each distractor** (two similar
distractors next to each other do not hurt). By enumeration this puts yellow in **56 %** of sets and makes orange an answer in
3-choice asks (orange vs blue + purple). An alternative is to allow pink at 4 (with pink+red, pink+purple and pink+orange as
clashes): only 1 of 7 sets has no yellow (86 %).

### P2-3 Stars are stingy on the big towers. Code `world.js` lines 910 / 916
Typical age 4: 36 / 37 / 27 % (★★★ / ★★ / ★). On 4-block towers only 29 % get ★★★ and **39 % get only ★**.
With rule A ("1 free slip in towers of ≥ 4 blocks": `free = n >= 4 ? 1 : 0; st = m <= free ? 3 : m <= free + 1 ? 2 : 1`)
the result is **49 / 34 / 18** at age 4 and 62 / 27 / 12 at age 5. Thoughtful goes 93 → 95 % ★★★.
Assisted taps still give 1 ★ (tapper and spammer 0 / 0 / 100), so random play is still not rewarded.

### P2-4 Swiping toddlers and children who never let go over the tower. Code, harness patch `graceAssist`
The swiper model at age 4 plays 627 s (p90 730 s, **98 % over 8 min**) and asks reach 132 s.
The returner (lifts the block, brings it back down) is **stuck for good**: Lulu says the `miss` line 32× and gives 16 hints in 300 s.
Proposal: once the right block has been hinted in this ask, letting go of it **anywhere** off the tower tosses it on, like the tap assist.
Result: swiper at age 4 goes to 375 s (p90 406 s, **0 %** over 8 min). Returner asks finish in 19.9 s (instead of never).
Typical, thoughtful and bot runs are unchanged, because a non-hinted block never triggers it.

### P2-5 The count chapter teaches less than it promises (ages 3–4). Content
- Count-up towers are only towers 0–1, so at age 4 the child counts up to **3 at most** (`p.countUp` n ∈ {1, 2, 3}). The "1–5" counting only happens in the dot rounds.
- In dot towers the closing count-up glow counts blocks 1…n while the blocks show other numbers (for example 4, 1, 5 dots), which is confusing.
- EN prompt "Block number 2!" never says *count*. The VI one does: "Đếm lên nào! Bé tìm số 2 nhé!".
- At age 4 the dot distractors are never ±1 from the answer. That is fine for subitizing, so keep it.

Proposal:
1. Ages ≤ 4: also count up on tower 3 (`countUp = ri <= 1 || (age <= 4 && ri === 3)`), giving 1…4.
2. In dot towers, ask the dot numbers in ascending order, so the tower reads 1-2-3-4 dots from the bottom and the closing count matches.
3. EN prompt: "Count up! Find number 2!".

### P3
- **Idle help comes late.** The first idle *hint* comes at 30 s (`idleHintFrom 2`) and auto-pause at 121 s. With `idleHintFrom 2 → 1` and `idleMax 30 → 20`, the hint comes at 12 s and auto-pause at **94 s** (absent model). For a slow 4-year-old the ask p90 goes 20.2 → 19.1 s; typical is unchanged.
- **The butterfly line is usually lost.** "A butterfly landed on our tower!" is lost 74 % of the time because it comes while the prompt is protected. Show it in the bubble and speak it only when Lulu is quiet (with the voice fixes it is lost 10 %, but cut 81 %). `surpriseLine` is computed in `main.js` but never spoken or shown, and the `surprise.*` keys are unused.
- **Topic order.** Count is always the night chapter at ages 3–5, and colours / animals appear in 88 % / 83 % of sessions. Consider letting the hardest topic sit in position 3 or 4 at random.
- **Stale `CLAUDE.md`.** This game folder's `CLAUDE.md` is still the fox game's ("Pip's Camp Hide & Seek", `FC`, `fc:`). It should describe Lulu's Jungle Tower (`JT`, `jt:`).

## Prioritized change list (before → after, simulated)

| # | change (key: old → new) | why | effect (same seeds) |
|---|---|---|---|
| **P1-1** | `main.js` `promptUntil` from the prompt's voice start; `sayStack` → "Red! Clonk!"; `sayWrong` → "Boing! That's blue. Find red!"; last block: one count line "One, two, three, four! We reached the bananas!" (interrupt) instead of praise + `towerDone`; no `great` at `roundDone`; `repeatPrompt` ignores pokes < 3 s; CONFIG `countStep 0.35 → 0.45` | prompts cut off, end-of-tower lines dropped, count silent, poke spam | age 4 prompts heard fully **31 → 81 %**, start delay 1.96 → 0.80 s; bananas line 9 → 100 %; count line 0 → 100 %; spammer repeats 45.8 → 6.8 per session |
| **P1-2** | `world.js` idle clock runs during a still drag; after 6 s still → `cancelDrag` + "Let go over the tower!"; `input.js` lets a new touch replace a still drag | a resting thumb or finger freezes the game silently | hoverer today: 300 s, 0 idle, 0 hints, no pause (not simulable without code) |
| **P1-3** | CONFIG `chapterMinRounds 3 → 2`, `surpriseRound 2 → 1`; `world.js` l.412 breeze on < 3 blocks → `'butterfly'` | slow children's sessions too long; keeps the surprise | slow3 age 4 session p90 **637 → 397 s**, over 8 min 100 → 0 %; hesitant age 4 587 → 437 s; typical unchanged (chapter 90.4 → 89.0 s); surprises 160/160 at ages ≥ 4 |
| **P1-4** | `content.js` `BLOCKS[4] [2,3,4,4] → [2,3,3,4]`, `BLOCKS[5] [3,4,5,5] → [3,4,4,5]` | the 4th tower and the count chapter's last tower are mostly cut | age 4 cut 73 → 52 %, count tower 4 played 18 → 56 %, chapter 89.9 s |
| **P2-1** | CONFIG `swayPeakMax 0.1 → 0.07`, `swayOffset 0.06 → 0.03` | 86 % of landings at the sway cap; breeze not special | ≥ 0.08 rad 86 → 5 %, 4-high top 39 → 28 px, breeze 1.5× a landing |
| **P2-2** | `content.js` colour clash checked answer vs distractor only | yellow in every set, orange never asked at 3–4 | yellow in sets 100 → 56 %, orange askable |
| **P2-3** | `world.js` stars: 1 free slip in towers ≥ 4 blocks | ★ only on 39 % of age-4 big towers | age 4 ★★★/★★/★ 36/37/27 → **49/34/18**; tapper still 1 ★ |
| **P2-4** | `world.js` grace assist: a hinted right block let go off the tower → toss on | swipers and "never let go" children stuck | swiper age 4 627 → 375 s (over 8 min 98 → 0 %); returner never → 19.9 s per ask |
| **P2-5** | `content.js` count up on tower 3 at ≤ 4; ascending dot asks; EN `p.countUp` "Count up! Find number 2!" | counting never past 3; closing count mismatches the dots | count-up reaches 4 (content check) |
| P3 | CONFIG `idleHintFrom 2 → 1`, `idleMax 30 → 20`; butterfly line only when quiet; speak or show `surpriseLine`; fix `CLAUDE.md` | late idle help; lost lines; stale doc | idle hint 30 → 12 s, auto-pause 121 → 94 s |

**Everything together (`final`, 2 200 sessions):**
- Typical sessions at ages 3–7: p90 393–402 s, max ≤ 423 s.
- Age 4 chapter 89.0 s, cut 73 → 55 %, count tower 4 played 18 → 44 %.
- Age 4 prompts fully heard 31 → 80 %.
- Slow3, hesitant, sloppy, tapper and swiper at ages 3–5: 0 % over 8 min (slow3 at 5: 13 %).
- No NaN. No sway above 0.1 rad. 1 surprise in every chapter at ages ≥ 4.
