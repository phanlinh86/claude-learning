# Bop's Rainy Band — high-speed playtest report (2026-11-05)

Playtester: report-only (no file in `game/` was changed). Tools added: `tests/sim/hs_qa.js` (headless, extra child models,
pacing / content metrics, `--patch` prototypes of proposed world changes) and `tests/sim/hs_qa_browser.js` (the real page in
Playwright, voice-line analysis). Raw output: `tests/sim/out/qa_*.md|json` (git-ignored).

**Verdict:** the game is in good shape. The age-4 chapter mean is 94.3 s (target 60–100 s) and the session p90 is 406 s
(limit 480 s). No model gets stuck, nothing produces NaN, an absent child auto-pauses at 121 s, every member is asked
whenever n ≥ k, no two rounds in a row are identical, and taps during the song do nothing. The page threw 0 errors in 10
sessions, used no negative words, never said the number in `p.listen`, said a count word on every drum tap, and every
Vietnamese line was Vietnamese.
Two **P1** issues hurt the counting chapter, the one real learning moment of this game:
1. Bop's listen beats start while Bop is still speaking the prompt.
2. Extra drum taps count on the *next* drum ask and cut off its prompt.

Both fixes were simulated. The numbers are below.

## 1. How it was run
- **Headless:** `node tests/sim/hs_qa.js --n 200 --tag base`. That is 11 100 sessions = 5 ages × 11 models × 200, plus 20
  `absent`. Viewports rotate over iPhone P/L and iPad L/P, and EN/VI alternate. Everything runs through the real
  `pointerDown/Move/Up` API.
  - Models: `typical`, `slow3`, `perfect`, `tapper` (random taps anywhere), `spammer` (6 taps/s), **`slider`** (30 % of
    taps slide 30–60 px), **`overdrum`** (drums n + 1…3 at its own rhythm and doesn't stop when the count is done),
    **`songtap`** (hammers members, drum and Bop 3×/s during the song and the clear), `bot0.5`, `bot0.8`, `bot1.0`, `absent`.
  - Recommended set: `--tag final` (`--patch drumQuiet,shortNudge --config {...}`, see §5). These are 1 400 sessions plus
    the earlier variants `prop`, `prop2`, `q12`, `q12g`, `tapA`, `tapB` and `final85`.
- **Browser:** `node tests/sim/hs_qa_browser.js` loads
  `?autostart=1&bot=1&speed=8&mute=1&age=N&lang=L&seed=S` (seed picked so the session has a counting chapter). That is one
  full session per age × language, so 10 sessions. `RB.Voice.say` is wrapped, and each line is tagged with the world event
  that caused it plus `interrupt`/`priority`. A speech timeline is rebuilt with voice.js's own duration estimate
  (0.6 s + 85 ms/char ÷ rate 0.9).

## 2. Numbers — current build (headless, 200 sessions per row)
| age | model | chapter mean (p10–p90) s | cut % | session mean / p90 s | song phase / clear s | reward % of round | ask mean / p90 s | drum ask mean / p90 s | asks > 60 s | hinted asks % | ★★★/★★/★ % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | typical | 85.0 (73.8–97.1) | 4 | 347 / 370 | 2.2 / 0.9 | 17 | 5.3 / 9.1 | 8.4 / 17.0 | 0 | 0 | 44/39/17 |
| 3 | slow3 | 106.0 (91.2–121.9) | 66 | 431 / 463 | 2.2 / 0.9 | 12 | 9.5 / 15.9 | 13.2 / 23.0 | 0 | 1 | 34/40/26 |
| **4** | **typical** | **94.3 (82.2–107.9)** | 12 | **384 / 406** | 2.5 / 0.9 | 17 | 4.5 / 8.1 | 6.8 / 15.5 | 0 | 4 | 46/32/22 |
| 4 | slow3 | 122.8 (102.6–146.7) | 99 | 498 / 543 | 2.4 / 0.9 | 10 | 10.1 / 17.1 | 14.8 / 25.2 | 0 | 12 | 31/26/43 |
| 4 | slider | 99.6 (85.1–117.4) | 20 | 406 / 437 | 2.5 / 0.9 | 16 | 5.2 / 9.4 | 12.3 / 30.1 | 0 | 5 | 46/32/22 |
| 4 | overdrum | 94.5 (82.2–107.2) | 2 | 385 / 406 | 2.5 / 0.9 | 18 | 4.2 / 7.5 | 3.7 / 5.7 | 0 | 4 | 46/32/22 |
| 4 | spammer | 58.8 (43.5–86.0) | 0 | 242 / 269 | 2.5 / 0.9 | 31 | 1.4 / 3.4 | – | 0 | 42 | 17/10/73 |
| 4 | tapper | 200.6 (121.8–294.4) | 100 | 810 / 1084 | 2.4 / 0.9 | 8 | 18.5 / 43.0 | – | 293 | 44 | 22/11/66 |
| 4 | bot0.5 / 0.8 / 1.0 | 73.7 / 65.3 / 61.1 | 0 | 302 / 268 / 252 (p90 318 / 281 / 263) | 2.5 / 0.9 | 22 / 25 / 27 | 2.8 / 2.1 / 1.8 | – | 0 | 16 / 2 / 0 | 21/23/57 · 55/30/15 · 100/0/0 |
| 5 | typical | 96.9 (86.1–110.1) | 10 | 395 / 421 | 2.8 / 0.9 | 18 | 3.6 / 5.9 | 6.2 / 14.8 | 0 | 3 | 50/32/18 |
| 6 | typical | 98.0 (87.8–110.3) | 20 | 399 / 425 | 3.0 / 0.9 | 18 | 3.3 / 5.4 | 7.3 / 16.6 | 0 | 2 | 56/30/14 |
| 7 | typical | 96.5 (83.8–112.8) | 25 | 393 / 419 | 3.0 / 0.9 | 18 | 3.3 / 5.5 | 8.3 / 17.7 | 0 | 1 | 68/25/7 |
| 7 | slider | 116.8 (87.2–186.1) | 28 | 474 / 520 | 3.0 / 0.9 | 16 | 4.7 / 8.1 | 20.3 / 41.1 | 14 | 4 | 67/25/8 |

Chapter mean by topic, typical age 4: colors 91.9 · animals 92.5 · size 90.3 · shapes 93.7 · **count 103.4** s. Counting is
the longest chapter at every age (94 / 103 / 105 / 107 / 110 s for ages 3–7).

What every model gets right (ages 3–7, 11 100 sessions):
- **Stuck:** 0 stuck states in any engaged model. Only `tapper` at ages 5–7 sometimes hits the 1 500 s cap (random taps are
  not play; already documented in MECHANICS §7). 0 NaN.
- **Absent child:** auto-pauses at 120.9 s (the 5th idle nudge) at every age.
- **Content:**
  - 0 identical and 0 same-band consecutive rounds (out of ≈ 2 400 pairs per row).
  - Every member is asked in 100 % of rounds with n ≥ k (≈ 2 800 rounds per row).
  - Repeat asks: 18–19 % of asks at ages 3–4 and 25–29 % at ages 5–7 repeat a member already asked in that song. That
    follows from n > k by design, and the same member is never asked twice in a row.
  - The answer slot is uniform over the slots (age 4: 38 / 39 / 23 %; slot 2 exists only in 3-member bands).
  - Variety (age 4): 6 colours (the most frequent 22 % of band slots, the rarest 12 %, because of the clash-free sets),
    8 animals (14 / 12 %), 30 shape-colour pairs.
- **Song taps:** `songtap` made 27 000–33 000 taps per age during the song and the clear, with **0** reactions (no play,
  wrong, drum count or lock). The only effect is a fun `boom` when a plain band drum is tapped in a drum round (≈ 4 %).
- **Surprises:** exactly one per chapter, on the 3rd song, alternating snail and shower (2 + 2 per session).
- **Hints (typical age 4):** 4 % of asks hinted (0.04 per ask), idle nudges 0.03 per ask. Every 2nd miss on an ask is
  hinted.

## 3. Numbers — real browser (speed 8, bot 0.8, one session per age × language)
| age | lang | session s | stars | asks | lines / min | prompts cut by something other than the child's answer | max prompt wait behind another line, s | songs whose last praise is cut by the song line | listen beats inside the prompt (per listen ask) | drum taps without a count word | listen prompt says n | negative words | wrong-language lines | page errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | en | 218 | 42 | 38 | 41.0 | 4 / 42 | 2.2 | **16 / 16** | **1.75** | 0 / 8 | 0 / 4 | 0 | 0 | 0 |
| 3 | vi | 221 | 44 | 38 | 39.4 | 4 / 42 | 3.1 | 16 / 16 | 2.25 | 0 / 8 | 0 / 4 | 0 | 0 | 0 |
| 4 | en | 284 | 38 | 50 | 37.6 | 5 / 54 | 3.8 | 16 / 16 | **3.50** | 0 / 12 | 0 / 6 | 0 | 0 | 0 |
| 4 | vi | 280 | 38 | 50 | 37.9 | 5 / 54 | 4.0 | 16 / 16 | 3.33 | 0 / 12 | 0 / 6 | 0 | 0 | 0 |
| 5 | en | 330 | 38 | 59 | 36.4 | 5 / 63 | 3.8 | 16 / 16 | 5.67 | 0 / 14 | 0 / 6 | 0 | 0 | 0 |
| 5 | vi | 330 | 40 | 59 | 36.3 | 5 / 63 | 3.2 | 16 / 16 | 6.50 | 0 / 14 | 0 / 6 | 0 | 0 | 0 |
| 6 | en | 339 | 42 | 66 | 39.2 | 6 / 70 | 4.7 | 16 / 16 | 4.83 | 0 / 26 | 0 / 6 | 0 | 0 | 0 |
| 6 | vi | 357 | 39 | 66 | 38.2 | 6 / 70 | 4.0 | 16 / 16 | 6.00 | 0 / 23 | 0 / 6 | 0 | 0 | 0 |
| 7 | en | 347 | 41 | 66 | 39.0 | 6 / 70 | 4.2 | 16 / 16 | 5.67 | 0 / 29 | 0 / 6 | 0 | 0 | 0 |
| 7 | vi | 338 | 41 | 66 | 40.0 | 6 / 70 | 4.2 | 16 / 16 | 5.83 | 0 / 27 | 0 / 6 | 0 | 0 | 0 |

- **Prompts cut by something else:** every one (4–6 per session) is a **drum tap**. Its count word is spoken with
  `interrupt: true`, which flushes the queue, so the drum prompt that was waiting behind the previous praise is cut or
  dropped. Prompts cut by the child's own right answer (`play`, `talkResult`) are not counted; the prompt is no longer
  needed then.
- **Praise:** the last praise of each song is cut by `songStart` (spoken with `interrupt`) in **every** song (14 cut + 2
  dropped of 16).
- **Repetition:** the most repeated lines are the song lines, 6–9× per session ("Listen to your song!", "Bravo! Super
  band!", "Nghe bài hát của bé nhé!"…). `songStart` has 3 variants and `songEnd` 5, for 16 songs. "Same line again
  within 8 s" happened 3–24 times per session; nearly all of those are count words ("One!", "Two!"), which is fine.
- **Checks that passed:** headless and browser session times agree (age-4 bot 0.8: 268 s headless vs 280 / 284 s in the
  browser). There were 0 page errors. The `slowFrames` stat is high only because headless Chromium was running at 8×.

## 4. Findings

### P1-1 Bop drums the "listen" beats over his own prompt
The beats start `beatLead 2.4 s` after the ask. The `p.listen` lines are 43–57 characters long:
- EN: "Listen to my drum! How many booms? Tap that number!"
- VI: "Nghe trống của Bốp nhé! Mấy tiếng bùm? Bé chạm số đó nào!"

That takes **4.0–5.2 s** at a realistic 13 chars/s × rate 0.9, or 4.7–6.0 s by voice.js's estimate. The prompt also waits
up to 4 s behind the previous praise. Result in the browser: **1.75 (age 3) – 6.5 (age 5 vi) beats per listen ask sound
while Bop is still talking.** At age 4 that is 3.3–3.5 of ≈ 3 beats, so nearly all of them. A 4-year-old cannot count
booms under speech, so the listen ask turns into guessing.
- **Fix (code, best):** `main.js` starts the beats when the prompt has been spoken (`onVoiceEnd` of that prompt →
  `world.beatsGo()`), with `beatLead` as the upper bound and as the fallback when the voice is off.
- **Fix (CONFIG only):** `beatLead: 2.4 → 4.6`. Also shorten the 3 VI and 3 EN `p.listen` lines to ≤ 32 characters, e.g.
  "Shh! Count my booms!", "Listen! How many booms?", "Nghe nè! Mấy tiếng bùm?", "Suỵt! Bé đếm tiếng trống nhé!".
  With short lines, 3.4 s would be enough.
- **Re-sim** (beatLead 4.6 + beatGap 0.75): the listen ask *answer* time is unchanged (age 4 typical 4.1 → 4.0 s). The
  count chapter goes 103.4 → 102.1 s for typical age 4, because the 80 s limit cuts the 4th song a little more often, and
  75 → 94 s for `perfect`.

### P1-2 Extra drum taps count on the next drum ask and cut off its prompt
After `drumDone`, phase `play` lasts only `playTime 0.6 s`. Then the next drum ask opens with `count = 0`, and the
`drumTap` count word (spoken with `interrupt`) flushes the new prompt "Tap my big drum three times!". Children drum on
past the target: the typical model already overshoots by one 10 % of the time, and the `overdrum` model by 1–3.
- **Overdrum, age 4:** **763 of 1 279 extra taps (60 %) were counted on the next ask**. In 394 of 785 drum asks (50 %) the
  card already showed a count before the child could hear the number. Ages 3 / 5 / 6 / 7: 51 / 57 / 54 / 51 %.
- **Fix (code + 2 new CONFIG keys):** after `drumDone`, stay in phase `play` until no big-drum tap has come for
  **`drumQuiet: 1.2` s**, capped at **`drumQuietMax: 3`** s total (a spammer can't hold the game). Late taps keep giving
  the free "boom" they already give in phase `play`. Prototype: `hs_qa.js --patch drumQuiet`.
- **Re-sim:** extra taps counted on the next ask fall **763 / 1 279 → 15 / 1 547 at age 4** (494 → 66 at age 3; 744 → 9,
  959 → 25 and 1 214 → 24 at ages 5–7). The cost is ≈ 0 for typical play: drum ask mean 3.7 → 4.1 s and chapter
  94.5 → 94.4 s for overdrum.
  - `drumQuiet 0.8` was **not** enough (60 % → 45 %), because a 3–4-year-old drums 0.45–1.0 s apart.
  - The optional extra `drumGuard: 0.7` (a count in the first 0.7 s of a drum ask is a free boom) brought it to 0 to 6 per
    200 sessions (`q12g`).

### P2-1 A child who stops one tap short waits 12 s
When 0 < count < n, nothing happens until the generic `idleTime 12` nudge. As a result the drum ask p90 is **15.5 s vs
7.8 s for pick asks** (typical age 4), and 30 s for `slider`, whose slid taps "counted" in the child's head.
- **Fix (code, new key):** `drumShortNudge: 4`. When 0 < count < n and no tap for 4 s, fire the idle nudge early (the line
  "One more!" / "Gõ thêm nữa nào!" is the voice team's call). Prototype: `--patch shortNudge`.
- **Re-sim:** typical drum ask p90 **15.5 → 9.8 s** (age 4), slow3 25.2 → 20.1 s, ask max 43 → 35 s. Chapter time is about
  the same.

### P2-2 The song line cuts the last praise in every song, and the song itself plays under speech
`songStart` is spoken with `interrupt: true` 0.6 s after the last right tap, so the praise ("Moo! The cow!") is cut in 16 of
16 songs. The first song note follows 0.5 s later (`songLead`), so the 2–4-note melody (0.9–1.8 s) plays under "Listen to
your song!".
- **Fix:** speak `songStart` without `interrupt` (or show it only in the bubble: the music *is* the message), and
  `songLead: 0.5 → 1.0`, `songGap: 0.45 → 0.5`.
- **Re-sim:** song phase 2.5 → 3.1 s at age 4 (2.2 → 2.8 at age 3, 3.0 → 3.7 at ages 6–7), reward share 17 → 19 % of the
  round. Still brief: it does not drag.

### P2-3 Small slides throw taps away
There is no drag gesture in this game, yet a press that drifts ≥ 40 px or lasts ≥ 0.6 s does nothing.
- **Fix:** `tapMovePx: 40 → 64`, `tapTime: 0.6 → 0.8`. Re-sims `tapA` → `tapB`, 150 sessions per row:

| age | model | drum ask p90, s | ask max, s | session p90, s | wrong / ask |
|---|---|---|---|---|---|
| 4 | slider | 28.9 → 12.6 | 58 → 24 | 436 → 407 | 0.27 → 0.26 |
| 5 | slider | 32.7 → 7.6 | 84 → 23 | — | — |

  slow3 improves a little. **typical / tapper are unchanged** (wrong per ask identical), so nothing gets easier by accident.

### P3
- `beatGap: 0.6 → 0.75`. 100 bpm is quick for a 3–4-year-old counting along aloud; 80 bpm matches their counting pace.
  Cost: +0.15 s per beat (≤ +0.75 s per listen ask).
- **Optional `chapterTimeLimit: 80 → 85`.** With all the changes, chapters cut to 3 songs rise from 12 → 18 % at age 4.
  At 85 the cut is 12 % again, with an age-4 chapter of 97.9 s and session p90 421 s (`final85`). Both are still inside
  target. Keep 80 if the shorter session matters more than the 4th song.
- **Song lines:** add 3–4 more `songStart` / `songEnd` variants (EN + VI). They are the most repeated lines (6–9× per
  session).
- **Surprise lines:** the snail and shower lines interrupt the praise and push the next prompt back by up to ≈ 4 s.
  Acceptable once per chapter.
- **Colour balance:** one colour fills 22 % of band slots and the rarest 12 % (age 4). This is a side effect of the
  clash-free sets, so no action is needed.

## 5. Recommended changes (exact) and the re-simulated result
CONFIG (existing keys):
```
beatLead:   2.4  → 4.6     (or keep ≈ 3.4 with ≤ 32-char p.listen lines; best: start the beats on the prompt's voice end)
beatGap:    0.6  → 0.75
songLead:   0.5  → 1.0
songGap:    0.45 → 0.5
tapMovePx:  40   → 64
tapTime:    0.6  → 0.8
chapterTimeLimit: 80 → 85  (optional, P3)
```
New keys plus small world changes (prototyped in `tests/sim/hs_qa.js --patch drumQuiet,shortNudge`):
```
drumQuiet:      1.2   // after drumDone, phase 'play' lasts until no big-drum tap for 1.2 s …
drumQuietMax:   3     // … but at most 3 s
drumShortNudge: 4     // 0 < count < n and no tap for 4 s → the idle nudge now
(drumGuard:     0.7)  // optional: a count in the first 0.7 s of a drum ask is a free boom
```
main.js / i18n: `songStart` without `interrupt`. Shorter `p.listen` lines. Beats start on the prompt's voice end.

Re-sim, current build → all recommended changes (`--tag base2` → `--tag final`, 200 sessions per row; overdrum carry = extra
taps counted on the next ask):

| age | model | chapter mean s | cut % | session p90 s | song phase s | drum ask mean / p90 s | ask max s | asks > 60 s | overdrum carry |
|---|---|---|---|---|---|---|---|---|---|
| 3 | typical | 85.0 → 88.2 | 4 → 2 | 370 → 381 | 2.2 → 2.8 | 8.4/17.0 → 6.5/11.3 | 42 → 31 | 0 → 0 | 494 / 976 → **66 / 1 198** |
| **4** | **typical** | **94.3 → 95.8** ✓ | 11 → 18 | **406 → 411** ✓ | 2.5 → 3.1 | 6.8/15.5 → **5.6/9.8** | 43 → 35 | 0 → 0 | 763 / 1 279 → **15 / 1 547** |
| 4 | slow3 | 122.8 → 123.2 | 99 → 99 | 542 → 536 | 2.4 → 3.0 | 14.8/25.2 → 11.9/20.1 | 51 → 48 | 0 → 0 | |
| 4 | slider | 99.6 → 95.6 | 19 → 16 | 436 → 413 | 2.5 → 3.1 | 12.3/30.1 → 5.2/8.3 | 58 → 18 | 0 → 0 | |
| 4 | bot0.8 | 65.3 → 71.3 | 0 → 0 | 281 → 309 | 2.5 → 3.1 | 2.4/3.4 → 2.4/3.4 | 6 → 6 | 0 → 0 | |
| 4 | perfect | 55.5 → 61.5 | 0 → 0 | 240 → 268 | 2.5 → 3.1 | 2.2/3.1 | 3 → 3 | 0 → 0 | |
| 5 | typical | 96.9 → 97.5 | 9 → 18 | 420 → 419 | 2.8 → 3.5 | 6.2/14.8 → 5.2/8.8 | 49 → 41 | 0 → 0 | 744 / 1 313 → 9 / 1 467 |
| 6 | typical | 98.0 → 99.8 | 20 → 23 | 424 → 426 | 3.0 → 3.7 | 7.3/16.6 → 5.8/9.4 | 45 → 37 | 0 → 0 | 959 / 1 777 → 25 / 1 880 |
| 7 | typical | 96.5 → 98.4 | 24 → 26 | 418 → 424 | 3.0 → 3.7 | 8.3/17.7 → 6.4/10.0 | 48 → 40 | 0 → 0 | 1 214 / 2 384 → 24 / 2 379 |
| 7 | slider | 116.8 → 96.9 | 28 → 27 | 519 → 412 | 3.0 → 3.7 | 20.3/41.1 → 5.6/8.0 | 75 → 18 | 14 → 0 | |
| 7 | slow3 | 176.8 → 172.6 | 100 → 100 | 765 → 749 | 2.9 → 3.6 | 23.0/41.0 → 17.4/29.9 | 69 → 62 | 9 → 2 | |

- **Unchanged:** stars (typical age 4: 46/32/22 → 47/31/22 %) and the absent auto-pause (120.9 s).
- **Count chapter, typical age 4:** 103.4 → 102.1 s.
- **All targets still met:** age-4 chapter 60–100 s ✓, session p90 ≤ 480 s ✓ at every age for typical.

## 6. Designer's view (a 4-year-old)
- **Drum mode** pitches the difficulty right: counts 1–2, then 2–4 ascending, a count card that lights, and a count word on
  each tap. What breaks it is not difficulty but the **flow at the edges**: drumming on past the count (P1-2) and stopping
  one short with nobody saying "one more" for 12 s (P2-1).
- **Listen mode** is the weakest part today. The idea is lovely, but the beats run under the prompt (P1-1), and at 0.6 s
  apart they are quick for counting along. Wait for the voice, then drum at 0.75 s.
- **Song playback** is short and snappy (2–4 s, about 17 % of a round). It never drags, but it is currently half-covered
  by "Listen to your song!". Letting the praise finish and starting the melody after a beat of silence makes the reward
  land. The recommended 3.1 s at age 4 is still brief.
- **Notes per song** (age 4: 2, 3, 4, 4; count 2, 3, 3, 3) and **one surprise per chapter** (snail and shower alternating)
  feel right. More notes would push the chapter past 100 s; fewer would make the song too thin to be a "song".
- **Pace:** a typical 4-year-old plays ≈ 6.5 min with 4 Talk-time breaks, which suits a leisure session. Lines run at ≈ 38
  per minute. That is chatty but always relevant; trimming the song lines (P2-2, P3) is the easy way to make Bop a little
  quieter.
