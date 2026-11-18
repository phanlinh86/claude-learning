# Gigi's Peekaboo Windows: independent high-speed playtest (2026-11-18)

Evaluator: high-speed playtester. This is independent of the mechanics engineer's `tests/sim/playtest.js`. I edited only
`tests/sim/*`. No game code was changed.

**Bottom line:** the core loop is sound and robust. There are 0 errors, 0 stuck rounds and 0 NaN in 13 000+ headless sessions.
The browser matches the headless numbers within 2 %. A typical 4-year-old has a **95 s** chapter and a **380 s** session.
Three things hurt the experience:
1. **The voice is badly over-subscribed at the round transition.** Gigi talks about 90 % of the time. "Look carefully!" is
   heard *after* the windows have closed, and "Now they hide!" is almost never heard.
2. **The auto-hint gives no measurable help to the children it is for.** Its 2.5 s glow is over before a careful or slow
   child taps. Hints on and hints off give the same times.
3. **Colour rounds repeat the previous round's colours** 23–48 % of the time.

All three can be fixed with small changes, listed at the end with numbers.

## 0. What was run

| tool (new, `tests/sim/`) | what it does |
|---|---|
| `pt_eval.js` | Worker-thread headless sessions over driver × age × lang × 4 viewports. It logs these per round: the phase overheads (scroll / peek+hide / play / post-solve), mismatches, auto / idle hints, whether the hinted pair is the next one found, idle nudges, stars, what happened to the critter, the speech-triggering events (mapped the way `main.js` maps them), and the content keys. |
| `pt_eval.js` driver **`unfocused`** (new "drops focus" child) | A typical child of its age. While playing, it looks away for 15–45 s with a hazard rate of 1/45 s. In Talk time it looks away for 8–20 s with a hazard rate of 1/30 s. |
| `pt_eval_report.js` | Builds tables for one run, or a paired comparison of several runs. |
| `pt_eval_exp.sh` | Runs the CONFIG-override experiments on paired seeds. |
| `pt_eval_colors.js` | Measures colour-round variety in the game's `content.js` against an **in-memory** patch (sim only). |
| `pt_eval_browser.js` + `pt_eval_voice.js` | Real Chromium (Playwright). **A** is speed 8, the bot, ages 3/4/5, with every world event recorded. **B** is speed 1, bot skill 0.7, about 2.2 min per language. **K** is B with the bot slowed ×0.4 to a 4-year-old's rhythm. B and K use a fake `speechSynthesis` that speaks each line for 350 ms + chars / 11.7 /s (about a rate-0.9 voice), so that `voice.js`'s real queue, interrupt, drop and stale rules run. |

The base run was 5 440 sessions: 11 drivers × ages 3–7 × en/vi × 4 viewports × 8 seeds, plus 16 extra seeds for the child
models at ages 3–5. It took 619 s on 2 cores. The experiments were 6 × 1 200 + 2 × 1 728 + 3 × 480 sessions. Outputs are in
`tests/sim/out/eval_*.md|json`, `x_*`, `y_*`, `z_*` and `eval_voice.md`.

## 1. Durations (base run, no override)

| driver / age | session mean (p90, max) s | chapter mean (p10–p90) s | chapters cut to 3 | round mean (p90, max) s | mismatch / round | rounds with a hint | rounds with an idle nudge | 3★ / 2★ / 1★ rounds |
|---|---|---|---|---|---|---|---|---|
| **typical 3** | 400 (429, 473) | 100 (89–113) | 6 % | 21.8 (30, 65) | 0.89 | 7 % | 4 % | 83/17/0 |
| **typical 4** | **380 (407, 428)** | **95 (84–107)** | 4 % | 20.5 (29, 52) | 0.82 | 5 % | 2 % | 89/11/0 |
| **typical 5** | 396 (418, 453) | 99 (89–110) | 5 % | 21.6 (30, 54) | 0.87 | 4 % | 2 % | 95/5/0 |
| typical 6 / 7 | 399 / 375 (p90 420 / 396) | 100 / 94 | 2–3 % | 21.7 / 20.4 | 0.82 / 0.56 | 2 / 1 % | 1 % | 98–100 % 3★ |
| careful4 3 / **4** / 5 | 433 / **423** / 453 (p90 460 / **452** / **491**) | 108 / 106 / 113 | 20 / 52 / 91 % | 24.8 / 26.4 / 32.3 | 1.15 / 1.37 / 2.09 | 12 / 15 / 24 % | 2–3 % | 75 / 73 / 65 % 3★ |
| toddler 3 / 4 | 389 / 398 (p90 423 / 429) | 97 / 100 | 4 / 12 % | 21.1 / 22.3 | 1.31 / 1.65 | 16 / 21 % | 1 % | 70 / 65 % 3★ |
| slow3 3 / 4 (INFO) | 465 / 510 (p90 514 / 564, max 654 / 645) | 116 / 127 | 88 / 98 % | 32.6 / 37.4 | 1.23 / 1.74 | 15 / 23 % | 24 % | 69 / 63 % 3★ |
| **unfocused 3 / 4 / 5** (new) | 486 / 468 / 471 (p90 554 / 535 / 540, max 648 / 630 / 746) | 122 / 117 / 118 | 56–59 % | 30–31 (p90 60–61, max 161–183) | 0.8–0.9 | 19–22 % | 26–29 % | 82–93 % 3★ |
| tapper 3 → 7 | 410 → 609 | 102 → 152 | 23 → 99 % | 24 → 47 | 2.7 → 8.9 | 44 → 80 % | 0 | — |
| spammer 3 → 7 | 238 → 385 | 59 → 96 | 0 → 13 % | 12 → 22 | 2.8 → 10.3 | 58 → 91 % | 0 | — |
| bot 0.3 / 0.6 / 0.9 / 1 (age 4) | 308 / 261 / 244 / 241 | 77 / 65 / 61 / 60 | 0 % | 16.4 / 13.5 / 12.4 / 12.2 | 0.75 / 0.12 / 0.01 / 0 | 5 / 0 / 0 / 0 % | 0 | 90–100 % 3★ |

Across all 5 440 sessions: **5 440 / 5 440 finished, 0 errors.** No round was over 180 s for any child model at its ages.
Rounds over 120 s happened only for slow3 at 4–7, unfocused, and tapper at 5+.

**Verdicts**

| target | result |
|---|---|
| typical 4-year-old chapter 60–100 s | **PASS: 95 s** (p10–p90 84–107) |
| typical sessions ≤ 8 min, every age | **PASS: max 473 s** (age 3) |
| careful 4-year-old model, session p90 ≤ 480 s | **PASS at ages 3/4 (460 / 452), FAIL at age 5: 491 s** (n = 192; the paired re-run gives 483 s). The engineer's 477 s came from n = 48. Fixed by P1-3, which gives 465 s. |
| toddler ≤ 480 s p90 | PASS (423 / 429) |
| no stuck rounds | PASS (0 structural; 0 rounds > 180 s for the child models at their ages) |
| unfocused child | INFO. Sessions are inherently long (p90 ≈ 540 s): ≈ 5 look-aways × 30 s. The game keeps them going with idle nudges and idle hints, and the browser auto-pauses after 5 nudges. |

### Time by topic (typical child)
Round times are flat across topics: at age 4, colours 20.7 s, animals 20.1, shapes 20.6, count 20.5, homes 20.6, size 20.5.
At 5, colours (2.7 pairs) take 19.8 s and the 3.2-pair topics take 22.1–22.5 s. **Caveat:** the child models match by key,
so they cannot see that *homes* or *count 1–5* are cognitively harder than *colours*. The model only measures pacing by pair
count. Topic difficulty has to come from real kids.

### Overhead per round (typical, age 4)

| pairs | scroll | peek + hide | post-solve (celebrate 0.7 + cheer 1.2 + roundDone 0.8) | play | non-play share |
|---|---|---|---|---|---|
| 2 | 1.74 s | 2.73 s | 2.73 s | 10.3 s | **41 %** |
| 3 | 1.73 s | 3.37 s | 2.73 s | 17.4 s | 31 % |

From the last match to the next tap you can make is **7.2–7.9 s**. Over a whole session (380 s), play is 219 s (58 %), round
transitions about 106 s, and chapter intros, Talk time and levelDone 55 s.

## 2. Help: hints and idle nudges

| driver | rounds with an auto-hint | hints / min | **hinted pair is the next pair found** | hint → that pair found | round with a hint vs without |
|---|---|---|---|---|---|
| typical | 4 % | 0.11 | 69 % | 6.2 s | 32.6 / 20.7 s |
| careful4 | 17 % | 0.36 | **47 %** | 11.4 s | 43.8 / 24.3 s |
| toddler | 18 % | 0.48 | 66 % | 6.1 s | 31.3 / 19.5 s |
| slow3 | 19 % | 0.34 | **28 %** | 18.1 s | 55.6 / 30.2 s |
| unfocused | 5 % auto + 18 % idle | 0.51 | 56 % | 18.4 s | 62.6 / 21.6 s |

**Does the auto-hint help the careful or slow child finish? No, not today.** The paired-seed run with every hint switched off
(`hintAfterStreak / idleHintFrom / sameTapHint 99`) gives the same times. Careful4 at 4 is 429 s with hints and 427 s
without. Slow3 at 4 is 518 / 518 s. Careful4 at 5 has a p90 of 494 s with hints and 471 s without, which is noise.

The cause is the timing. The hint fires at the 3rd mismatch, while that mismatch is still showing for 1.0 s, and it glows for
`hintGlowTime` 2.5 s. A careful child waits out the mismatch and then thinks for 1.6–3.0 s, and a slow child for
2.5–4.5 s, so the glow is gone before they tap.

| run (same seeds; 80 sessions per cell) | careful4 hint followed | slow3 hint followed | careful4 5 p90 | slow3 4 p90 | slow3 5 mean | toddler 4 mismatch | typical 4 chapter |
|---|---|---|---|---|---|---|---|
| base | 49 % | 26 % | 494 s | 584 s | 610 s | 1.57 | 95 s |
| hints off | — | — | 471 s | 564 s | 619 s | 1.80 | 95 s |
| `hintGlowTime 6` | 82 % | 71 % | 465 s | 560 s | 598 s | 1.62 | 95 s |
| **`hintGlowTime 6, hintAfterStreak 2`** | **83 %** | **73 %** | **461 s** | **552 s** | **577 s** | **1.44** | **95 s** |

The larger confirmation run (n = 192 per cell, `y_base` against `y_hint`) uses `{hintGlowTime 6, hintAfterStreak 2}`.
Careful4 at 5 goes from 449 s (p90 483) to **435 s (p90 465)**, with mismatches 2.02 → 1.77. Careful4 at 4 has its max go from
503 to 485 s. Toddler at 4 has chapters cut 16 → 5 %. Typical 3/4/5 are unchanged (95 s chapter at 4). Rounds with a hint go
from 5 % to 17 % for a typical 4-year-old, which is acceptable at this age. Stars are unchanged (90 %).

**Idle nudges:** an absent child gets them at 12, 30, 57, 87 … s. The unfocused child gets 0.9 nudges a minute and at most 7
in one round. An idle hint is followed 57 % of the time, rising to 75 % with the bundle above. The idle hint usually glows
while the child is still away.

## 3. Surprise critters (round 2 of every chapter)

| driver | never appeared | tapped | shown but not tapped | enter → tap | on screen when ignored |
|---|---|---|---|---|---|
| typical (pigeon / bus / balloon) | 0 % | 69 / 61 / 69 % | 31 / 39 / 31 % | 2.4–2.7 s | 15 / 12 / 16 s |
| careful4 | 0 % | 62–64 % | 36–38 % | 2.6–3.2 s | 24 / 13 / 20 s |
| toddler | 0 % | 90–92 % | 8–10 % | 2.4–3.1 s | — |
| slow3 | 0 % | 71–83 % | 17–29 % | 4.7–5.1 s | 37 / 13 / 25 s |
| bots (critterTaps 0.2) | 0–1 % (bot 1 solves some rounds before the 1.5–3.5 s spawn) | 17–22 % | ≈ 80 % | 1.0–2.4 s | 6–11 s |

**Verdict: OK, no change needed.** Tap rates match each model's wish to tap, so no critter is missed because of timing. A
child who wants to touch one always can. The bus is the only critter that leaves by itself (12–13 s on screen). The pigeon
stays until the cheer. A surprise round costs about +2 s of play: for a typical 4-year-old, round 2 takes 18.4 s against
16.3 s for round 3 at the same 3 pairs. It never blocks.

## 4. Voice (real browser, fake TTS at a rate-0.9 tempo)

| run (age 4, ≈ 2.2 min) | lines asked for / min | lines spoken to the end / min | interrupted / dropped | **Gigi talking** | max in flight |
|---|---|---|---|---|---|
| bot 0.7, EN | 54.0 (14.6 per round) | 13.4 | 77 / 9 of 117 | 90 % | 4 |
| bot 0.7, VI | 53.5 | 11.1 | 81 / 9 of 116 | 91 % | 5 |
| child-paced, EN | 35.5 (12.8 per round) | 18.5 | 27 / 7 of 77 | 87 % | 5 |
| child-paced, VI | 34.6 | 14.8 | 35 / 8 of 75 | 91 % | 5 |
| headless estimate, typical 4 | 42 (16.8 per round) | — | — | — | — |

Line fate and delay at child pace (EN / VI). The delay is from the event to the moment the speech starts.

| caused by | spoken / requested | delay | problem |
|---|---|---|---|
| round prompt (priority) | 4/4, 4/5 | **2.9 / 3.3 s** | The prompt waits behind the cheer line and the walk line, so it runs straight over the peek. |
| peek "Look carefully!" | 3/5, 2/6 | **3.8 / 4.1 s** | The peek at age 4 lasts 2.2 s plus the waves (≈ 2.7 s), so "look carefully" comes **after the windows have closed**. |
| hide "Now they hide!" | **1/5, 0/6** | — | Almost never heard. It is flushed by the first flip. |
| walk "Trot, trot!" | 3/6, 6/6 | 0.9–1.3 s | Dropped half the time (queue > 2). |
| cheer | 4/5, **1/5 (VI: 4 dropped)** | 1.8–3.1 s | Queued behind the match line (2.4 s). |
| flip name | 12/26, 8/25 | 0.1 s | The 2nd window's name is always cut 0.12 s later by the match / mismatch line, which says both names anyway. |

Timeline of one transition (bot 0.7, EN; t = 0 at `cheer`):
- −0.70 s: the match starts "Two purple cars! Hooray!" (2.4 s).
- 0.00: the cheer line is queued and starts at 1.86 s (2.9 s long).
- 2.03: scroll and round. "Trot, trot!" is **dropped**. The prompt is queued and starts at 4.82 s.
- 3.75: peek. The peek line is queued.
- 6.77: hide. The hide line is queued.
- 7.10: play.
- 7.44: "Look in all the windows!" finally starts, with the windows shut, and is cut by the first flip at 8.48.

**A second bug:** `speakPrompt` sets `promptUntil` from the moment of the *request*, not from when the line starts. With
2.4–3.3 s of queueing, the protection runs out before the prompt is even spoken, and the first flip cuts the instruction. This
happened to 1/7 prompts in EN and 4/7 in VI in the bot run.

**Repetition:** 56–85 distinct texts per 2 minutes, and a spoken line never repeats back to back. The `great` and `cheer` lists
share "What a bright building, {child}!", so the same sentence can come twice within a second at 3 stars (`great` fires
50 % of the time right after `cheer`). The spammer asks for 150–200 lines a minute, each one interrupting the last. iOS
`speechSynthesis.cancel()` churn at that rate is a known source of a stuck synthesizer.

## 5. Content variety

| topic (ages) | pairs repeated from the previous round | identical rounds |
|---|---|---|
| **colors** 3 / 4 / 5 | **25 / 35 / 48 %** (all pairs repeated 0 / 5 / 11 %; same colour thing 16–27 %) | 0 |
| shapes 4 / 5 | 12 / 27 % | 0 |
| count 3 / 4 | 14 / 12 % | 0 |
| initial 6 / 7 | 35 / 44 % (vi has 5 initials) | 0 |
| animals, size, homes, letters, lower, add, sub, oddeven | 0 % | 0 |

Colours repeat because the colour pool is a random clash-free set of 3, so 3 pairs from 3 colours cannot avoid the previous
round's colours. `pt_eval_colors.js` tests an in-memory patch: choose the safe set that shares the fewest colours with the
previous round, and a different thing from the previous round. It brings repeats down from **23 / 37 / 48 % to 1 / 3 / 2 %**
and same-thing repeats from **16 % to 0 %**. Homes is balanced: each of the 9 animals is 11–12 % of homes pairs, and a homes
chapter shows 8.1 of 9 animals on average (min 6).

## 6. Real browser (speed 8, bot 0.8, mute, autorestart; iPad-landscape context 1180×820)

| age | browser sessions (game s) | browser round | headless bot0.8 (ipadL, n 40) | headless round | console errors |
|---|---|---|---|---|---|
| 3 | 246, 245, 246 | 12.5 s | 243 (239–248) | 12.3 s | 0 (3 Chrome "AudioContext not allowed" warnings: autostart has no gesture, as expected) |
| 4 | 244, 247, 245 | 12.5 s | 244 (239–248) | 12.4 s | 0 |
| 5 | 274, 279, 274 | 14.4 s | 270 (265–275) | 14.0 s | 0 |

The browser matches headless within 2 %. Critters appeared 12/12 times in each age's 3 sessions. Headless Chromium ran at
35–44 fps with software rendering, which is not representative of a device.

## 7. Designer's view: fun and learning

- **Pacing.** The transition after a building (celebrate 0.7 s + cheer 1.2 s + stars 0.8 s + trot 1.6 s) is right *visually*.
  The cheer is short but punchy, and the trot is a nice breath. Do not lengthen the scroll. The problem is the *audio*: about
  9 s of speech is crammed into a 4.5 s transition plus a 2.7 s peek. The peek is the learning moment of a memory game, and
  right now it is narrated by the previous building's praise. Fix the speech (P1-1, P1-2), not the timers.
- **Warm-ups.** Two 2-pair buildings per chapter at age 4 are 41 % non-play, and 65 % of them are error-free for a typical
  4-year-old. They are easy, but they are the confidence builders, and making them harder costs time (see P3-4, rejected).
  Keep them.
- **Stars** are generous: 89 % of rounds get 3 stars for a typical 4-year-old, and 95 % of the maximum is reached. That is
  fine for ages 3–5 (no fail state). Stars still separate the careful child (73 %) and the tapper (42 %).
- **Learning value.** Every match gets its spoken lesson ("Two red umbrellas", "The dog lives in the kennel"), and the
  match line is heard 50–75 % of the time at child pace. The 2nd-window name is redundant. Colours at ages 4–5 reuse the
  previous round's colours too often, which is the weakest learning spot.
- **Kindness.** There is no fail state and help arrives, but at the moment it arrives too briefly to be used (P1-3). After the
  fix, a slow child follows a hint 73 % of the time.

## 8. Prioritized changes

### P1
1. **Clear the speech backlog at the round transition (`main.js`).**
   - `case 'scroll'`: delete `if (!e.first) speak(T('walk'));`. The clip-clop steps and the whoosh already say it.
   - `case 'cheer'`: `if (world.round >= world.roundsPerLevel - 1) speak(T('cheer'));`. Only the chapter's last building
     gets the spoken cheer; the others keep the fanfare and confetti. (Better still: speak it only when
     `!GW.Voice.isSpeaking()`.)
   - `case 'roundDone'`: delete the 50 % `speak(T('great'))`.
   - `case 'peek'`: `if (!GW.Voice.isSpeaking()) speak(T('peek'));`. `case 'hide'`: the same guard.

   Expected effect, estimated from the timeline: the backlog at the next round's start goes from ≈ 2.9 s to ≤ 0.5 s. The
   prompt starts ≤ 0.5 s after the round event and ends inside the peek. Lines per round go from 12.8 to about 9, and
   Gigi talks about 65 % of the time instead of 90 %. Re-check with `node tests/sim/pt_eval_browser.js K && node tests/sim/pt_eval_voice.js`.
2. **Protect the instruction from when it is spoken, not from when it is requested (`main.js`).**
   ```js
   let pendingPrompt = '';
   function speakPrompt(txt, opt) {
     pendingPrompt = txt; promptUntil = Infinity;               // protected while it waits in the queue
     const p = GW.Voice && GW.Voice.say(txt, opt || {});
     if (p && p.then) p.then(() => { if (pendingPrompt === txt && promptUntil === Infinity) promptUntil = 0; });
   }
   // boot(): GW.Voice.onStart = (t) => { if (t === pendingPrompt) promptUntil = performance.now() + 300 + 72 * t.length; };
   ```
   Expected effect: prompts cut by a flip go from 1/7 (EN) and 4/7 (VI) to 0. The `interrupt: true` repeat on a Gigi tap
   (line 419) still works, because it is spoken right away.
3. **Make the hint last long enough to use (`GW.CONFIG`): `hintGlowTime: 2.5 → 6`, `hintAfterStreak: 3 → 2`.**
   - Hinted pair found next: careful4 49 → 83 %, slow3 26 → 73 %, unfocused 57 → 75 %.
   - Careful4 at age 5: p90 483 → **465 s**, which turns the only FAIL into a PASS.
   - Slow3 at 4: p90 584 → 552 s. Slow3 at 5: mean 610 → 577 s.
   - Mismatches per round −8 to −19 %.
   - Typical 3/4/5: unchanged (95 s chapter at 4); hint rounds 5 → 17 %.
   - If you want the hint frequency at 5+ unchanged, make it per age: `hintAfterStreakByAge: {3: 2, 4: 2}` (needs a
     two-line change in `_mismatch`).

### P2
4. **Don't speak the 2nd window's name (`main.js case 'flip'`): `if (e.open === 2) break;` after the sound.** The match or
   mismatch line says both names 0.12 s later. Today that name is interrupted 100 % of the time (40/42 flips cut in the bot
   run). To keep the lesson, also remove the 1.5 s `lastWrongSay` throttle on mismatch lines, or fall back to
   `sayFlip` when the throttle blocks one. Expected effect: about −25 % speech requests and half as many `cancel()` calls
   (iOS stability).
5. **Colour variety (`content.js` `case 'colors'`).** Choose the safe set with the least overlap with `pv`:
   `pool = SAFE_SETS` filtered to the minimum `|s ∩ pv|`, then `rng.pick`. Avoid the previous round's thing: add
   `obj` to `sum` and use `if (prev && prev.obj === one) one = things[1];`. Simulated (`pt_eval_colors.js`): colours repeated
   from the previous round 23 / 37 / 48 % → **1 / 3 / 2 %** (ages 3 / 4 / 5); same thing 16 % → 0 %.
6. **Remove the line the `great` and `cheer` lists share (`i18n.js`).** Take "What a bright building, {child}!" and
   "Ngôi nhà sáng rực rồi, {child} giỏi quá!" out of `great`, which P1-1 retires anyway. This avoids the same sentence twice
   within a second.

### P3
7. **Re-glow the idle hint on return.** On the first window tap after ≥ 1 idle nudge in the round, call `_doHint(true)` again
   (6 s glow) if the pair hinted while the child was away is still unfound. This is for the unfocused child, whose idle hint
   usually expires unseen (57 % followed). Not simulated.
8. **Throttle flip speech for spammers (`main.js case 'flip'`).** Skip `speak` if the previous flip line was requested
   < 0.5 s ago, but keep the sound. The spammer asks for 40–58 flip names a minute, each one interrupting.
9. **`adaptSlowPlay 40 → 30` (optional).** It only affects the slow child: slow3 at 4 p90 584 → 561 s, slow3 at 5 mean
   610 → 577 s. No change for typical, careful4 or toddler.
10. **Tested and rejected: `pairsByAge[4] = [2, 3, 3, 3]`.** It makes the warm-up less trivial, but typical 4 chapter 95 → 99 s,
    careful4 cuts 50 → 84 %, and slow3 at 4 p90 560 → 662 s. Even with P1-3 and `chapterTimeLimit 75` it only gets back to
    95 s by cutting 26 % of chapters. Keep `[2, 2, 3, 3]`.
11. **Alternative to P1-3 for the age-5 p90 only: `pairsByAge[5] = [2, 3, 3, 4]`.** In the paired run, careful4 at 5 p90 494 → 477 s, typical 5 chapter 99 → 96 s, toddler at 5 mismatches 2.46 → 2.11. It is less effective than P1-3 and lowers the challenge at 5. Use it only if P1-3 is not taken.
12. **Housekeeping.** `giraffe-city-windows/CLAUDE.md` still describes Dee's Forest Memory (`DM` namespace, Dee voice rules,
    `dm:` storage prefix). Update it for Gigi / `GW`.
