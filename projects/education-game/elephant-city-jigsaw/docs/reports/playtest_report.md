# Pom's Puzzle Town — high-speed playtest report (2026-11-09)

Playtester (report-only: no file under `game/` was changed). Everything below is reproducible with the commands in §7.

## 0. Verdict (as a 4-year-old's parent)
A calm, pretty, well-paced puzzle game. A typical 3–5-year-old finishes in **≈ 6.3 min** (p90 6.7), chapters average
**92–94 s**, 70 % of pictures earn 3 stars, there is no way to fail, the magnet after a near miss always works (100 %), no
content repeats within a session, and no NaN, stuck state or piece off screen was seen in about 5 000 simulated sessions.
The real page ran 6 full sessions on iPhone portrait and landscape and 8 voice-log sessions with **0 errors and 0 broken lines**.

Four things stop it from being "hand it to my 3-year-old and walk away":
1. **P1 — a child who taps the RIGHT piece and never drags is stuck forever.** 40 / 40 sessions at every age, 0 rounds
   done. Assist is only triggered by grabbing a *different* piece or by pressing the board.
2. **P2 — Pom talks over himself.** At real speed Pom is talking **91 % (EN) / 95 % (VI)** of play time. Only **56 % (EN) /
   38 % (VI)** of instructions are heard to the end. The round praise is lost **74 %** of the time, and the chapter praise
   with the child's name is heard to the end **0 %** of the time.
3. **P2 — a slow 3-year-old needs 8.6–9.2 min** (p90 9.4–10.2), above the 8 min rule. A child who only taps (never drags)
   needs 10 min, or 17 min if they are also slow.
4. **P2 — from the 2nd session the first chapter can be the hardest topic** (age 3: counting; age 4: counting; age 7:
   take-away), and the chapters are no longer easiest-first.

The recommended changes are 4 CONFIG values plus 6 small code changes. Simulated together, they bring every model to
**≤ 7.3 min (p90 ≤ 8.2)** and remove every stuck case. Prompts are then heard to the end **97 % (EN) / 92 % (VI)** of the
time and praise **100 %**, and Pom talks 78 % of the time instead of 91 %. A typical child loses only 0.1–0.2 min.

## 1. Method
- **Headless** (`tests/sim/hs_playtest.js`, real `world.js` through the touch API: press → touchmove path → hold → lift;
  1/30 s frames; 5 viewports: iPhone P/L, iPad L/P/Air; EN/VI alternating). Baseline `--n 40`: **3 180 sessions** (ages 3–7 ×
  14 models). Each change was re-simulated with `--config` / `--patch`.
- **Child models** (`tests/sim/lib.js`). Existing: typical, slow3 (slow 3-year-old), perfect, tapper (random presses and
  drags), spammer (6 presses/s), absent, bot 0.5/0.8/1. **New in this playtest:**
  `high` (lets go 0–160 px above the shadow), `near` (lets go 110–200 px beside the shadow, on the board),
  `taponly` (never drags; taps a tray piece, the asked one with p = skill), `tapsmart` (never drags, always taps the right
  piece), `slowtap` (taponly with the slow-3-year-old timing).
- **New metrics:** hint without a wrong drop, near miss → fit after magnet, assist without a mistake, repeated set /
  scene, per-chapter numbers, Talk auto-answers.
- **Sim-only patches** (`--patch`, `lib.js applyPatches`) model the proposed code fixes on a single world instance, so
  their effect can be measured before anyone edits `game/`.
- **Spoken flow at real speed — new `tests/sim/voice_flow.js`.** At `?speed=8` the browser makes speech log-only, and the
  main.js guards run on the wall clock, so the browser log cannot show what a child actually hears. This sim copies
  main.js's speech policy event by event onto the world clock, through a model of the PZ.Voice queue (1 speaking + 2
  waiting, a 5 s stale limit, interrupt = flush + cancel). Line durations use voice.js's own estimate,
  600 ms + 85 ms × chars / 0.9. 128 sessions (typical + slow3 × ages 3–4 × EN/VI); each fix was then measured with `--vpatch`.
- **Real browser** (Playwright, `?bot=1&speed=8`):
  - `hs_browser_vp.js`: ages 3 / 4 / 6 on iPhone portrait 393×852 and landscape 852×393. All 6 sessions completed (16
    rounds each); the only console messages were the headless AudioContext autoplay warnings.
  - `hs_voicelog.js`: ages 3 / 4 / 5 / 7 × EN / VI. 8 / 8 sessions OK; 0 broken lines (`{`, `undefined`, NaN), 0 English
    words in VI, 0 VI lines without diacritics.
  - Screenshots of iPhone portrait and landscape mid-round.

## 2. Baseline numbers (current CONFIG)
### 2.1 Pace and help (headless, n = 40 per model × age)
| model | age | session min (p90) | chapter s mean [p10–p90] | round s (p90) | max round s | stars 3/2/1 % | wrong / near / tap per round | rounds with a hint % | hint with no wrong drop % rounds | rounds with assist % |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 6.4 (6.7) | 94 [83–104] | 20.1 (26.9) | 42 | 63/29/8 | 0.46 / 0.11 / 0.39 | 23 | 8 | 0 |
| typical | 4 | 6.3 (6.7) | 92 [83–101] | 21.0 (29.4) | 56 | 70/23/6 | 0.38 / 0.07 / 0.40 | 20 | 8 | 0 |
| typical | 5 | 6.2 (6.5) | 92 [83–101] | 20.4 (31.2) | 53 | 70/22/7 | 0.39 / 0.05 / 0.19 | 10 | 1 | 0 |
| typical | 7 | 5.7 (6.0) | 84 [61–96] | 16.5 (26.1) | 44 | 83/14/2 | 0.19 / 0.06 / 0.22 | 5 | 1 | 0 |
| drops high | 3–4 | 6.2–6.5 | 92–95 | 20.6–21.5 | 48 | 64–68 / 25 / 7–10 | 0.41–0.48 / 0.16–0.19 / 0.4 | 23–27 | 9 | 0 |
| drops near | 3–4 | 6.3–6.4 | 93–94 | 20.2–21.6 | 47 | **91–93** / 6–9 / 0–1 | 0.07–0.10 / **0.81–0.88** / 0.1 | 2–3 | 1 | 0 |
| **slow 3-year-old** | 3 | **8.6 (9.4)** | **127 [100–159]** | 35.4 (53.6) | 99 | 58/25/17 | 0.65 / 0.19 / 0.72 | 48 | **19** | 3 |
| **slow 3-year-old** | 4 | **9.2 (10.2)** | **136 [108–170]** | 38.5 (57.4) | 103 | 45/31/25 | 0.94 / 0.19 / 0.86 | 52 | **19** | 4 |
| **tap only** | 3 / 4 | **10.4 / 9.9** (11.6 / 10.8) | 154 / 146 | 45 / 43 (65 / 61) | **145** / 115 | 100/0/0 | 0 / 0 / 14.4–14.8 | 100 | 100 | 100 |
| **slow tap only** | 3 / 4 | **17.2 / 17.0** (20.3 / 19.2) | 257 / 254 | 79 / 78 | **256** / 177 | 100/0/0 | 0 / 0 / 13 | 100 | 100 | 100 |
| **taps the right piece** | 3–7 | **never finishes** | — | — | — | — | — | — | — | **0 (stuck 40/40)** |
| random tapper | 3 / 4 | 6.9 / 7.0 | 102 / 104 | 28 | 59 | 71–78 / 20–25 / 2–5 | 0.25–0.35 / 0.55 / 3.3–3.5 | 100 | 100 | 98–100 |
| spammer | 3–7 | 5.5–6.2 | 80–92 | 15–19 | 33 | 100/0/0 | 0 / 0 / 8–16 | 100 | 100 | 100 |
| perfect | 3–7 | 4.2–5.7 | 62–83 | 11–17 | 42 | 100/0/0 | 0 | 0 | 0 | 0 |
| bot 0.8 | 3–7 | 3.4–5.2 | 50–76 | 8–15 | 38 | 54–75 / 22–30 / 3–17 | 0.3–0.7 | 10–24 | 2–6 | 0 |
| absent | 3–7 | waits (no auto-play) | — | — | — | — | — | idle at 15.7, 33.7, 60.7, 90.7, 120.7, 150.7 s (12 → 18 → 27 → 30 s backoff ✓) | | |

Other checks:
- **0 NaN, 0 pieces off screen, 0 "2 wrong drops without a hint"** for every model.
- **Stuck rounds (> 120 s) only for the tap-only models;** the only stuck *states* are `tapsmart`.
- **Near miss → fit after the magnet: 100 %** for every model (> 100 % at age 7: an odd/even "find all" step places
  several pieces).
- **Talk time:** 0 % auto-answered for an engaged child. Typical children answer right 76–95 %; the slow 3-year-old 56–57 %.
- **Repeated content:** a repeated piece set within a session: 0 % (ages 3–6), 0.2–0.7 % (age 7, odd/even). Content stats
  over 20 000 rounds: 0 invalid, 0 % the same set twice in a chapter. **The board picture is the same for all 4 rounds of a
  chapter** (one scene per topic, by design): 71–73 % of rounds reuse their chapter's scene.
- **First chapter:** typical age 4: 92 s, 78 % three-star rounds, 0.27 wrong drops per round. Chapters 2–4: 66–70 % three
  stars, 0.38–0.44 wrong drops. The first chapter is the easiest, as required (first session only — see P2-4).
- **Talk-time cut:** typical age 3 / 4 children get the 4th round in only 66 % / 46 % of chapters (the 75 s limit cuts the
  rest). At age 4, rounds have **2.3 slots on average**, not the 3 in the requirement (short rounds + "colours with a
  distractor = 2 + 1").

### 2.2 Spoken flow at real speed (`voice_flow.js`, typical / slow3, ages 3–4)
| model | age | lang | Pom talks % of play | lines / min | cut mid-line % | never heard % | prompt starts after the ask, s (p90) | prompt heard in full % | round praise heard % | chapter praise (child's name) heard % | wrong-drop line heard in full % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | en | **91** | 23.9 | 31 | 9 | 1.9 (3.0) | **56** | **26** | **0** | **6** |
| typical | 4 | vi | **95** | 21.5 | 35 | 12 | 2.5 (4.0) | **38** | 26 | 0 | 5 |
| typical | 3 | en | 89 | 23.3 | 30 | 12 | 2.2 (3.2) | 60 | 25 | 0 | 6 |
| slow3 | 3 | en / vi | 73 / 77 | 18 | 20 / 22 | 9 / 11 | 2.2 / 2.9 | 80 / 75 | 30 | 0 | 40 |

Why lines get cut:
- **The next prompt waits behind the "placed" line.** Placed lines are long ("Click! Just right — the orange balloon!" ≈ 4.4 s
  in EN, longer in VI). The next ask comes `askGap` 0.6 s after a fit, so the prompt starts 1.9–2.5 s late. A 4-year-old acts
  on the bubble / shadow before Pom finishes: prompts are cut by the next **placed** line (VI: 141 of 445) or by the
  **pickup name** (EN: 80 of 447).
- **The prompt guard is shorter than the prompt.** main.js sets the guard to 0.3 s + 72 ms × chars after `onStart`, while
  voice.js itself estimates 0.6 s + 94 ms × chars at rate 0.9. So for the last ≈ 1 s — which is where the colour / shape
  word is — a pickup name may interrupt the prompt.
- **Round-done queue: placed line → "The picture is done — look, it moves!" → praise.** The praise waits more than 5 s and
  is dropped as stale (≈ 10 per session). The child's name (`great`) is therefore almost never said during play.
- **Chapter end:** the `levelDone` "Great puzzling, {child}!" queues behind the Talk result line, and 1.8 s later the next
  chapter title interrupts it (heard to the end 0 %).
- **Wrong-drop line:** "That's the blue kite. Let's find the red one!" (≈ 5 s) is cut by the next pickup name after
  ≈ 1–2 s, so the corrective half is lost 94 % of the time for a typical child. The queued hint line "Psst! Look at the
  shining piece!" is flushed in the same moment (heard 3–8 %; the glow and the hand still show).
- **Count runs are never cut** (0 of 87 per 12 sessions). ✓
- Repeats within 10 s: 1.8–4.9 per session, mostly the pickup name of a piece that was picked up again after a wrong drop
  or a near miss — that is natural. "One balloon!" (pickup) followed by "One balloon!" (count run) also repeats.
- Browser voice log (bot, speed 8): 34–39 lines requested per game minute and 98–145 distinct lines per session. The most
  repeated lines are the alive line (×7–9) and toot (×7) — these are fine.

### 2.3 Real browser, iPhone (speed 8)
| age | viewport | lang | rounds | placed | wrong | hints | errors | voice braces / EN-in-VI / back-to-back repeats |
|---|---|---|---|---|---|---|---|---|
| 3 | iPhone portrait | en | 16 | 32 | 6 | 2 | 0 | 0 / – / 0 |
| 3 | iPhone landscape | vi | 16 | 32 | 5 | 4 | 0 | 0 / 0 / 0 |
| 4 | iPhone portrait | en | 16 | 44 | 5 | 2 | 0 | 0 / – / 0 |
| 4 | iPhone landscape | vi | 16 | 44 | 13 | 7 | 0 | 0 / 0 / 0 |
| 6 | iPhone portrait | en | 16 | 52 | 20 | 9 | 0 | 0 / – / 0 |
| 6 | iPhone landscape | vi | 16 | 52 | 21 | 6 | 0 | 0 / 0 / 0 |

The second session opened with **`count` (age 3)**, `size` (age 4) and `letters` (age 6) — see P2-4.

Screenshots: the board, shadows and big pieces read clearly at a glance in both orientations, and Pom and the bubble
are clear.
- In portrait the two-row tray is sized for 4 pieces, so a 2-piece warm-up shows mostly empty shelves.
- In landscape the town clock tower shows through the progress-dots pill. This is for the visual tester.

## 3. Findings
### P1
**P1-1 — Tapping the right piece never progresses (stuck forever).**
- Where: `world.js` `_grab` arms the assist only when `!this._isAsked(p)`, and an asked-piece tap → `_hopHome`.
- A 3-year-old who has not learned to drag — but knows the answer and taps "this one!" — gets the hint hand forever and
  never completes a round: `tapsmart` stuck 40 / 40 sessions at every age.
- A child who taps random pieces gets through only by hitting a *wrong* piece after 4 no-progress actions: 10 min per
  session, rounds up to 145 s (256 s when slow).
- Fix (code, §5-A): after the assist threshold, grabbing the asked piece also arms the assist, so the tap glides it in.
- Simulated (`--patch tapassist`): tapsmart 0 % → 100 % done, 6.7–7.0 min.

### P2
**P2-1 — Slow 3-year-old over 8 min.**
- 8.6 / 9.2 min (p90 9.4 / 10.2); chapters 127–136 s; 99–100 % of chapters already stop at round 3.
- `chapterTimeLimit` cannot help, because the 3-round minimum is the limit.
- Fix: `chapterMinRounds` 3 → 2. The slow child gets 2 rounds when the chapter is already past 75 s; typical children are
  unaffected, because they are never past 75 s after round 2.

**P2-2 — Tap-only path too slow.**
- Even with P1-1 fixed, assist after 4 no-progress actions means ≥ 5 taps per piece: tap-only 7.3 min, slow tap-only
  12.1 min.
- Fix: `assistAfterYoung` 4 → 3. Together with `chapterMinRounds` 2, tap-only takes 6.7–6.8 min and slow tap-only 7.3 min.

**P2-3 — Pom's speech is cut or lost** (§2.2). Four fixes, measured together:
- `askGap` 0.6 → 1.0 (CONFIG): the placed line finishes before the next prompt starts.
- `levelDoneTime` 1.8 → 3.6 (CONFIG): the chapter praise with the child's name gets heard.
- Code §5-C: one round-done line, not two.
- Code §5-D: a prompt guard as long as the prompt.
- Code §5-E: wrong / near-miss feedback is protected like the count run.

**P2-4 — Rotation breaks "easiest first" / "first chapter trivially easy".**
- `content.js topicsFor` puts the topic left out last time **first** — that is often the pool's hardest topic.
  Session 2 at age 3: `count > shapes > size > animals`; at age 4, session 4: `count > colors > shapes > animals`; at age 7:
  `sub > count > add > oddeven`.
- Fix (§5-F): keep the rotation, but sort all 4 by pool (difficulty) order.

**P2-5 — Hints for curious tapping.**
- A tap ("what is this?" — the requirement encourages it) counts as no-progress, so two taps light the hint hand: 8 % of
  typical rounds at ages 3–4 and 19 % of the slow child's rounds get a hint **without any wrong drop**. That spoils the
  puzzle.
- Fix (§5-B): taps still count towards the assist but never trigger the 2-miss hint. The rule "after 2 misses the target
  glows" stays for wrong drops and drops off the board.
- Simulated: 8 % → 3 % (typical) and 19 % → 6–8 % (slow3); tap-only still gets an idle hint or assist.

### P3
1. **Pom is very chatty** — 89–95 % of play time even after the fixes above (83–90 %). The placed line repeats the name the
   pickup line just said ("The red car!" … "Click! The red car fits!"). Suggestion (§5-G): for colours / shapes / size /
   animals say a short "Click! It fits!" / "Cạch! Vừa khít!"; keep the long lines for counting, letters and maths. Simulated
   with all the fixes: Pom talks 78 % (EN) / 83 % (VI), prompts heard in full **97 % / 92 %**, prompt delay 0.5 / 0.6 s.
2. **The hint voice line is almost never heard** (3–8 %; queued, then flushed by the next pickup). The glow and hand carry
   it, so this is acceptable. Optional: make the hint line `priority`.
3. **VI double particles in "next" prompts:** "Thêm một mảnh nữa nhé! Bé ơi, tìm mảnh ghép màu xanh lá nhé!" (two "nhé",
   plus a "Bé ơi" in mid-sentence) and "Tiếp nào! Bé tìm mảnh ghép màu đỏ nào!" (two "nào"). `ask(next)` should drop the
   leading "Bé ơi," and avoid a repeated particle for every prefix, not only "Giờ thì".
4. **Same board picture for all 4 rounds of a chapter** (scene per topic). The pieces vary, so it is fine for a toddler, but
   a 5–7-year-old will notice. Optional: 2 scene variants per topic, alternating per round.
5. **Age-4 rounds average 2.3 missing pieces**, not 3, and the 4th round is reached in only 46 % of chapters. That is good for
   pace, but a bright 4-year-old may find it short; the parent can raise the age. No change recommended.
6. **Typical chapter p90 is 101–106 s** (target 60–100). The mean of 92–94 s is inside the target; no change, because a
   lower `chapterTimeLimit` (tested: 70 s) only cuts the 4th round more often (87 %).
7. **Slow model tail:** 1 round in about 1 000 slow-3-year-old rounds still took 123–140 s, all at ages 5–7 (a slow
   3-year-old on age-7 content) or from heavy slipping (13 pickups, 4 wrong drops, 2 assists in one round). The child is
   being helped all along; not a game fault.

## 4. Recommended CONFIG changes (`game/js/world.js`, `PZ.CONFIG`)
| key | old → new | why | simulated effect (alone) |
|---|---|---|---|
| `chapterMinRounds` | 3 → **2** | P2-1 | slow3 age 3 / 4: session 8.6 / 9.2 → **7.3 / 7.2 min** (p90 9.4 / 10.2 → 8.1 / 7.8); chapter 127 / 136 → 108 / 106 s. Typical, high, near: unchanged (6.2–6.5 min) |
| `assistAfterYoung` | 4 → **3** | P2-2 | with §5-A: tap-only 7.3 → 6.6–6.8 min, slow tap-only 12.1 → 10.4 min; typical assisted rounds 0 → 2–4 %; slow3 7 → 17–21 % |
| `askGap` | 0.6 → **1.0** | P2-3 | prompt start delay 1.9 → ≈ 1.2 s; prompts heard in full (with §5-C/D/E) EN 83 → 90 %, VI 64 → 69 %; cost ≈ +0.1 min per session for typical children, +0.3 for perfect |
| `levelDoneTime` | 1.8 → **3.6** | P2-3 | chapter praise with the child's name heard in full 0 → **77–92 % EN / 40–46 % VI**; +7 s per session |

Not recommended:
- `chapterTimeLimit` 75 → 70: typical chapters 92 → 86 s, but the 4th round is cut in 87 % of chapters at age 4.
- `hintAfterMisses` 2 → 3: this would break the skill's "after 2 misses" rule; use §5-B instead.

**All of it together** (4 CONFIG keys + `--patch tapassist,tapnohint`, `--n 30`, ages 3–7):
| model | age | session min before → after (p90 after) | chapter s before → after | max round s after | stuck after |
|---|---|---|---|---|---|
| typical | 3 / 4 / 5 / 7 | 6.4 / 6.3 / 6.2 / 5.7 → 6.6 / 6.4 / 6.4 / 5.8 (7.1 / 6.9 / 6.8 / 6.0) | 94 / 92 / 92 / 84 → 95 / 93 / 93 / 83 | 41–52 | 0 |
| slow 3-year-old | 3 / 4 | 8.6 / 9.2 → **7.3 / 7.3** (7.8 / 8.2) | 127 / 136 → 106 / 106 | 85 / 104 | 0 |
| tap only | 3 / 4 / 7 | 10.4 / 9.9 / 8.9 → **6.7 / 6.8 / 6.6** | 154 / 146 / 132 → 98 / 98 / 95 | 48–68 | 0 (was 2 rounds > 120 s) |
| taps the right piece | 3–7 | stuck → **6.7–6.9 min** | — → 97–100 | 50–93 | **0 (was 40 / 40)** |
| slow tap only | 3 / 4 | 17.2 / 17.0 → **7.3 / 7.3** (rec_all) | 257 / 254 → 107 | 82–95 | 0 (was 46 / 37 rounds > 120 s) |
| drops high / near | 3–7 | 5.8–6.5 → 5.9–6.6 | 85–95 → 85–95 | ≤ 62 | 0 |
| spammer / perfect | 3–7 | 5.5–6.2 / 4.2–5.7 → 5.6–6.3 / 4.6–6.0 | | | 0 |

Stars are unchanged (typical age 4: 70/23/6 → 71/22/7). Hint without a wrong drop: typical age 4 8 % → 3 %. 0 NaN, 0 off
screen, 0 stuck states.

## 5. Recommended code changes (exact; game code owners apply them)
**A (P1-1) — `game/js/world.js`, `P._grab`:** arm the assist for the asked piece too. Replace the first `if` block with:
```js
if (!this._stepDone && this._noProg >= this._assistAfter()) {
  if (!this._isAsked(p)) {
    var a = this._askedPiece();
    if (a && this._grabbable(a)) {
      p.qv += kickFor(0.08, cfg.squashOmega, cfg.squashZeta);
      this._noProg = 0;
      this._emit({ type: 'assist', id: a.id, from: p.id, x: x, y: y });
      p = a; p._assisted = true;
    }
  } else {   // the child pressed the right piece: a tap now glides it in (a drag still works as usual)
    this._noProg = 0; p._assisted = true;
    this._emit({ type: 'assist', id: p.id, from: p.id, x: x, y: y });
  }
}
```
Note that `p.offX/offY` are 0 for an assisted piece, which is fine. Add a unit test: tap the asked piece 4 times (ages ≤ 4)
or 6 times (5+); the next tap → `placed`.

**B (P2-5) — `world.js`, tap branch of `pointerUp`:** replace `if (!this._stepDone) this._noProgress();` with
`if (!this._stepDone) this._noProg++;`. A tap still counts towards the assist but never triggers the 2-miss hint; idle hints
still come.

**C (P2-3) — `game/js/main.js`, `case 'roundDone'`:** speak ONE line — the praise (`great` with the child's name for 3 stars,
else `praise`) — and only show `alive` in the bubble. Replace `speak(aliveTxt); … speak(T(e.stars >= 3 ? 'great' :
'praise'))` with `PZ.UI.say(aliveTxt); if (now - lastPraise > 1200) { lastPraise = now; speak(T(e.stars >= 3 ? 'great' :
'praise')); }`. Effect: praise heard in full 26 → 100 %; lines never heard 9–12 % → 2–4 %.

**D (P2-3) — `main.js`, `onVoiceStart` and `speakPrompt`:** guard = `promptStart + 600 + 95 * display.length` (was
`300 + 72 * len`). This matches voice.js's own estimate at rate 0.9, so a pickup name can no longer cut the colour / shape
word at the end. Effect alone: prompts heard in full EN 56 → 76 %, VI 38 → 55 %; prompts cut by a pickup → 0.

**E (P2-3) — `main.js`, `case 'wrong'` and `case 'nearMiss'`:** after `feedback(txt)` add
`promptUntil = Math.max(promptUntil, performance.now() + 600 + 95 * txt.length);`. The feedback is then protected like the
count run: the next pickup only plips. Effect: wrong line heard in full 5 → 19–41 % (typical; the rest is cut by the
child's next fit) and 80–86 % (slow3).

**F (P2-4) — `game/js/content.js`, `topicsFor`:** `return [first].concat(fresh.concat(old).slice(0, 3)).sort(ord);`. The
rotation keeps the left-out topic in the session, but in difficulty order. Update the unit test that expects
"chapter 1 = the topic left out".

**G (P3-1, optional) — `game/js/i18n.js` + `sayPlaced`:** for colour / shape / size / animal fits use a short line ("Click!",
"Click! It fits!", "Yes! Click!" / "Cạch!", "Cạch! Vừa khít!", "Đúng rồi! Cạch!"), because the pickup already said the
name. Simulated with A–F: Pom talks 91 → 78 % (EN), 95 → 83 % (VI); prompts heard in full **97 % / 92 %**; prompt delay
0.5 / 0.6 s.

**H (P3-3) — `i18n.js` `ask(…, {next:true})`:** drop the leading "Bé ơi," after every VI "next" prefix, and do not add a
prefix ending in "nhé!" / "nào!" to a prompt that ends with the same particle.

## 6. Spoken flow after the fixes (`voice_flow.js`, typical age 4, n = 12 × EN / VI)
| set | Pom talks % EN / VI | prompt heard in full % EN / VI | prompt delay s EN / VI | praise heard % | chapter praise heard % EN / VI | never heard % EN / VI |
|---|---|---|---|---|---|---|
| now | 91 / 95 | 56 / 38 | 1.90 / 2.47 | 26 | 0 / 0 | 9 / 12 |
| C + D + E (+ `levelDoneTime` 3.6) | 86 / 91 | 83 / 64 | 1.49 / 2.03 | 100 | 88 / 40 | 2 / 3 |
| + `askGap` 1.0 (recommended) | 85 / 90 | **90 / 69** | 1.23 / 1.74 | 100 | 88 / 44 | 2 / 3 |
| + G short placed lines | **78 / 83** | **97 / 92** | 0.49 / 0.64 | 100 | — | 2 / 3 |

## 7. Reproduce
```
node tests/sim/hs_playtest.js --n 40 --tag base2                     # baseline, all 14 models (exit 1 = the P1 stuck state)
node tests/sim/hs_playtest.js --n 30 --models typical,slow3,taponly,tapsmart,perfect,near,high,spammer \
  --config '{"assistAfterYoung":3,"chapterMinRounds":2,"askGap":1.0,"levelDoneTime":3.6}' --patch tapassist,tapnohint --tag rec_final10
node tests/sim/voice_flow.js --n 12 --ages 3,4 --models typical,slow3 [--config '{…}'] [--vpatch praiseOnly,guard,fbguard,shortPlaced] [--dump 1]
node tests/sim/content_stats.js 200
NODE_PATH=$(npm root -g) node tests/sim/hs_browser_vp.js --ages 3,4,6 --sessions 1 --vp iphone-portrait,iphone-landscape
NODE_PATH=$(npm root -g) node tests/sim/hs_voicelog.js --ages 3,4,5,7
```
Outputs are in `tests/sim/out/`: `hs_base2`, `hs_p1–p3`, `hs_c1–c2`, `hs_rec_cfg`, `hs_rec_all`, `hs_rec_final`,
`hs_rec_final10`, and `voice_flow_*`. Only `*.json` there is git-ignored (`.gitignore`: `tests/sim/out/*.json`), even though
the script headers say "git-ignored". Either ignore all of `tests/sim/out/` or delete the `.md` / `.txt` run files before
committing.

Files changed by this playtest (tests only):
- `tests/sim/lib.js`: models `high`, `near`, `taponly`, `tapsmart`, `slowtap`; `applyPatches`.
- `tests/sim/hs_playtest.js`: new metrics table, `--patch`, new models in the default list.
- `tests/sim/voice_flow.js`: new.
- `docs/reports/playtest_report.md`: this report.

## 8. Fixes applied (2026-11-09, fixer)
Everything in §4 and §5 was applied to `game/` (tests and docs updated to the new numbers).

| item | what was done |
|---|---|
| **P1-1 / A** | `world.js _grab`: after the assist threshold a press on the **asked piece itself** arms the assist too (`assist {id, from: id}`, the piece keeps its grip offset); a quick tap then glides it in, a drag works as usual. Unit test: tap only the right piece at ages 3 / 4 / 5 / 7 → the 4th (≤ 4) / 7th (5+) tap places it. |
| **P2-5 / B** | `world.js pointerUp` tap branch: `this._noProg++` (counts towards the assist, never triggers the 2-miss hint). Unit test: two curious taps → no hint. |
| **P2-3 / C** | `main.js roundDone`: "The picture is done — look, it moves!" only in the bubble; ONE spoken line (`great` with the child's name for 3 stars, else `praise`). |
| **P2-3 / D** | `main.js`: prompt guard = `promptStart + 600 + 95 × chars` (`lineMs`) in `onVoiceStart`, `speakPrompt` (also the no-voice path). |
| **P2-3 / E** | `main.js wrong / nearMiss`: after `feedback(txt)` the line is protected the same way (`protect(txt)`), so the next pickup only plips. |
| **P2-4 / F** | `content.js topicsFor`: `[first].concat(fresh.concat(old).slice(0, 3)).sort(ord)` — the left-out topic is still played next session, but every session is easiest first. Unit test rewritten: 6 sessions per age, always in pool order, left-out topic always included. |
| **P3-1 / G** | `i18n.js sayPlaced(… e.named)` → `placed.any` ("Click! It fits!" / "Cạch! Vừa khít rồi!") for colours / shapes / size / animals when Pom named the piece at pickup < 8 s ago (`main.js` passes `named`); counting, letters, maths, initial keep their long lines. Tests added. |
| **P3-3 / H** | `i18n.js ask(vi, …, {next})`: no "Bé ơi," mid-sentence after any prefix; a prefix whose particle ("nhé!" / "nào!") already occurs in the prompt is swapped for the next prefix. Tests: a 7-key × 9-variant sweep, no "…Bé ơi", no doubled "nhé! … nhé!" / "nào! … nào!". |
| CONFIG | `chapterMinRounds` 3 → **2**, `assistAfterYoung` 4 → **3**, `askGap` 0.6 → **1.0**, `levelDoneTime` 1.8 → **3.6** (docs/MECHANICS.md, docs/VOICE.md updated). |
| P3-4 (optional) | **Done cheaply:** the board picture is mirrored on every odd round (`board.flip`, drawn by `PuzzleArt.drawBoard(opt.flip)`, kept in the gallery pictures); slot placement also prefers open scenery (visual P1-2), so the 4 pictures of a chapter look different. A second scene per topic was not added (content validation ties scene ↔ topic). |
| `.gitignore` | `tests/sim/out/*.json` → `tests/sim/out/` (the whole folder); the generated `.md` / `.txt` run files there were deleted. |

**Re-measured** (`node tests/sim/hs_playtest.js --n 20 --tag fix1`: 1 200 sessions, 0 failed, **exit 0**):

| model | ages | session min (p90) | done % |
|---|---|---|---|
| typical | 3 / 4 / 5 / 6 / 7 | 6.5 / 6.5 / 6.4 / 6.4 / 5.9 (≤ 6.8) | 100 |
| slow 3-year-old | 3 / 4 | 7.5 / 7.6 (8.2 / 8.2) | 100 |
| **taps the right piece only** | 3–7 | **6.6–7.0** (≤ 7.5) | **100 (was stuck 40 / 40)** |
| tap only | 3–7 | 6.6–7.1 | 100 |
| slow tap only | 3 / 4 | 7.5 / 7.4 (was 17.2 / 17.0) | 100 |
| random tapper / spammer / perfect / near / high | 3–7 | 5.6–7.1 / 5.6–6.2 / 4.6–6.0 / 6.0–6.5 / 5.8–6.6 | 100 |

0 NaN, 0 stuck states, 0 pieces off screen, 0 "2 wrong drops without a hint", 0 rounds > 120 s. Not re-run: `voice_flow.js`
(its speech model is a copy of the old main.js policy; it would need the C/D/E/G changes ported to measure them again).

**Not done:** P3-2 (hint line `priority`) — the glow + hand carry the hint, and a priority hint would cut the wrong-drop line that
is now protected; P3-5 / P3-6 / P3-7 need no change (as recommended).
