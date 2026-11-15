# Nim's River Hop — functional QA report (independent)

Tester: functional QA agent, 15 Nov 2026. Report-only: no file under `game/` or the existing tests was changed.

## How it was tested
- `tests/qa/qa_functional.js`: Playwright Chromium with `isMobile` + `hasTouch` contexts. Every game tap is a real CDP
  `Input.dispatchTouchEvent` (or `page.touchscreen.tap` for DOM buttons). The test never calls `world.pointerDown`.
  The devices were iPhone 393×852 @3 (portrait and landscape), iPad 820×1180 @2 (portrait and landscape), and iPhone
  portrait/landscape with notch insets emulated through `--sa-*` overrides (t 59 / b 34; l, r 59 / b 21).
  Groups:
  `boot`, `settings`, `chapters` (a whole age-4 session by real taps on every device, with chapters colors / shapes /
  count / animals), `voice` + `voice2` (a fake deterministic `speechSynthesis`, ≈ 90 ms per char, that records every
  cancel; iOS user agent, speed 1, not muted), `robust`, `time`, `assist`, `bot` (ages 3–7 × EN/VI to the done screen,
  speed 10).
- `tests/qa/content_ages.js`: in Node, every topic in `AGE_POOLS` and `AGE_TOPICS` × ages 3–7 × EN/VI × 30 seeds × 4
  rounds × maxK 4/3, plus Talk questions.
- Probes: `tests/qa/nim_tap_probe.js` (taps on Nim's body, standing and in the air) and `tests/qa/same_wrong_probe.js`
  (the 1 s repeat rule, with world-time stamps).
- Run: `node tests/qa/qa_functional.js` (≈ 15 min, `PAR=4`). One group: `QA_GROUPS=voice2 DEV=iphone-p …`. Output goes to
  `tests/qa/out/` (`results.json`, voice timelines `voice*.json`, screenshots).

## Pass counts (final full run)
| area | result |
|---|---|
| boot + language + title (6 devices) | 60/60 rows PASS. Title is EN/VI, chips relabel and re-speak in the new language, `nh:settings.lang` is saved, ▶ and gear sit inside the safe area and are ≥ 44 px |
| parent gate + settings (iPhone portrait, iPad landscape) | 18/18. Tap and 1 s hold do not open the settings, a 2 s hold does. All 8 settings are saved under `nh:settings` and restored after a reload. Only `nh:` keys are used. `?age=3&lang=en` is played but never saved |
| age-4 session by real taps (6 devices, EN ×4 / VI ×2) | **1 274 checks PASS, 6 FAIL.** 4 of the fails are harness timing under load (see the bottom of this report); 2 are P3-2 |
| voice policy, fake synth (4 runs) | 19 PASS, **4 FAIL → P2-1, P2-2** (P2-3 failed in an earlier run) |
| robustness (6 devices) | 108/108. Pause/resume re-says the question word for word. `visibilitychange` pauses (and stays paused). Rotation with a finger down cancels the gesture and no stone goes off screen. Rotation mid-hop: Nim lands on his stone. HUD, bubble and pause-screen taps never reach the world. A 2nd/3rd finger is ignored. Double-tap / pinch leaves `visualViewport.scale` at 1. Volume −/+ goes 80 % → 90 % → clamps at 100 %, is saved, and `NH.debug.audio()` has master → comp → user |
| 75 s rule | 3/3. Chapter > 75 s → Talk after 3 rounds (3 HUD dots); the next chapter is back to 4 |
| assist / queued tap | 10/10. 3 soft → hint, 6 → assist armed, a river press picks the target, the assisted round gets 2★. A next-row tap made in the air is judged on landing |
| bot sessions ages 3–7 × EN/VI | 80/80. sessionDone ★ = done screen = world = Σ round ★ + Talk ★. Play again works. All topics are valid. No stone overlaps the HUD, the bubble or the safe edge (checked at every ask and sampled every 300 ms with the real bubble text). No banned or raw text. VI lines are Vietnamese |
| content (Node) | 12 000 rounds valid, 0 invalid, 1 row = 1 target; 1 500 Talk questions valid |
| probes | same wrong stone inside 1 s: 18/18 = 1 miss. Tap on standing Nim: 4/4 = `pokeNim`, no miss. Tap on airborne Nim: 36/36 no miss (but see P3-2) |

Per-round checks that were verified on every device:
- right stone → `right`, `hop`, `land` on that id, and Nim's feet are within 0.25 S of the stone at `land`;
- wrong stone → `wrong`, a miss, no hop, and a kind line that names the tapped thing before the goal;
- same stone again inside 1 s → `squish {repeat}`, no 2nd miss;
- 2 misses → `hint`, the hand on the target and the target glowing;
- 2 later-row taps → 2 × `ahead`, no miss, "One at a time" ≤ 1×;
- water → `soft`;
- Nim tap → `pokeNim`, the question repeated word for word, no miss;
- taps while airborne (a sinking sibling, Nim) → no miss;
- stars 1 / 2 / 3 from 2 / 1 / 0 misses; world and HUD stars never go down;
- Talk answered by tap (right → +1★, wrong → +0);
- countSeq and countSel both seen, count events 1..n;
- every ask is in the voiceLog;
- zero console or page errors in every context.

## P1 — broken / blocking
None found.

## P2 — wrong but playable

### P2-1 Speech queue overflow drops a countSeq number, and once the question itself
- **Seen:** in 4 of 4 fake-synth count runs (EN and VI), "One!" / "Một!" was dropped and the child heard only "Two!
  Three!". In 1 run the warm-up question "Mình qua suối nào! Bé đếm cùng Nim và nhảy nhé: 1, 2!" was dropped too, so the
  child never heard it.
- **Repro:** age 4, put the count chapter first (or play to it). In the countSeq round, tap each row's stone as soon as
  it can be tapped, while the question is still being spoken. This is a quick child: about 0.2 s think time per hop.
  Then look at `tests/qa/out/voice-*.json`: `"One!" → dropped`.
- **Cause:**
  - `game/js/voice.js:50`: `MAXQ = 2`.
  - `voice.js:308-312`: when every waiting line is `priority`, the overflow drops `queue[0]`, which is the oldest
    count line, or the prompt.
  - `main.js:162-166`: `speakCount` queues `priority` without interrupting, behind the protected prompt. The prompt
    itself may still be waiting behind the chapter/weather lines (`main.js:283`).
  - VOICE §1.1 rule 2 assumes that "a queue of ≤ 2 is enough". That is not true while the question is still being said.
  - The VI run also queued the question a 2nd time from a Nim poke (`main.js:585-586`), which added one more line to an
    already full queue.
- **Fix:**
  - Never drop priority lines in `say()`: let the queue grow up to about 6 for priority lines and drop only
    non-priority ones.
  - Once the child has answered row 0 (on the first `right`), drop a prompt that has not started yet.
  - Do not re-queue the prompt from `askAgain` while count lines are waiting.

### P2-2 The wrong (teaching) line is lost at the start of a chapter
- **Seen:** EN `dropped`, then `interrupted` in the next run; VI `dropped`, then `stale`.
- **Repro:** fake synth, speed 1. Start chapter 1 and tap a wrong stone about 0.5 s after the question shows in the
  bubble. Tap the right stone about 3 s later. The question is still waiting behind "Chapter 1. Colour Stones" + "Spring
  by the brook! Look at the blossoms!", so it is heard ≈ 2.6 s after it was shown. The wrong line ("That's a blue ball.
  Where is a red one?") is queued non-priority, and then:
  - it is dropped by the overflow, or
  - it goes stale after 5 s, or
  - it is flushed by the right line's interrupt.

  The child never hears the tapped-thing / goal sentence.
- **Cause:**
  - `main.js:283`: the weather line is queued and runs into the ask.
  - `main.js:394`: `feedback(wt)` uses `interrupt: canInterrupt()` and is not priority.
  - `main.js:170`: `protect()` is timed from when the line is queued, not from when it starts, so the guard has already
    run out before the line is heard.
  - `voice.js:149` (STALE_MS 5 s) and `voice.js:308`.
- **Fix:**
  - Say the wrong line with `priority: true`.
  - Start its guard in `onStart`, as `speakPrompt` does.
  - On `ask`, drop the queued chapter-flavour lines (`NH.Voice.dropQueued()`), or let the ask interrupt the weather line.

### P2-3 The round's fruit praise (stick → `sayFruit`, "this IS the round's praise") is usually skipped
- **Seen:**
  - first full run: 0 of 8 rounds (EN 0/4, VI 0/4);
  - second full run: EN 4 lines (one of them cut), VI 1 of 4.

  VI is almost always silent because its right lines are longer.
- **Repro:** a normal-paced colours round (about 1.2 s think time per hop). After the last hop, no "Yum, an apple!" /
  "Ôi, quả táo!" is heard.
- **Cause:**
  - `main.js:361` only speaks when `canInterrupt()`.
  - `main.js:326`: `protect(txt)` on the last right line keeps `promptUntil` up for 600 + 95 ms × chars (≈ 3.3 s EN,
    4–5 s VI).
  - The `stick` event comes ≈ 2.5–3 s after the last tap (hop, bank hop, 2 walk hops, curl, roll).
- **Fix:** queue the fruit line (`interrupt: false`) instead of skipping it when the guard is up, and/or protect only
  prompts and wrong lines, not right lines.

## P3 — polish

### P3-1 Right lines cut each other or go stale at a natural pace, mainly in VI
- **Seen:** "Tưng! Con vịt cao su màu đỏ! Nhảy tiếp nào!" was cut at 2.0 of 4.2 s. In one VI round, 4 right lines went
  `stale` and were never said.
- **Cause:** `main.js:168`: the next right line interrupts once the guard has ended. VI right lines are ≈ 4 s long and a
  hop cycle is ≈ 1.8 s.
- **Fix:**
  - When `left > 0`, drop the "Tưng!/Đúng rồi!" opener and the "Hòn tiếp theo nào!" tail.
  - Or skip a new right line, rather than cutting the current one, if the current one started < 1.5 s ago.

### P3-2 A tap on airborne Nim can be queued as a press on a next-row stone and become a miss
- **Seen:** 1 time in 2 full runs. iPad portrait 820×1180, animals 3×2: events `right,hop,squish,land,…,homeBadge,wrong`.
  Misses went to 2, so the round got 1★ instead of 2★.
- **Repro:** tap the right stone. About 150–250 ms later, tap the centre of Nim's box while he flies over the next row.
  This is rare: `nim_tap_probe.js` saw 0 of 36.
- **Cause:** `world.js:663-668` checks stones before Nim's box, and `_pressStone` (`world.js:681-685`) returns
  `'queued'`. CLAUDE.md says Nim taps are never mistakes.
- **Fix:** in `_press`, while `this._hop` is active, a press inside `nimHit()` should go to Nim, not to the queue.

### P3-3 Zoom protection was only proven in Chromium
- Headless Chromium honours `user-scalable=no` by itself, so this run cannot prove that `kidProof()` blocks pinch and
  double-tap zoom on real iOS Safari, which ignores the meta tag.
- A 1-minute manual check on an iPhone is recommended.

## Not game bugs (harness timing under 4 parallel browsers; each passed when re-run alone)
- `chapters`, "same wrong stone < 1 s": under load, the real gap between the two taps went over 1 s of world time.
  `same_wrong_probe.js` confirms the rule holds (18/18).
- `chapters`, "stars undefined" on the last round of a chapter: the harness read `world.round` after the wipe swap.
- `settings`, play after the URL-flag settings did not start within 15 s: seen once, then 3/3 re-runs passed.
