# Bim's Rainbow Rocket — high-speed playtest report (2026-11-02)

Playtester: high-speed play agent (report + proposals only; no file under `game/` was edited).
Scope: 4 chapters × 4 rounds, ages 3–7, 13 child models, about 18 000 headless sessions plus 10 real-browser sessions.

## How it was run
| what | how |
|---|---|
| Headless sims | `node tests/sim/hs_playtest.js --n 100` (base: **5 250 sessions**, 100 per age × model, 25 for the quiet models, en/vi, 4 viewports, step 1/120). Proposal runs: `--config` (real `RR.World({config})` overrides) and `--emu` (harness-side emulation of a proposed code change, `tests/sim/hs_models.js → emulate`). Results: `tests/sim/out/hs_<tag>.{md,json}` |
| Models | `bot0.5/0.8/1` (RR.Bot) · `typical` (per-age child, lib.js) · **new** `slow3` (think 3–8 s, 40 % wrong, retries 2–4 s, distracted 12 %) · `boostIgnorer` (never taps the boost) · `talkAbsent` (plays, then leaves at Talk time) · `tapper` (random taps anywhere every 0.3–1.5 s, including during flights) · `confused` (taps random spots every 1–2.5 s but follows a glowing island 85 % of the time) · `spammer` (6 taps/s on random islands) · `spammerAny` (6 taps/s anywhere) · `sloppy` (always drags from the rocket: lets go ON the island 35 %, 10–70 px past its edge 45 %, far off 20 %) · `absent` (never touches the screen) |
| main.js emulation | Idle lines are spoken for the first 4 idles of a hop and the game auto-pauses on the 5th. Talk re-asks are spoken while n ≤ 3 and the game auto-pauses at n = 4. `absent` / `talkAbsent` sessions end at that pause. |
| Real game | `NODE_PATH=$(npm root -g) node tests/sim/hs_browser.js` runs Playwright with `?speed=8&bot=1&mute=1` (bot skill 0.8), 2 sessions per age (iPad landscape plus iPhone portrait) and reads the world clock |

## Headline numbers (base, current CONFIG)
| age | model | chapter mean / p90 (s) | session mean / p90 / max (s) | hop mean / max (s) | wrong / hop | ★★★/★★/★ % | ask / flight / boost / other (% time) | stuck hops > 60 s |
|---|---|---|---|---|---|---|---|---|
| 3 | typical | 94.2 / 104.6 | 384 / 416 / 429 | 4.3 / 18 | 0.44 | 27/45/28 | 41 / 26 / 23 / 11 | 0 |
| 4 | typical | **92.4** / 102.3 | **377** / 399 / 419 | 3.7 / 18 | 0.37 | 41/32/27 | 37 / 28 / 24 / 11 | 0 |
| 5 | typical | 89.2 / 98.2 | 364 / 385 / 401 | 2.8 / 17 | 0.24 | 56/27/16 | 32 / 31 / 25 / 11 | 0 |
| 6 | typical | 85.4 / 94.4 | 349 / 365 / 376 | 2.4 / 15 | 0.16 | 67/24/9 | 29 / 34 / 26 / 12 | 0 |
| 7 | typical | 83.9 / 93.5 | 343 / 360 / 376 | 2.2 / 16 | 0.11 | 75/20/5 | 27 / 35 / 26 / 12 | 0 |
| 3 | slow3 | 107.8 / 120.3 | 438 / 470 / 496 | 7.8 / 23 | 0.40 | 31/45/25 | 51 / 18 / 20 / 11 | 0 |
| 4 | slow3 | 114.0 / 140.0 | 463 / **506 / 539** | 8.1 / 26 | 0.52 | 31/32/38 | 53 / 18 / 19 / 11 | 0 |
| 4 | boostIgnorer | 94.4 / 106.8 | 385 / 413 / 436 | 3.7 / 19 | 0.38 | 40/34/26 | 33 / 25 / 31 / 11 | 0 |
| 4 | sloppy | **111.0** / 142.1 | 451 / 500 / 544 | **8.4** / 44 | 0.52 | 34/32/35 | 57 / 19 / 15 / 9 | 0 |
| 4 | spammer | **53.2** / 59.0 | **220** / 229 / 238 | **0.4** / 3 | 1.73 | 11/13/76 | 7 / 52 / 27 / 13 | 0 |
| 4 | spammerAny | 78.1 / 91.5 | 319 / 355 / 393 | 2.9 / 27 | 1.83 | 11/13/76 | 37 / 35 / 18 / 9 | 0 |
| 4 | tapper | 167.2 / 243.2 | 676 / 897 / 1186 | 16.6 / 176 | 1.80 | 11/14/75 | 75 / 12 / 7 / 6 | **97** (per 100 sessions) |
| 4 | confused | 191.5 / 261.9 | 773 / 979 / 1343 | 19.7 / 188 | 1.03 | 11/16/73 | 77 / 11 / 7 / 5 | **56** |
| 3–7 | absent | – | auto-paused at **120 s** (4 spoken nudges at 15 / 33 / 60 / 90 s of game time = 12 / 30 / 57 / 87 s after the ask) | | | | | – |
| 3–7 | talkAbsent | – | auto-paused **48 s** into Talk (re-asks at 12 / 24 / 36 s spoken, glow from the 2nd, silent 4th → pause) | | | | | – |

All 5 250 sessions either finished or (absent models) auto-paused. There were no NaN values and no world stuck with an active, purposeful child. Hops that took over 60 s came only from the random tapper and the confused child, plus 1 sloppy hop at age 5 (69 s).

**Real game vs headless (bot 0.8):**

| age | browser sessions (s) | browser chapters (s) | headless bot0.8 session mean (s) |
|---|---|---|---|
| 3 | 303 / 318 | 69–83 | 306 |
| 4 | 314 / 323 | 70–88 | 315 |
| 5 | 311 / 326 | 72–84 | 315 |
| 6 | 300 / 313 | 71–81 | 315 |
| 7 | 318 / 329 | 75–82 | 316 |

All 10 browser sessions finished with 0 console errors, about 41 s of wall time each at speed 8. Headless times match within ±4 %.

### Checks against the skill's education rules
| rule | result |
|---|---|
| No timer pressure, no fail states | PASS. Nothing ends a hop. The 72 s chapter limit only drops the 4th round. |
| After 2 misses the right target glows | **PARTIAL.** The glow is skipped when a hint fired less than 6 s before (hint cooldown). This hit bot0.5 in 14/300 to 26/852 hops with 2 misses (2–5 %) and the spammer in 23–34 %. See P2-2. |
| Stars 3/2/1 (+1 Talk) | PASS |
| Chapter 60–100 s for a toddler | PASS for typical age 3/4 (94 / 92 s; p90 105 / 102 s). **FAIL** for slow3 (108–114 s) and sloppy (111 s). |
| Session ≤ 8 min | PASS typical (max 429 s). **FAIL** for slow3 age 4 (p90 506 s, max 539 s), sloppy (p90 500 s) and confused/tapper (13–20 min). |
| Hint cooldown 6 s | PASS (enforced; this is what causes the partial result above) |
| Idle nudges ×1.5 back-off to 30 s | PASS: 12 → 18 → 27 → 30 → 30 s. 4 nudges are spoken, then the game auto-pauses at 117 s. |
| Talk re-asks every 12 s, glow after the 2nd, stop speaking after 3 | PASS (12/24/36 s spoken, glow from n = 2, pause at 48 s). After a resume it misbehaves; see P2-3. |
| Content varies every round | PASS. The same answer never comes twice in a row (0.0 % of hops). Answer slot left/middle/right is 33/34/33 %. The same slot as the previous hop happens at the 1/n chance level (20–35 %). A 4-year-old chapter has 4.6–7.9 distinct answers per 10 hops. |
| Warm-up round easy | PASS at ages 3–4 (100 % of round-0 hops have 2 islands and 2 hops). Ages 5+ start at 3 islands (by design). |

### Other measurements
- **Answer island straight above the rocket:** 20–28 % of hops, highest at age 3 (iPhone portrait 31 %, iPad portrait 33 %). It is never twice in a row within a round, except 1 case in 1 094 at age 5 (the swap loop in `_placeRow` found no slot that was not above). Acceptable.
- **Careless tapper:** 1.0–2.7 wrong islands per hop and about 23 taps per hop. A hop takes 16–19 s and a chapter 154–198 s. Random tapping eventually gets through every hop, but slowly.
- **Surprise rounds:** exactly 1 per chapter (drift and shooting star alternate, so each session has 2 shooting stars). Drift rounds are slightly harder (typical age 4: 2.02 vs 2.19 ★). Random tappers catch only 6 % of shooting stars. The star crosses 1–2.5 s into hop 1's question, while Bim is still speaking.
- **Waiting vs playing:** a typical 4-year-old spends 37 % of the session in "ask" (thinking and tapping), 28 % watching a hop (appear, ignite, fly, land, climb ≈ 3 s per hop), 24 % in the round end (stars 1.2 s, boost ready, boost 2.4 s; 16 boosts per session) and 11 % in intro, Talk and chapter end. A quick child (bot1) watches for 74 % of the session. The flight is the reward, so this is acceptable, but it is the upper limit.
- **Chapters cut to 3 rounds by the 72 s limit:** 31 % (typical 4), 58 % (boostIgnorer 4), 100 % (slow3). The HUD keeps showing 4 dots, so the 4th stays empty (P3-2).
- **Content balance (content_stats.md):** colour answers are uneven (red 22 % vs orange 11 %), and shapes have only 5 answers (4.6 distinct per 10-hop chapter).

## Findings and proposals (prioritized)
Every effect below was re-simulated, 60 sessions per age × model unless noted. **Emulated** means the change was measured by wrapping `world.pointerDown` / `pointerUp` in the harness. The real change still has to be coded in `world.js`.

### P1-1 Spamming is rewarded: there is no tap lock after a wrong island
Tapping 6 times a second on the islands clears a hop in 0.4 s, compared with 3.7 s for a thinking 4-year-old. That makes the chapter 53 s instead of 92 s and the session 220 s instead of 377 s. The only cost is getting ★ instead of ★★★, and a 4-year-old does not count stars. The sister game uses a 0.8 s lock.

**Change** (`world.js` `_answer` / `pointerDown` / `pointerUp`): after a wrong island, island taps and drag releases are ignored for `wrongLock` s. The lock is `wrongLock2` s from the 2nd miss of a hop, while the glow and Bim's hint line play. Ignored taps play a soft "boop" (new event `locked`). They count as no miss, give no voice line and do not reset idle. New CONFIG: `wrongLock: 0.8`, `wrongLock2: 1.6`.

| age 4 | before | lock 0.8 only | **lock 0.8 / 1.6** |
|---|---|---|---|
| spammer chapter / hop | 53.2 s / 0.4 s | 66.1 / 1.6 | **75.0 / 2.6** |
| spammer session | 220 s | 272 | **307** |
| typical chapter | 92.4 | 93.1 | 92.7 (no change) |
| bot0.5 chapter | 81.5 | 82.4 | 83.8 |
| slow3 chapter | 114.0 | 113.5 | 113.5 |

At ages 5–7 the spammer becomes slower than a thinking child (chapter 84–88 s vs 83–89 s). At ages 3–4 it is still slightly quicker, but only because the 2-miss glow shows the way, which is the intended help.

### P1-2 A sloppy drag fails silently
If the finger lets go just past an island, `pointerUp` returns null. There is no sound, no voice line and no flight; the aim line simply disappears. The sloppy dragger has **1.65–2.28 failed releases per hop**. That makes a hop 8.4 s (typical 3.7 s), a chapter 111 s (over the 100 s target) and cuts 96 % of chapters to 3 rounds.

**Change** (`world.js` `pointerUp`): when a drag moved (≥ `tapMove`) and ended on no island, fly to the nearest row island whose hit box is within `dragSnap` px. If nothing is that close, emit `dragMiss`; main.js plays a soft whoosh-fizzle and repeats the prompt. New CONFIG: `dragSnap: 80`.

| sloppy | before (age 3 / 4 / 5 / 6 / 7) | **snap 80** |
|---|---|---|
| chapter (s) | 112 / 111 / 111 / 106 / 106 | **93 / 96 / 97 / 94 / 93** |
| hop mean (s) | 9.3 / 8.4 / 7.7 / 6.8 / 6.5 | **5.0 / 4.6 / 4.1 / 3.7 / 3.4** |
| chapters cut | 99 / 96 / 94 / 89 / 88 % | 57 / 44 / 35 / 32 / 31 % |
| typical (control) | 92.4 s (age 4) | 93.1 s (no change) |

### P1-3 Tapping the sky resets the idle timer, so a confused child never gets the idle glow
`pointerDown` sets `_idleT = 0` before it knows whether the tap hit anything. A toddler who does not understand the question and taps the sky never reaches the 12 s nudge or the glow. The `confused` model (it follows a glow when it sees one) gets stuck for more than 60 s on 39–112 hops per 100 sessions, with a worst hop of 188 s.

**Change** (`world.js` `pointerDown`): reset `_idleT` and `_idleGap` only when the tap hits an island, the rocket, the pad or the shooting star, not on an empty-sky null. Also **CONFIG `idleHintFrom: 2 → 1`**, so the first idle nudge (12 s) already glows the answer. An absent child still auto-pauses at 120 s.

| confused | before (age 3 / 4 / 5) | sky taps don't reset idle | **+ idleHintFrom 1** |
|---|---|---|---|
| stuck hops > 60 s (per 100 sessions) | 112 / 56 / 40 | 9 / 10 / 3 | **1 / 0 / 2** |
| hop mean / max (s) | 23.6/156 · 19.7/188 · 19.0/143 | 19.6/72 · 18.2/70 · 17.8/64 | **13.5/61 · 12.9/52 · 13.5/75** |
| session mean (s) | 844 / 773 / 787 | 737 / 729 / 750 | **562 / 569 / 614** |
| typical / slow3 age 4 session | 377 / 463 | 380 / – | 380 / 459 (no change) |

### P2-1 A slow 3–4-year-old goes over 8 minutes
slow3 at age 4 has a session mean of 463 s, p90 506 s and max 539 s, with chapters of 114 s, even when the chapter is cut to 3 rounds.

**CONFIG `chapterMinRounds: 3 → 2`.** Talk time may come after 2 rounds once the 72 s limit has passed.

| | before | **minRounds 2** |
|---|---|---|
| slow3 age 3 session mean / p90 | 438 / 470 | **421 / 449** |
| slow3 age 4 session mean / p90 / chapter | 463 / 506 / 114.0 | **426 / 450 / 104.7** |
| sloppy age 4 session / chapter | 451 / 111.0 | 408 / 100.2 |
| typical age 4 session / chapter | 377 / 92.4 | 378 / 92.7 (no change) |
| bot0.8 age 4 | 315 | 316 |

### P2-2 The glow on the 2nd miss is swallowed by the hint cooldown
The rule says that after 2 misses the right island glows. With a hint less than 6 s earlier (often from the previous hop), `_autoHint` does nothing. This affected 14/300, 26/852 and 21/1041 of bot0.5's 2-miss hops (ages 3/4/5) and 23–34 % of the spammer's.

**Change** (`world.js` `_answer`): when `hopMisses === hintAfterMisses`, call `_doHint(false)` directly, skipping the cooldown. The cooldown still gates idle hints and 3rd+ misses. Measured: 0 cases left and no change in times.

### P2-3 Resuming during Talk time re-pauses silently 12 s later
Found by reading `main.js` against the sim's pause emulation. `resume()` resets `idleSaid` but not `world._talkAsks` (4 at the pause). The next re-ask is n = 5, so it is not spoken (n ≤ 3) and pauses again (n ≥ 4). A child who comes back has 12 s of silence and then sees the pause screen again. Resuming in a round also says nothing: `_idleGap` stays at 30 s, so the question is not heard again for up to 30 s.

**Change** (`main.js` `resume()`):
- In Talk: set `world._talkAskT = 0` and `world._talkAsks = 1` (better: a `World.resetNudges()` helper), keep the glow, and speak the Talk question.
- In a round in `ask`: call `repeatPrompt()` and set `world._idleT = 0; world._idleGap = cfg.idleTime`.

### P2-4 The project's CLAUDE.md belongs to another game
`elephant-rainbow-rocket/CLAUDE.md` is still the copy from Dee's Forest Memory. It has the wrong title, says the memory-card stack, says "Vịt Dee → Đi" and gives storage prefix `dm:`, but `storage.js` uses `rr:`. Future agents will follow the wrong rules. Rewrite it for Bim's Rainbow Rocket. Its rule about protecting prompts (`speakPrompt`) is still valid.

### P3-1 Round-end pacing: 16 identical boosts per session
The round end is 24 % of session time, and a 4-year-old will stop tapping the boost after a chapter or two (boostIgnorer: 100 % auto boosts, and 58 % of chapters lose round 4).

**CONFIG `autoBoost: 5 → 4`** (optional: `roundDoneTime 1.2 → 1.0`, `boostRise 1.4 → 1.2`). With all three: typical age 4 chapter 92.4 → 91.9 s and chapters cut 31 → 24 %; boostIgnorer cut 58 → 43 %; bot1 session 303 → 297 s.

Design idea (not simulated): make each boost different, so the 16th still surprises.
- A friend from the current topic waves from the cloud bank.
- Fly through a rainbow ring.
- Pop the cloud bank into confetti.
- At night, fly past the moon.

### P3-2 A cut chapter leaves the 4th dot empty
**Change:** in `world.js` `_afterBoost`, when the time limit cuts the chapter, set `this.roundsPerLevel = this.round` before `_startTalk()`. On the `talk` event, main.js calls `RR.UI.setDots(world.roundsPerLevel, world.roundsPerLevel)`, so the child sees every dot filled.

### P3-3 The shooting star competes with the spoken question
**CONFIG `shootingDelay: [1, 2.5] → [2.5, 4]`.** The question takes about 2 s to say, so this keeps the star from crossing during it. Not measured, because the models do not react to the star.

### P3-4 Content balance
In `content.js`, sample the colour sets so every colour is the answer about equally often (today red 22 % vs orange 11 % at ages 3–4).

## Recommended package, re-simulated together
CONFIG `chapterMinRounds 3 → 2`, `autoBoost 5 → 4`, `idleHintFrom 2 → 1`, plus the emulated code changes: tap lock 0.8/1.6, drag snap 80, sky taps don't reset idle, glow on the 2nd miss. Run: `hs_after_full`, 2 250 sessions (40 per cell).

| age 4 | before | **after** |
|---|---|---|
| typical chapter / session | 92.4 / 377 | 92.4 / 377 |
| slow3 session mean / p90 | 463 / 506 | **425 / 451** |
| sloppy chapter / hop | 111.0 / 8.4 | **94.3 / 4.6** |
| spammer chapter / hop | 53.2 / 0.4 | **75.2 / 2.6** |
| confused session / stuck hops > 60 s | 773 / 56 | **447 / 0** |
| tapper session / stuck hops | 676 / 97 | 535 / 38 (a random tapper ignores the glow) |
| absent | auto-pause at 120 s | auto-pause at 120 s |
| 2nd miss without a glow | 26 (bot0.5) | 0 |

At ages 3–7 the after-run has typical children unchanged (±1 %), every active session finishing, and no NaN.

## A game designer's view for a 4-year-old
- **Fun.** The core payoff works: the right answer becomes a curved flight with a rainbow ribbon, a bounce and a treasure in the wagon. Tapping anywhere to boost is toddler-proof. 3–4 s per decision followed by about 3 s of show is a good rhythm at this age.
- **Pacing.** A typical session is 6.3 min with 92 s chapters, which is right. The risk is at the slow end (fixed by P2-1) and in the repetitive round end (P3-1).
- **Clarity.** Two moments break the "my finger did something" promise: a drag that misses by a few pixels (P1-2) and taps on empty sky (P1-3). A 4-year-old reads silence as "it's broken".
- **What will bore her.** The 16 identical boosts. Shapes with only 5 answers. Count-up rounds that always start at 1.
- **What would delight her.**
  - Make the boost different each time (P3-1).
  - When she catches the shooting star, put a sparkle sticker into the wagon so it is a reward she can see.
  - After 3 rounds of ★★★ in a row, give Bim a "super loop" flight.
  - At the end, show the wagon's whole haul on the moon party ("You found 38 treasures!").

## Files added by the playtest (no game code touched)
- `tests/sim/hs_models.js`: new child models and the harness-side emulations of the proposed code changes.
- `tests/sim/hs_playtest.js`: parallel high-speed runner with per-hop, round and chapter metrics, time share and main.js pause emulation.
- `tests/sim/hs_browser.js`: real-game Playwright runner (`?speed=8&bot=1`).
- `tests/sim/lib.js`: now also exports `Kid`, `Tapper`, `SKILL`, `THINK` and `clamp`.
- Results are in `tests/sim/out/hs_*.md|json`. MECHANICS.md says this folder is git-ignored, but `git check-ignore` shows no rule covers it. Add `tests/sim/out/` to a `.gitignore` before committing.
