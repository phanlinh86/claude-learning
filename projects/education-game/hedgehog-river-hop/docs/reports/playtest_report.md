# Nim's River Hop — high-speed playtest report (2026-11-15)

Playtester (report-only: nothing in `game/` was edited). Scripts: `tests/sim/pt_lib.js` (child models + a port of main.js's
speech policy onto a fake `NH.Voice` queue), `tests/sim/pt_playtest.js` (sweep, `--config` / `--patch` / `--voiceK`),
`tests/sim/pt_summary.js` (tables), `tests/sim/pt_browser.js` (real Chromium at `?speed=8&bot=1&autostart=1&mute=1`).
Raw output: `tests/sim/out/pt_*.json|md` (git-ignored). Screenshots: `docs/reports/pt_*.png`.

**Volume:** 5 950 headless sessions (≈ 95 000 rounds): base 1 325 (16 per age × model × skill; 5 for the hammer models), after
1 000, config-only 660, slow-voice 4 × ≈ 300–430, after2 520; + 3 real-browser sessions. Ages 3–7, EN/VI alternating, 5 viewports
(iPhone portrait/landscape with notch, iPad 4:3 landscape, iPad portrait compact, iPad Air landscape), 1/30 s frames through the
real input API (`pointerDown/Move/Up`, `talkAnswer`).

Reproduce: `node tests/sim/pt_playtest.js --n 16 --tag base` then
`node tests/sim/pt_playtest.js --n 12 --tag after --config '{"chapterMinRounds":2,"hintTime":5,"assistAfter":5}' --patch squishCounts,queuedRightOnly,fruitQueue,countGuardAtStart,keepPrompt,promptGuardToEnd`
and `node tests/sim/pt_summary.js base after`.

## 1. Child models
| model | behaviour | skill used? |
|---|---|---|
| `random` | taps every 0.4–1.6 s anywhere: 30 % a random stone of ANY row (incl. later / sinking), 30 % open water, 40 % the whole safe screen; also during hops, bank, wipe; random Talk answers | – |
| `slow3` | slow 3-year-old: listens to the prompt, thinks 3–7 s, 2–4 s between hops (+1.5 s after a miss); **18 % of decisions look away 20–40 s**; aim ± 0.9·S/2; follows a glowing hint p 0.85 | p(right) |
| `ahead` | typical pace; 45 % of decisions tap the row after next (or the one after); 30 % of hops it taps the next row while Nim is still in the air | p(right) |
| `spammer` | 6–9 presses / s, never waits: active row (target p = skill) 55 %, later rows 25 %, Nim 10 %, water 10 % — also while Nim is airborne | p(target) |
| `hammer` | bangs one stone of the row 3× / s for 2–6 s, then re-picks (glow p 0.8) | p(target) |
| `hammerPure` | bangs ONE wrong stone 2.5–3.5× / s; switches only to a glowing stone (p 0.15 per tap) | – |
| `first` / `firstFast` | always taps stone `i = 0` of the active row, every 1.2–2.6 s / 0.5–0.95 s; ignores hints | – |
| `perfect` | always right, 0.8–1.2 s think, 0.5–0.8 s between hops | – |
| `bot` | the game's own `NH.Bot`, toddler pace | 0.5 / 0.8 / 1.0 |

## 2. Base results (current game, all ages pooled; per-age rows in `tests/sim/out/pt_base.md`)
| model | skill | session min mean (p90, max) | chapter s mean [p10–p90] | round s (p90, max) | rounds > 120 s | max no-progress s (p90) | stars 3/2/1 % | hints / round | assist rounds % |
|---|---|---|---|---|---|---|---|---|---|
| bot (toddler) | 0.5 | 6.3 (6.7, 7.0) | 91.5 [83.9–98.8] | 19.8 (25.8, 44.1) | 0 | 11.3 (9.2) | 15/20/64 | 0.86 | 0 |
| bot (toddler) | 0.8 | **6.0 (6.4, 7.0)** | **85.9 [74.1–95.6]** | 18.1 (23.1, 46.4) | 0 | 12.4 (7.4) | 52/30/18 | 0.20 | 0 |
| bot (toddler) | 1.0 | 5.7 (6.2, 6.4) | 81.7 [71.1–92.8] | 16.9 (20.1, 38.2) | 0 | 8.3 (5.7) | 100/0/0 | 0 | 0 |
| perfect | – | 4.5 (5.1, 5.2) | 64.3 [56.0–75.3] | 13.3 (14.4, 34.6) | 0 | 6.6 (4.5) | 100/0/0 | 0 | 0 |
| random | – | 6.4 (6.9, 7.1) | 92.9 [82.8–102.8] | 22.1 (33.5, 60.8) | 0 | 19.0 (11.4) | 13/47/41 | 1.91 | 77 |
| ahead | 0.5 / 0.8 / 1 | 6.5 / 6.3 / 6.0 | 93 / 91 / 87 | ≤ 55 max | 0 | 24.6 / 24.2 / 21.4 | (0.8) 57/29/15 | 0.98 / 0.41 / 0.17 | ≤ 0.5 |
| spammer | 0.5 / 0.8 / 1 | 3.8 / 3.7 / 3.6 | 53 / 52 / 51 | ≤ 33 max | 0 | 7.2 | (0.8) 60/31/9 | 0.43 / 0.19 / 0.08 | 3 / 1 / 0 |
| hammer | 0.5 / 0.8 / 1 | 5.9 / 4.5 / 3.6 | 85 / 64 / 51 | ≤ 72 max | 0 | **36.7** / 14.1 / 6.3 | (0.8) 50/34/17 | 0.66 / 0.19 / 0 | 0.3 / 0 / 0 |
| first | – | 6.7 (7.2, 7.8) | 97.3 [82.7–109.3] | 26.6 (39.4, 73.6) | 0 | 21.3 (16.4) | 0/0/100 | 2.48 | 100 |
| firstFast | – | 7.3 (7.9, 8.4) | 105.8 [88.5–128.6] | 30.4 (45.1, 83.4) | 0 | **55.0** (29.6); **44 % of rounds > 20 s without progress** | 0/0/100 | 2.77 | 100 |
| **hammerPure** | – | **never finishes: 25 / 25 sessions stuck** in round 1 (no hint, no idle nudge, no assist — ever) | | | | ∞ | | 0 | 0 |
| slow3 | 0.5 | 12.5 (15.7, 19.5) | 183.7 [107–276] | 55.8 (111.7, 275) | 73 | 186 (81) | 27/25/48 | 1.77 | 3 |
| slow3 | 0.8 | 9.8 (11.3, 13.5) | 142.7 [99–202] | 41.3 (83.7, 205) | 22 | 151 (57) | 61/29/10 | 0.74 | 0 |
| slow3 | 1.0 | 8.9 (10.8, 13.0) | 129.5 [94–182] | 36.3 (73.1, 198) | 16 | 115 (46) | 98/2/0 | 0.53 | 0 |

- **Targets for a toddler-paced child are met**: bot 0.5–1.0 chapters 82–92 s (target 60–100), sessions ≤ 7.0 min max. The
  extreme `slow3` (a child who wanders off for 20–40 s on almost one decision in five) needs 9–12.5 min: every slow3 round > 120 s
  is caused by its own look-aways, not by the game (it never got stuck; nudges came at 12 / 30 s).
- **Stuck rounds: 0 for every model except `hammerPure`** (see P0). No NaN, no stuck state, 0 off-screen.
- **Random tapper**: finishes every round; worst 60.8 s, longest stretch without progress 19 s (p90 11 s); the hint comes in 96 %
  and the assist in 77 % of its rounds — help kicks in before frustration. Stars 13/47/41 — an assisted round caps at 2★ ✓.
- **Ahead taps never count as a miss** (0 of 23 138 wrongs had a stone of another row). "One at a time!" rate limit holds (≤ 1 / 6 s).
- **But taps made while Nim is airborne DO count as misses**: a tap on a wrong stone of the next row while Nim is in the air is queued
  and judged on landing → `wrong` (+ a miss, the wrong line, hint counter). 4 430 of 23 138 wrongs (19 %) were such queued taps:
  spammer 273–638, ahead child 30–50 per 80 sessions. For a spammer this turns 3★ rounds into 2★ / 1★ (P2).
- **Hint frequency**: 0.20 / round (bot 0.8), 0.86 (bot 0.5), 1.9 (random), 2.5 (first). Hint glow lasts 3.2 s, but a slow 3-year-old
  looks again 3.5–5.5 s after a miss — `slow3` rarely sees the glow it was given (P2 → `hintTime 5`).
- **Idle nudges** (slow3, n = 3 455): 1st 16.7 s, 2nd 34.4 s after the last touch (= 12 s / 30 s of answerable time + the hop / Nim's
  reply) — spacing 18 s, the 2nd hints ✓. **Every touch resets the idle clock**, which is what makes P0 possible.

### Variety (19 287 rounds, 54 432 rows)
- Target at the same position in every row of a round: **0**. Asked value repeated in consecutive rounds: **0**. Position histogram
  flat (m = 2: 50.0 / 50.0 %; m = 3: 33.6 / 33.8 / 32.5 %). An "always the first stone" child gets 0★ rounds (needs the assist every row) ✓.
- Same fruit twice in a row: 768 — **all at a chapter's round 0** (`prevFruit` is per chapter; 1 in 5 chance across the Talk break). Low.

### Reward cadence — does it feel different from a basket / drop game?
Inside a crossing a hop comes every **3.1 s** (toddler bot; p90 4.9 s), a fruit every **20–25 s**, a chapter every ≈ 85 s. A
catch-the-drop game rewards every 1–2 s with small identical events; here each tap buys a bigger, physical moment (crouch → arc →
splash → golden stone → named thing) and the round has a goal arc (far bank → curl → roll → fruit on the spines → swirl), so the
rhythm is "tap, watch, tap, watch, payoff" — clearly a journey/path game, not a basket game. The non-interactive tail per round is
≈ 4.5 s (bank 2.0 + cheer 0.45 + wipe ≈ 1 + rise ≈ 2) — acceptable, and the bank roll is the best moment in the game. The one thing
that flattens the payoff today is P1-a: the fruit line that should crown each crossing is usually silent.

### Speech timing (main.js policy on a voice.js-identical queue; line = 600 + 95 ms × chars at rate 0.9)
| model | prompts lost (cut) | prompt wait ms mean / max | count lines lost (cut / flushed / dropped) | right lines lost % | **"Yum, an apple!" said / rounds** |
|---|---|---|---|---|---|
| bot 0.5 | 9 / 1 255 (9) | 824 / 4 433 | 73 / 484 (40 / 30 / 3) | 42 | **219 / 1 255 (17 %)** |
| bot 0.8 | 10 / 1 273 (10) | 715 / 4 267 | 20 / 531 (17 / 3 / 0) | 29 | **237 / 1 273 (19 %)** |
| bot 1.0 | 14 / 1 280 (14) | 630 / 4 133 | 1 / 571 | 18 | 236 / 1 280 (18 %) |
| slow3 0.8 | 5 / 993 | 632 / 4 133 | 2 / 342 | 8 | 200 / 993 (20 %) |
| random | 11 / 1 152 (9) | 897 / 5 233 | 66 / 389 (27 / 30 / 9) | 39 | 169 / 1 152 (15 %) |
| first | 2 / 1 016 | 1 089 / 6 133 | 55 / 345 (26 / …) | 50 | 177 / 1 016 (17 %) |
| spammer 0.8 | **94 / 1 280** (dropped by count 46, right 39) | 911 / 4 133 | **126 / 624 (17 / 1 / 108)** | 77 | 174 / 1 280 (14 %) |
| perfect | 12 / 1 280 | 677 / 4 133 | 21 / 620 | 40 | 159 / 1 280 (12 %) |
| **bot 0.8, real voice 25 % slower than the estimate (`--voiceK 1.25`)** | **131 / 637 cut (21 %)** | | 27 / 269 | | 103 / 637 |

Findings:
1. **The round's praise is skipped in 80–88 % of rounds** (P1). `stick` speaks `sayFruit` only `if canInterrupt()`, but the last
   right line ("A red flower! Last hop to the bank!", ≈ 3.5–4.5 s) is `protect()`ed and `stick` comes ≈ 2.3 s after that `right`
   → guard still on → no line. The screenshots `pt_iphone-portrait_stick.png` / `pt_iphone-landscape_wipe.png` show it: at the
   fruit moment the bubble still says "…Nhảy lên bờ nào!" / "…To the bank!". VOICE §1.1 says "`stick` → `sayFruit` is the round's praise".
2. **Count lines are cut by a wrong line** (P1 for the counting chapter): `speakCount` starts the guard when the line is QUEUED; if it
   waits behind the protected prompt / another line, the guard expires before it is spoken and the next `wrong` (interrupt) cuts or
   flushes it — bot 0.5: 70 of 484 numbers lost. A fast child also overflows the queue (hops ≈ 0.7 s, "Three!" ≈ 1.2 s): spammer
   loses 17–24 % of the numbers ("One! … Three!") and the queue then drops the next PROMPT (all items priority → index 0 dropped).
3. **Prompt guard is an estimate**: with the estimate exact, prompts are cut in ≈ 1 % of rounds (by `ahead` / `right` when
   `I18N.speech()` makes the spoken text longer than the display text). If the real voice is 25 % slower (Linh, pitch 1.2, older iPads)
   **21 % of prompts lose their tail** to a right / wrong / ahead line.
4. Talk: the child's answer cuts the Talk question in most Talk times (my kids answer after 3–6 s, intro + question ≈ 5–6 s) — the
   child's own choice, fine. Idle lines are cut only by the child's own tap ✓. "One at a time!" never cut a prompt or a count line ✓.
5. The 12-dot count run at ages 6–7 ("One, two, …, twelve! Twelve dots!") is ≈ 9 s — long but it is never cut (count guard + 400 ms) ✓.

## 3. Real browser (`tests/sim/pt_browser.js`, Chromium headless, quick `?bot=1`, speed 8)
| device | age / lang | session (sim) | chapters s | rounds | right / wrong / hints | hop gap s | sim ÷ wall | errors |
|---|---|---|---|---|---|---|---|---|
| iPad landscape 1180×820 | 3 / en | 3.8 min | 54 / 51 / 56 / 54 | 16 | 40 / 6 / 1 | 5.4 | 6.8 | 0 |
| iPhone portrait 393×852 | 4 / vi | 4.2 min | 57 / 55 / 65 / 60 | 16 | 43 / 7 / 0 | 5.5 | 7.1 | 0 |
| iPhone landscape 852×393 | 6 / en | 5.4 min | 65 / 73 / 66 / 103 | 16 | 59 / 6 / 1 | 5.1 | 7.4 | 0 |

Matches the headless quick-bot numbers (the headless `bot1` in MECHANICS §8: 3.6–4.9 min). Screenshots frozen at the exact instant:
`pt_ipad-landscape_hop.png` (Nim mid-arc, the landed stone golden with sparkles, the ripple ring, the next row unchanged — reads
well), `pt_iphone-portrait_stick.png` (curled ball over the fruit — the fruit line is missing, P1-a), `pt_iphone-landscape_wipe.png` (swirl covers the river at
t ≈ 0.55, the old line still in the faded bubble); the script also shoots Talk (deleted to keep the repo small). Voice log at speed 8 (log-only) shows the expected line order:
chapter → weather → (rise) → prompt → right lines with "Next row! / Last hop!" → wrong "That's a yellow duck. Let's find a red one!".

## 4. Recommended changes and their effect (re-simulated by overriding `NH.CONFIG` / monkey-patching in the sim only)

### CONFIG (world.js)
| key | old → new | reason |
|---|---|---|
| `chapterMinRounds` | 3 → **2** | a chapter that is already > 75 s after 2 rounds ends there; typical / bot children never reach 75 s in 2 rounds (unchanged), a slow child's chapter drops 143 → 120 s |
| `hintTime` | 3.2 → **5.0** | the glow + hand outlive a slow toddler's 3.5–5.5 s look-back (cooldown 6 s still > glow) |
| `assistAfter` | 6 → **5** | the "always the first stone" child reaches the assist one miss earlier (no-progress p90 16.4 → 14.3 s) |

### Code (exact; tried in `tests/sim/pt_playtest.js` PATCHES / `pt_lib.js`)
- **P0 `world.js _wrong`** (`squishCounts`): the same stone again within `sameWrongWindow` stays a silent wobble (no miss), but call
  `this._noProgress(false)` at most once per 0.9 s per stone (`if (this.interactive && this.time - (s._sqNP || -1e9) > 0.9) { s._sqNP = this.time; this._noProgress(false); }`
  just before the `return` in the `squish {repeat}` branch). Today a toddler who keeps banging one wrong stone faster than 1×/s gets
  NO hint, NO idle nudge (every touch resets it) and NO assist → endless round.
- **P1 `main.js case 'stick'`** (`fruitQueue`): drop `&& canInterrupt()` → `if (performance.now() - lastPraise > 1200) { … speak(t) … }`
  (speak() without `interrupt` never cuts anything; the 5 s stale rule drops it if it waits too long).
- **P1 `main.js`** (`countGuardAtStart`): start a count line's guard when it STARTS: in `onVoiceStart(display)`, if `display` is a
  queued count line, `countUntil = Math.max(countUntil, performance.now() + lineMs(display) + extra)`.
- **P1 `main.js`** (`promptGuardToEnd`): keep the prompt guard until the prompt's own end — in `onVoiceStart` set
  `promptUntil = promptStart + 30000` for the prompt and in `speakPrompt`'s `p.then` (spoken / cut / dropped) lower it to `now + 150`.
  Removes the dependence on the 600 + 95 ms × chars estimate.
- **P2 `voice.js say()`** (`keepPrompt`): when the queue overflows and every waiting line is priority, drop the oldest non-prompt line
  (mark speakPrompt items `opts.prompt = true`) instead of index 0.
- **P2 `world.js` queued tap** (`queuedRightOnly`): in `_step`'s queued branch judge the stone only if `st.s.target`; else emit
  `squish {early}` (a wobble) — a mid-air tap is never a miss, like an ahead tap.
- P2 (not simulated): countSeq — hold Nim on each counted stone until its number is spoken (e.g. `interactive` false for
  `countHold` ≈ 0.5 s after `land` in countSeq) so a fast tapper cannot outrun "One! Two! Three!" (spammer still loses ≈ 35 % of numbers).
- P3: carry `prevFruit` across chapters in `content.js` (19.5 % repeats at a chapter's round 0).

### Before → after (base vs after / after2, same seeds; "after" = 3 CONFIG changes + all code patches above)
| metric | before | after |
|---|---|---|
| `hammerPure` sessions finished | **0 / 25 (stuck)** | **20 / 20**, round 19.2 s, no-progress max 10.7 s |
| `firstFast` rounds > 20 s without progress | 44 % (max 55 s) | **0 %** (max 11.2 s) |
| `hammer 0.5` max no-progress | 36.7 s | 9.3 s |
| `first` no-progress p90 / session | 16.4 s / 6.7 min | 14.3 s / 6.3 min |
| `random` no-progress p90 / assist rounds | 11.4 s / 77 % | 10.4 s / 84 % |
| `slow3` 0.5 / 0.8 / 1.0 chapter mean | 184 / 143 / 130 s | **133 / 120 / 116 s** |
| `slow3` 0.5 / 0.8 / 1.0 session mean (p90) | 12.5 (15.7) / 9.8 (11.3) / 8.9 (10.8) min | **9.1 (11.1) / 8.2 (9.7) / 7.9 (9.4)** |
| `bot` 0.5 / 0.8 / 1.0 session · chapter | 6.3 · 92 / 6.0 · 86 / 5.7 · 82 | unchanged (6.3 · 91 / 6.0 · 86 / 5.7 · 82) |
| mid-air taps judged as misses | 4 430 | **0** |
| spammer 0.5 stars 3/2/1 | 31/34/35 | 51/30/18 |
| "Yum, an apple!" said (bot 0.8 / slow3 0.8 / random) | 19 % / 20 % / 15 % | **76 % / 93 % / 76 %** |
| count numbers lost (bot 0.5 / bot 0.8 / random) | 15 % / 3.8 % / 17 % | **5.4 % / 0.4 % / 8.3 %** |
| prompts cut, exact voice (bot 0.8) | 10 / 1 273 | **0 / 637** |
| prompts cut, voice 25 % slower (bot 0.8 / slow3 0.8 / random) | **131 / 637 · 64 / 499 · 121 / 574** | **0 · 0 · 0** |
| prompt start wait (bot 0.8) | 0.72 s | 1.06 s (the fruit line now precedes it; ≤ 4.3 s max as before) |
| right lines lost (bot 0.8) | 29 % | 34 % (more queued behind the protected prompt → stale) — acceptable: the hop, the gold and the sparkle still reward |

Config alone (`cfgonly`) gives the slow-child and first-child gains; the speech fixes come only from the code changes.

## 5. Issues by priority
- **P0** A child hammering one wrong stone faster than once a second never gets help: no hint, no nudge, no assist (endless round). Fix: squish-repeat counts as no-progress (≤ 1 / 0.9 s).
- **P1** The round's praise "Yum, an apple!" is silent in 80–88 % of rounds (`canInterrupt` guard at `stick`). Fix: queue it.
- **P1** Count numbers are cut / flushed by a wrong line (guard starts at queue time) — 4–15 % for slow-to-average toddlers. Fix: guard from start.
- **P1** Prompt protection relies on a duration estimate; a 25 % slower voice loses the end of 21 % of prompts. Fix: guard until the prompt's own end.
- **P2** Taps made while Nim is airborne become misses on landing (19 % of all wrongs; spammer stars). Fix: queued taps count only when right.
- **P2** A very fast tapper outruns the countSeq numbers and the queue then drops the prompt. Fix: keepPrompt + a short count hold.
- **P2** Slow toddler: chapters 130–184 s / sessions 9–12.5 min (target ≤ 100 s / ≤ 8 min). `chapterMinRounds 2` + `hintTime 5` → 116–133 s / 7.9–9.1 min; the rest is the child's own 20–40 s look-aways (no fail, no stuck).
- **P3** Same fruit twice across a chapter break (19.5 % of chapter starts).
