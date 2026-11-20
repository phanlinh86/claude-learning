# Pip's Reef Tower — high-speed playtest report (2026-11-20)

Playtester (report-only for game code). Everything below comes from headless sims driving the real `RT.World` through
its public input API (`pointerDown/Move/Up`, `talkAnswer`), plus 10 real-browser sessions at 8× speed.

## How it was tested

| run | what | sessions |
|---|---|---|
| `hs_playtest.js --n 30 --tag pt_base` | 16 models × ages 3–7 (bots, typical, dragger, slow3, dropHigh, dropLow, sloppy, spammer, swiper, tapper, confused, absent, talkAbsent) | 2 180 |
| `hs_pt3.js --n 30 --rotate 0.25 --tag base` (**new**) | 12 models × ages 3–7, focused on TAP TO SEND: new `blockTapper` (taps a random block every 0.4–1.5 s, so every tap is an answer), `liftSpammer` (taps 5×/s while a block is lifting, sinking or bonking), `doubleTapper` (every tap is a double tap 80–200 ms apart). Adds a voice model of the **current** `main.js`, bonk runs, the puffer, and rotating the device mid-lift or mid-sink after 25 % of sends | 1 800 |
| `hs_pt3.js` variants v1–v7, c1–c5 | each proposal re-simulated on its own, then combined (harness-only prototypes, `--patch`, `--config`) | ≈ 8 600 |
| `hs_browser.js --sessions 2 --speed 8` | the real page in Chromium, ages 3–7, iPad landscape + iPhone portrait | 10 |
| `determinism.js` | same seed + inputs → same events | all deterministic |

Run it again with `node tests/sim/hs_pt3.js --n 30 --jobs 2 [--patch pufferStay,askGate] [--config '{…}'] [--rotate 0.25]`,
and compare runs with `node tests/sim/pt3_compare.js base c1 …`. Tables are in `tests/sim/out/pt3_base.md`, `pt3_c1.md`,
`pt3_c5.md`, `pt3_compare.md` and `hs_pt_base.md`.

## Verdict

**The game is solid and ready to ship.** There are no stuck states, no NaN and no crashes. Every session of every model
finished. The pacing hits the targets. The new tap gesture is robust against double taps, spam during lifts and rotation
mid-lift. I found four things to tune. The two that matter most for a 4-year-old are about **hearing and seeing**, not
mechanics:
1. Pip's question often starts late, behind the praise for the last block, and the blocks can already be tapped by then.
2. The puffer-fish surprise is almost never seen by a child who taps, because sending a block chases it away.

### Pacing (baseline, typical child)
| age | chapter mean / p90 | towers cut short | session mean / p90 / max | tower mean / p90 | ask mean / p90 | tap → landing |
|---|---|---|---|---|---|---|
| 3 | **91.8** / 102.6 s | 18 % | 374 / 405 / 408 s | 20.7 / 28.7 s | 6.0 / 8.9 s | 0.93 s |
| 4 | **88.2** / 102.5 s | 28 % | 360 / 382 / 393 s | 20.3 / 31.1 s | 5.3 / 9.5 s | 0.92 s |
| 5 | 88.3 / 106.4 s | 63 % | 360 / 392 / 414 s | 22.6 / 31.1 s | 4.3 / 7.3 s | 0.90 s |
| 6 | 93.0 / 107.9 s | 48 % | 379 / 423 / 456 s | 22.8 / 30.7 s | 3.8 / 6.5 s | 0.90 s |
| 7 | 93.9 / 103.7 s | 24 % | 383 / 400 / 410 s | 21.5 / 28.5 s | 3.3 / 5.6 s | 0.89 s |

- The toddler targets are met: chapters average 60–100 s, and every session p90 is ≤ 8 min. The slowest model (slow3)
  reaches a session p90 of 451 s at age 6, which is still within the limit.
- No model of any age had a stuck ask (> 60 s) or a stuck tower (> 120 s). All 1 800 + 2 180 sessions finished, with no
  NaN. The sway never went above 0.105 rad (the cap is 0.12).
- A dragging child (dragger, dropHigh) is just as fast as a tapping one: about 88 s per chapter at age 4.
- Real browser, 10/10 sessions finished with **0 page or console errors**. Sessions took 297–374 s of world time, with
  chapters of 69–98 s. About 30 % of frames counted as "slow"; that is headless software rendering at 8×, not a device
  finding.

### Random tapping — does a tap-as-answer make it too easy?
| age | model | 1st answer right | wrong / ask | asks with ≥ 3 bonks | time bonking | ★★★ / ★ | session |
|---|---|---|---|---|---|---|---|
| 3 (2 blocks) | typical | 61 % | 0.39 | 0 % | 2.3 % | 51 / 9 % | 374 s |
| 3 | blockTapper | 49 % | 0.86 | 10 % | 6.5 % | 27 / 51 % | 298 s |
| 3 | spammer (6 taps/s) | 51 % | 0.84 | 11 % | 8.1 % | 28 / 48 % | **244 s** |
| 4 (3 blocks) | typical | 73 % | 0.33 | 0 % | 2.2 % | 60 / 12 % | 360 s |
| 4 | blockTapper | 37 % | 1.28 | 25 % | 8.6 % | 15 / 72 % | 358 s |
| 4 | spammer | 40 % | 1.19 | 23 % | 10.2 % | 14 / 70 % | 292 s |

- Random tapping gets **chance-level** first answers (50 % / 33 %). Bonk runs are short: never more than 3 in a row, because
  the errorless fade removes the wrong blocks after the 3rd. Bonking is under 10 % of play time. The stars do tell the two
  kinds of play apart (★ 9–12 % for typical play, 50–72 % for random tapping). Random tapping does **not** "win".
- One weakness: at age 3 the spammer is the **fastest way through the game**. It takes 244 s, about the same as a perfect
  bot (250 s) and 2 minutes faster than a real 3-year-old. The wrong-block lock (0.7 s) ends before the bonk has even
  floated home (≈ 0.72 s), so the lock adds nothing.
- Random taps on the water (the `tapper` model) count as "soft taps": 89–92 % of its asks get a glow and the ghost hand,
  and 0.77 blocks per ask are stacked by the tower-tap assist. A child who doesn't aim is guided gently, as intended.

### The tap gesture in edge cases
- **Double tap:** we sent ≈ 6 200 second taps. All of them returned `null`, because the block is lifting and the phase is
  `drop`. They had no effect, and the results were identical to the typical child. ✓
- **Spam while a block lifts or sinks:** this only causes `locked` boops (0.03–0.11 per ask). The outcomes were identical. ✓
- **Rotation mid-lift or mid-sink:** 19 324 rotations (7 707 mid-lift, 7 629 mid-sink) and another 16 858 with the
  proposals. No piece was left in `lift` or `fall`, the tower count never went wrong, no lift got stuck and there was no
  NaN. ✓

### Voice (model of the current `main.js` and `RT.Voice` queue; TTS 0.25 s + length / 12 chars/s in English, 14 in Vietnamese)
| age | typical: question heard in full | cut by the child's own answer | question starts > 0.3 s late (mean / p90 delay) | wrong line heard in full | puffer tapped / puffer towers (time it can be tapped) |
|---|---|---|---|---|---|
| 3 | 87 % | 11 % | 55 % (0.66 / 1.67 s) | 37 % | 27 / 60 (1.2 s of 4 s) |
| 4 | 72 % | 25 % | 59 % (0.72 / 1.83 s) | 35 % | 17 / 60 (1.1 s) |
| 5 | 54 % | 43 % | 63 % (0.84 / 1.87 s) | 33 % | 10 / 60 (1.1 s) |
| 6–7 | 29–37 % | 59–67 % | 60 % (≈ 0.7 / 1.3–1.7 s) | 26–29 % | 12–13 / 60 (≈ 1 s) |

- **A late question (P1).** The next ask opens about 1.3 s after `stack`. At that moment the praise line ("Red! Two blocks
  tall!", ≈ 2 s) is still playing, so the question queues behind it. Of the late questions, 56 % waited behind the praise,
  then the weather line and the current line. During that wait the blocks can already be tapped, so a quick 4-year-old
  answers before Pip has asked.
- **The wrong line** ("Bloop! That's blue. Find red!") is mostly cut by the child's **own** next, correct answer. That is
  harmless: on average about 70 % of the line has been heard, so "That's blue" comes through and only "Find red" is lost.
  No change is needed beyond P2-1.
- **The puffer line** ("A puffer fish is visiting our tower!") is heard in full only 3–10 % of the time, because the next
  praise or wrong line cuts it.
- The prompt guard (`0.3 + 0.072·len` from when the question starts) can end ≈ 0.3 s before a long English question
  finishes. Fixing it gained only +1 point in the sim (v5), so it is low priority.

## Fun, pacing and clarity for a 4-year-old
- **Fun.** The core moment is: tap → a bubble lifts the block → it pops → the block sinks like a leaf → plonk, a puff of
  sand, and the tower sways. It takes 0.9 s, long enough to watch and short enough to keep a 4-year-old's attention. One
  tap per answer suits small fingers better than a drag (a sloppy dragger misses the tower 0.29 times per ask and the block
  floats home; a tap cannot miss). The finale (the crown, the pearls counted, bubbles, the fish school) comes every ≈ 20 s.
  That is a good reward rhythm. The puffer surprise is the weak spot: tapping children hardly ever get to tap it.
- **Pacing.** About 6 minutes per session and about 90 s per chapter is right for this age. Asks average 5.3 s, and
  nothing ever drags past a minute. Watching takes ≈ 40 % of the time, which feels calm rather than slow for a
  4-year-old, because every watching moment shows motion.
- **Clarity.** Errorless help works: a hint after the 2nd miss and the fade after the 3rd. Bonks are gentle and short.
  The biggest clarity gap is **hearing the question before acting**. A 4-year-old hears the whole question only 72 % of
  the time and often taps while Pip is still praising the last block, which teaches "tap anything fast". Gating the ask
  until Pip is quiet fixes this (below).

## Prioritised changes (every one re-simulated; numbers are for the typical child unless stated)

| # | change | where | why | measured effect (sim) |
|---|---|---|---|---|
| **P1-1** | **Ask gate:** the ask (question + tappable blocks) opens only when Pip is quiet, waiting at most **2.5 s**, for **ages ≤ 5**. World: in `_startAsk`, `if (this.askGate && this.askGate() && waited < cfg.askGateMax) return;` (stays in `deal`, so nothing can be tapped and there is no boop). Main: `world.askGate = () => RT.Voice.isSpeaking()` (plus a line still queued, if RT.Voice exposes it). New CONFIG `askGateMax: 2.5`, `askGateAges: 5` | world.js + main.js (logic) | the question is the lesson; today 59 % of questions start late, and blocks can be tapped before Pip has asked | v7 (gate only), age 4: question heard **75 → 93 %**, late **59 → 5 %**, delay 0.73 → 0.05 s; age 3: 89 → 99 %. Session 362 → 358 s; chapters that end after 3 towers 30 → 55 % (the 100 s budget is kept). Spammer age 3: 257 → 283 s. At ages 6–7 it would cost the 4th tower in ≈ 90 % of chapters, so they stay off (baseline numbers). Raising `chapterBudget` to 108 brings the 4th tower back but pushes age 3 to 99.5 s per chapter (c5), so **keep 100** |
| **P1-2** | **The puffer stays:** a send or a drop no longer chases the puffer away (drop `this._beeAway()` from `_send` and `_startFall`). It leaves after `pufferSit` or when tapped. Visual QA should check the lifting block passes **in front of** the puffer (z 4 vs the puffer layer) | world.js (logic) | sending a block 1–3 s into the ask makes the puffer leave after 1.1 s on screen, so the surprise is nearly invisible to tapping children | v1, age 4: puffer tapped **14 → 44 / 60** puffer towers, time it can be tapped 1.1 → 2.5 s; dragger 13 → 46 / 60; age 5 11 → 48 / 60. No change in pacing (session ± 2 s) |
| P1-2b | `pufferDelay [1.0, 2.0] → [0.3, 0.8]`, `pufferIn 1.8 → 1.2` | RT.CONFIG | the puffer reaches its spot ≈ 1.6–2 s after the ask, while the child is still thinking | v2 vs v1: puffer towers where it appears 36 → 49 / 60 for blockTapper; puffer line heard 8 → 12 %; otherwise the same |
| **P2-1** | `wrongLock 0.7 → 1.3` | RT.CONFIG | the 0.7 s lock ends before the bonked block is home (0.72 s), so it does nothing, and spamming is the fastest path at age 3 | v3: **typical unchanged** (it retries later anyway); bot0.8 hears the whole wrong line 29 → 48 %; spammer age 3 257 → 272 s, age 4 302 → 327 s; blockTapper +18 s. (1.8 s, v6, costs random tappers +31 s for +7 points of wrong line heard by typical: not worth it) |
| P2-2 | Puffer line: speak `T('puffer')` only when Pip is quiet, and shorten it to "A puffer fish! Tap it!" / "Cá nóc kìa! Bé chạm thử nhé!" | main.js `case 'puffer'` + i18n | heard in full only 3–12 %, so today it is noise | (only measured, not simulated) |
| P3-1 | Fallback if P1-1 is not done: `nextDealDelay 0.15 → 0.7` | RT.CONFIG | a cheaper partial fix for late questions | v4, age 4: question heard 75 → 81 %, late 59 → 36 %, chapters ending after 3 towers 30 → 40 %, session ± 1 s |
| P3-2 | Guard the question until `Voice.onEnd` instead of `start + 0.3 + 0.072·len` | main.js | long English questions are unprotected for their last ≈ 0.3 s | v5: +1 point heard; do it only for robustness |
| — | **Keep:** `tapMovePx 24 / tapTime 0.35`, double-tap handling, lift spam, rotation handling, the sway numbers, `hintAfterMisses 2`, `fadeWrongAfter 3`, stars 3/2/1 with one free slip, `chapterTimeLimit 80 / chapterBudget 100` | | each is fine in the sims | |

**Combined, c1 = P1-1 (gate at all ages, as simulated) + P1-2 + P1-2b + P2-1** (1 800 sessions, rotation on), typical child:

| age | question heard | late | puffer tapped / towers | session mean / p90 | chapter mean | chapters with only 3 towers | spammer session |
|---|---|---|---|---|---|---|---|
| 3 | 87 → **98 %** | 55 → 6 % | 27 → **39** / 60 | 374 / 405 → 372 / 404 s | 91.8 → 91.2 s | 18 → 48 % | 244 → **296 s** |
| 4 | 72 → **90 %** | 59 → 4 % | 17 → **45** / 60 | 360 / 382 → 368 / 403 s | 88.2 → 90.3 s | 28 → 43 % | 292 → 341 s |
| 5 | 54 → **81 %** | 63 → 4 % | 10 → **47** / 60 | 360 / 392 → 346 / 369 s | 88.3 → 84.7 s | 63 → 98 % | 361 → 343 s |

The c1 run kept every guarantee: 1 800 / 1 800 sessions finished, 0 NaN, 0 stuck asks or towers, 16 858 rotations with
nothing left moving, and a maximum sway of 0.105 rad. With the recommended age limit (gate only at ages ≤ 5), ages 6–7
keep their baseline pacing (4 towers in 52–76 % of chapters).
