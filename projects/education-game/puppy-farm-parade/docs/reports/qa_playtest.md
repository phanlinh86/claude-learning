# Bo's Farm Parade — QA high-speed playtest (2026-11-12)

Report only: no game code was edited. Sim files: `tests/sim/pt_playtest.js` (flow + child models + a speech model of
main.js's line policy) and `tests/sim/pt_content.js` (the content stream on its own, fast). Raw tables are in `tests/sim/out/pt_*.md|json`
and `voiceflow_pt_base.json` / `voicelog.json` / `hs_browser.json` (that folder is git-ignored).

## What was run
| run | what | size |
|---|---|---|
| `pt_playtest --tag base34 / base567` | current game, ages 3–7 × 16 models (careful, typical, slow3, random tapper, spammer, leftfirst = "taps the first one it sees", pos0 / pos1 / posLast = "always taps slot k first", flicky, absent, nogate = nobody touches during the gate or Talk, bot 1 / 0.8 / 0.5 / 0), 5 viewports, EN/VI, 2 sessions chained per world ("Play again") | 4 120 sessions |
| `pt_content --tag base / patched` | the world's exact content calls (topicsFor + lastTopics, usedKeys, prevRule, prevOddSlot), 1 500 chains × 3 sessions per age | 360 000 rounds per run |
| `pt_playtest --tag prop34 / prop34b / prop567 / prop4v3 / prop4c` | the proposed CONFIG, content rules and line policy (sim-only overrides) | 2 300 sessions |
| `hs_voiceflow` (real page, speed 1, fake iOS-like TTS, in-page 4-year-old) | age 4, EN + VI, 5.5 min each | 2 sessions |
| `hs_voicelog` + `hs_browser` (real page, `?speed=8&bot=1`) | ages 3–7, EN/VI, iPad landscape + iPhone portrait | 17 sessions |

Speech model = a copy of voice.js's queue (1 speaking + ≤ 2 waiting, interrupt flushes, non-priority lines older than 5 s go stale)
and main.js's event → line rules (protected prompts, count runs that are never cut, queued praise / gate / hint), using the real
i18n text and 0.3 s + 83 ms per character (≈ iOS Samantha / Linh at rate 0.9; the same timing as `hs_voiceflow`). Calibration: the
bot at skill 0.8 asks for 23.7 lines/min in the model and 23.9–24.9 on the real page (`hs_voicelog`).

## Health: all green
- **0 stuck rounds, 0 stuck states, 0 failed sessions, 0 NaN** in 6 400 sim sessions (all models, ages 3–7). The longest round:
  74 s (slow 3-year-old who looks away). Real page: 17/17 bot sessions done, 0 console errors, 0 broken voice lines (no
  `undefined` / `{x}`, no English in Vietnamese lines, no Vietnamese line without diacritics).
- **Session and chapter length (typical child):** age 4 chapter **73.2 s [p10 67.4 – p90 79.9]**, session **5.2 min (p90 5.4, max 5.8)**;
  ages 3/5/6/7 chapters 75.5 / 70.8 / 71.0 / 69.4 s. A child who listens to every word (careful): 85 s, 6.0 min. Slow 3-year-old:
  95.6 s [85.7–106.9], 6.7 min (p90 7.1, max 7.8), 38–45 % of chapters shortened to 3 rounds by the 75 s limit. Real page bot
  0.8: 3.4–3.8 min (headless bot 0.8: 3.7 min) — the sims match the page.
- **Stars (3/2/1 %)**: careful 4: 93/6/0 · typical 3: 71/21/8 · typical 4: 81/16/3 · typical 7: 90/9/1 · slow3: 58/24/18 ·
  spammer: 25/26/49 (assist in 6 % of rounds, so ≤ 2★) · random tapper: 25/31/44 (assist 38 %) · bot 1 / 0.8 / 0.5 / 0:
  100 / 78 / 49 / 0 % 3★.
- **Help:** hint in 2.9 % of rounds (typical 4), 7.9 % (typical 3), 19–21 % (slow3), 50 % (spammer), 64 % (tapper); every 2nd miss
  got a hint. Idle nudges: typical 2 % of rounds, slow3 16–19 %; nobody there → nudges at 16.5, 34.5, 61.5, 91.5, 121.5 s, then
  main.js pauses (5th idle). Talk time answered right 87 % (typical 4).
- Content variety inside a chapter is fine: the same set twice in a chapter never; the same odd thing in two rounds in a row 6–8 %;
  a set seen in the previous session 4–6 % at ages 3–4, < 2 % at 5–7.

## Findings

### P1 — fix before shipping

**P1-1. The odd one's position is guessable: it is "inside, and never where it was last round".** `buildRound` puts the odd one
on an inner slot 55 % of the time and never on the previous round's slot index. Spread per slot (age 4, 72 000 rounds):
n = 3 → 25/52/22 %, n = 4 → 12/36/38/14 %, n = 5 → 10/19/27/32/11 % (a fair game: 33 / 25 / 20 % each). The same slot index
twice in a row: **0.0 %** (fair ≈ 27 %). A child who simply taps "an inside one that wasn't the last one" is right on the first tap
**59 % of the time at age 4 (chance 27 %)**, 66 % at age 3 (chance 31 %), 41 % at ages 6–7 (chance 21 %). Measured with real
fingers: "always tap the 2nd" gets 3★ in 39 % of rounds at age 4 (chance 27 %) and 43 % at age 3; "tap from the left" and "always
the last one" get only 17–19 % (the ends are starved). Odd-one-out must be about the rule, not the place.
- **Change (content.js `buildRound`)**: `oddSlot = rng.int(0, n − 1)`; re-roll while it equals the slot of BOTH of the last two
  rounds (the world passes `prevOddSlots: [last, beforeLast]`, reset per session). Drop the 55 % inside rule and the "never the
  previous slot" rule. Unit test: over 10 000 rounds each slot of n = 3/4/5 within ±3 points of 1/n, no 3 in a row.
- **Re-simulated** (sim patch `slots`): spread 33/34/33 · 25/24/24/27 · 20/20/20/19/21; the "inside, not last" exploit 59.3 → **28.2 %**
  (chance 26.7); always-2nd 3★ 39.1 → **27.3 %**; leftfirst 19.3 → 26.9 %; same slot twice in a row 19.6 % (fair), never 3 times.

**P1-2. A session where nobody touches during Talk time (or the gate) runs past 8 minutes.** Each Talk waits 3 re-asks × 12 s +
`talkGiveUp` 12 s = 48 s before Bo answers, and every gate waits the full 4 s. "nogate" child (plays the rounds, never touches the
doors or the Talk pictures — e.g. a 3-year-old who doesn't know the pictures are buttons, or a parent-less session): **8.4–8.6 min
mean, p90 8.6–9.0 min**, chapters 118–124 s (target ≤ 8 min, 60–100 s).
- **Change (FP.CONFIG):** `talkGiveUp: 12 → 2` (the skill rule — re-ask every 12 s, glow after the 2nd re-ask, quiet after the 3rd —
  is kept; Bo just answers 2 s after the 3rd re-ask instead of 12 s). **New key `gateWaitAfterAuto: 2.5`** (world.js: after a gate
  that opened by itself, the next gate in the same chapter auto-opens after 2.5 s; a child's door tap restores `gateWait` 4). Keep
  `gateWait: 4` — `gateWait 3` was tried and raised the slow 3-year-old's auto-opened gates from 58 % to 80 % (it takes the door tap
  away from the children who need it).
- **Re-simulated** (prop34b / prop567): nogate 8.4 → **7.5 min (p90 7.6)** at age 4, 8.6 → 7.6 (p90 7.9) at 3, 8.3 → 7.3–7.4 at 5–7;
  chapters 121.5 → 106.8 s. Typical / careful / slow3 unchanged (5.2 / 5.5 / 6.5 min).

**P1-3. Bo talks 70–84 % of the time and the question is the line that gets cut.** Per round Bo says: the long question (every
round uses the `.first` form "They're all red… but one! Which one is NOT red?", EN 50–90 chars = 4.5–7.5 s, VI 75–85 chars =
6.3–6.9 s), the right line (3–4.5 s, count run 4.5 s), the praise (1.5–2 s), the gate line (1.5 s) and often "Hop, hop, hooray!"
(2 s) — about 15 s of speech in a 16 s round.
- Real page at speed 1 (age 4): **EN 15.1 lines/min, Bo talking 70.5 % of the time, prompts cut 3/16; VI 14.6 lines/min, 72.3 %,
  prompts cut 7/15** (the VI question is still being read when the child answers).
- Speech model, typical 4: 18.1 lines/min, **83.5 % talking**, the question heard to the end before the first tap in only **18.9 %**
  of rounds (41 % at age 3).
- **"Open the barn!" is spoken after the doors are already open in 12.1 of 16 rounds per session** (it queues behind the right line
  and the praise; the child tapped the doors or they auto-opened at 4 s) — Bo tells the child to do what just happened.
- **Changes (main.js `onEvent`, VOICE.md §1.1):**
  1. `ask`: `askText(Object.assign({}, e, { first: e.first && e.round === 0 }))` — the long "…but one!" form only in a chapter's
     first round; rounds 1–3 use the short wordings ("Which one is not red?", "Bạn nào không phải màu đỏ?").
  2. `roundDone`: no line. `parade`: ONE praise line (`great` / `praise`) only when the round had a miss or it is the chapter's last
     round (`round === 3`); never `march` (the fanfare + vane + stars already say it). Queued, droppable as today.
  3. `gateAsk`: say `gate` only in chapter 1 round 0. New: on `gateHint` (the ghost hand) say `gateShort` only in chapter 1.
     Chapters 2–4: silent gate (hand + creak). `FP.CONFIG.gateHandAfter: 1.2 → 2.0` (a child who taps within 2 s hears nothing).
- **Re-simulated** (prop4v3): typical 4 **83.5 → 62.3 % talking, 18.1 → 13.2 lines/min**, question heard in full before the first
  tap **18.9 → 72.6 %**, gate line after the doors opened 12.1 → **0.8** per session; careful 79.6 → 61.6 %; slow3 78.3 → 59.7 %.
  Chapter length unchanged for the typical child (72.7 s) and 85 → 77 s for the child who listens to every word (6.0 → 5.5 min).
  Silences > 8 s: 1.3 per session (max 10 s, below the 12 s idle nudge).

### P2 — should fix

**P2-1. The hint line is almost never heard.** "Psst! Look at the glowing one!" is queued behind the wrong line (6–7.5 s) on the 2nd
miss: it goes stale (> 5 s, non-priority) or is flushed by the child's next tap — **lost in 96–100 % of hints** (typical, careful,
tapper), heard in 30 % for slow3 even with priority. Change (main.js `hint`): `speak(T('hint'), { priority: true })` AND on the miss
that triggers a hint speak a short wrong line instead of the full one (see P2-2). The glow + ghost hand still work, so this is P2.

**P2-2. Wrong lines are long and get cut by the next tap 50–78 %.** EN 70–95 chars (6–8 s, e.g. "That's the boot. It's red, like its
friends. Find the one that's not red!"), VI longer. Children re-tap 2–3 s after a miss. Change (i18n `wrong.*`): keep the
three-part content but ≤ 55 characters in the first variant, e.g. EN "The boot is red too! Which one is not red?" / VI "Chiếc ủng
cũng màu đỏ nè! Bạn nào không phải màu đỏ?"; on the hint-triggering miss: "{thing} is {rule} too! Psst, look at the glowing one!"
(not simulated at text level: ≈ −3 s per wrong line).

**P2-3. Farm chapter repeats the wild animal; colours repeat the odd colour.** Only 4 wild animals (crab, penguin, lion, monkey) for 3
"farm" rounds: the same wild animal in two rounds in a row **24.4 %** (age 4), 25.3 % (age 5); the same odd colour in two colour
rounds in a row 15.9 %; a chapter with any odd thing twice 39 % (age 4). Change (content.js, world passes `usedOdd` per chapter):
`p.farm` picks the wild animal from WILD minus those used in this chapter; `colors` picks the odd colour not used yet in this chapter
(fallback: any when the clash rules leave none). Re-simulated (`oddwild,oddcol`): both repeats **→ 0.0 %**, chapters with a repeated
odd thing 39.0 → 21.6 %. (A 5th wild animal would help more: art exists only for 12 animals.)

**P2-4. The reward ceremony is identical 16 times.** Hop (0.85 s) + land hold 0.9 + gate ≈ 2.6 + march 2.2 + doors 0.8 ≈ **8 s of a
16 s round, ≈ 2 min per session**. Shortening it (`landHold 0.7`, `marchTime 1.9`, re-simulated) saves only 1.7 s per chapter, so
don't: vary it instead. Proposal (world / render, no CONFIG): the chapter's last round is a "grand parade" — the 3 odd ones met in
that chapter hop back off the stage and march in at the end of the line (they are in `usedOdd` already), with the long fanfare; rounds
1–2 keep the short march. Together with the silent gate (P1-3) the middle rounds feel faster and the chapter has a finale.

### P3 — nice to have

- **P3-1. Shape names at age 4.** The age-4 pool has all 8 shapes; "Which one is NOT a diamond / an oval / a rectangle?" is a hard
  word plus a negation for many 4-year-olds (heard in the voice-flow run). Change: `shapesFor(4)` = circle, square, triangle, star,
  heart, rect (oval + diamond from age 5). The sims cannot show it (child skill is flat across topics).
- **P3-2. Count chapter at age 4 has 5 crates × up to 5 apples in round 3.** Comparing 25 apples is the slowest thing in the game for
  a real 4-year-old. Change: `countFor` for topic `count` at age 4 → [3, 3, 4, 4] (as the first chapter already is). Pairs stay
  12 (gap ≥ 2: 60 % of rounds have gap 2, 23 % both ≤ 3) — good.
- **P3-3. The same opening chapter.** `topicsFor` re-sorts by difficulty, so "Colour Parade" opens 65 % of consecutive sessions at ages
  3–4 (38 % at 5). Keep easiest-first but let chapter 1 be the topic left out last time when it is one of the pool's two easiest
  (colors / size at 4, colors / shapes at 3).
- **P3-4. Odd colours are uneven below age 5.** The clash pairs leave orange as the odd colour in only 6.6 % of colour rounds
  (purple 19 %, blue 19 %). Fine for safety; to balance, pick the odd colour first and then the friends' colour.
- **P3-5. "Big and Little" asks the same question 4 times** ("Which one is the little one?"). Alternate: rounds 1 and 3 ask "Which one
  is the BIG one?" (one big among little ones; `rule.value` 'small', new `p.sizeBig` key in both languages).
- **P3-6. Headless Chromium at `?speed=8`** drops 20–50 % frames (software GL, 8 sim steps per frame). Not a device result; check
  the real iPhone frame time once (the functional / visual QA covers the device viewports).

## Numbers before → after (typical child unless noted)
| measure | before | after (proposed) |
|---|---|---|
| first tap right with "inside, not last" guessing, age 4 | 59.3 % (chance 26.7) | 28.2 % |
| "always the 2nd one" 3★, age 4 / 3 | 39.1 / 43.4 % | 27.3 / 31.8 % |
| odd one at the left / right end, n = 5 | 10 / 11 % | 20 / 21 % |
| same wild animal / odd colour in a row | 24.4 / 15.9 % | 0 / 0 % |
| nogate session, age 3 / 4 / 7 (p90) | 8.6 (8.8) / 8.4 (8.6) / 8.3 (8.5) min | 7.6 (7.9) / 7.5 (7.6) / 7.3 (7.5) min |
| % of the time Bo talks (age 4) | 83.5 % (real page 70.5 / 72.3 % EN / VI) | 62.3 % |
| lines per minute (age 4) | 18.1 (real page 15.1 / 14.6) | 13.2 |
| question heard in full before the first tap | 18.9 % | 72.6 % |
| "Open the barn!" after the doors opened, per session | 12.1 | 0.8 |
| chapter / session, age 4 | 73.2 s / 5.2 min | 72.7 s / 5.2 min |
| chapter / session, careful listener age 4 | 85.1 s / 6.0 min | 77.4 s / 5.5 min |
| slow 3-year-old session (p90) | 6.7 (7.2) min | 6.5 (6.9) min |
| stuck rounds / states | 0 / 0 | 0 / 0 |

## Exact changes (summary)
1. **content.js `buildRound`:** uniform odd slot `rng.int(0, n − 1)`, re-roll only to avoid the same slot 3 rounds in a row
   (`prevOddSlots`); remove the 55 % inside rule and "never the previous slot". (P1-1)
2. **FP.CONFIG:** `talkGiveUp: 2` (was 12), `gateHandAfter: 2.0` (was 1.2), new `gateWaitAfterAuto: 2.5`; keep `gateWait: 4`,
   `talkAskTime: 12`, `talkMaxAsks: 3`, `talkGlowAfterAsks: 2`, `chapterTimeLimit: 75`. (P1-2, P1-3)
3. **main.js line policy:** long `.first` prompt only in round 0; no praise at `roundDone`; one praise at `parade` only after a miss
   or in round 3; no `march` line; `gate` only in chapter 1 round 0 and `gateShort` on `gateHint` only in chapter 1; `hint` with
   `priority: true`. Update VOICE.md §1.1 to match. (P1-3, P2-1)
4. **i18n `wrong.*`:** first variant ≤ 55 chars; a short "…too! Psst, look at the glowing one!" variant for the hint miss. (P2-2)
5. **content.js:** no wild animal / odd colour twice in a chapter (`usedOdd`). (P2-3)
6. Optional: grand-parade finale in round 3 (P2-4); `shapesFor(4)` without oval / diamond (P3-1); age-4 count chapter 3, 3, 4, 4
   crates (P3-2); opening-topic rotation (P3-3); size rounds alternate little / big (P3-5).

## Designer's view (age 4, 16 rounds)
The core is good: one clear tap, a big physical answer (the boing onto the hay bale, the gap closing, the march into the barn), and a
surprise in every chapter. A 4-year-old will love chapter 1. Boredom comes from three places: **Bo never stops talking**
(70 %+ of the time, and the question is the line that gets cut), **the same 8-second ceremony 16 times** with a spoken "Open the
barn!" that often comes after the doors already opened, and **"where" being a better clue than "what"** — after a few rounds a
child can win by tapping the middle. Confusion comes from long wrong lines that hide the hint, unusual shape names (diamond, oval) in a
"NOT" question, and the same penguin leaving twice in one chapter. With the line policy, the uniform odd slot and the chapter finale,
the 16 rounds stay varied: the child hears each question to the end, taps, sees the hop and the march, and only hears Bo again when
there is something new to learn.
