# Bo's Farm Parade — functional QA (independent, report-only) · 2026-11-12

I did not change any game code. All my scripts are in `tests/qa/`:
- `qa_lib.js`: helpers. Real CDP `Input.dispatchTouchEvent` on `isMobile/hasTouch` contexts, a voice-log hook, an event hook, and an invariant sampler (stuck phase, NaN, exactly one odd member, stars only go up).
- `qa_touch.js`: 22 kid-abuse scenarios, run on all 4 devices.
- `qa_session.js`: speed-8 bot sessions with autorestart. Ages 3–7 × EN/VI, 2+ sessions each, 4 devices.
- `qa_settings.js`: parent gate, settings, Play again, autostart.
- `qa_extra.js`: double-taps on Resume and Play.

Output goes to `tests/out/qa/*.json`.

Devices: iPhone 393×852 @3, 852×393 @3, iPad 820×1180 @2, 1180×820 @2.

## Existing suites
| suite | result |
|---|---|
| `node tests/unit/run.js` | **34 / 34 pass** (3.2 s) |
| `node tests/unit/i18n_voice.test.js` | **47 773 / 0** pass |
| `node tests/unit/parade_art.test.js` | **12 052 / 0** pass |
| `node tests/e2e/smoke.js` | **PASS** iphone-portrait + iphone-landscape (16 rounds, 4 talks each) |
| `node tests/e2e/functional.js` | **84 / 84 pass** in 608 s when run alone. The first run happened while my QA scripts were also loading the CPU, and 3 tests failed: `ipad-portrait tap_wrong`, `ipad-portrait surprise_chick` and `ipad-landscape rotate_mid_hop`. All 3 pass when run alone, so they are timing flakes (see P3-5). |

## Summary of what held up (no defects)
- **0 console errors / page errors / HTTP ≥ 400** in every run.
- **Rapid taps on the odd one:** a double tap, then a triple tap 40–60 ms apart, gives exactly 1 `right` and 0 `wrong`. The later taps hit the hopping member and only make a `wiggle` or `soft`.
- **Tapping the same wrong member again:** 6 taps 120 ms apart count as 1 miss. A tap 1.3 s later counts as miss 2. Then the odd one glows and the ghost hand appears. The kind words name the tapped thing ("That’s the flower. It’s purple, like its friends. Find the one that’s not purple!"), and none of them contain a banned word.
- **Two fingers:** two fingers down at once on a match and on the odd one → only finger 1 is judged. Finger 1 held on a match while finger 2 taps the odd one → finger 2 is ignored. After both fingers lift, the next tap works.
- **Long press** (2.5 s) on a member is judged once, with no text selection. A long press on Bo makes only `pokeBo`.
- **Drag across every member** (600 ms) → only the first contact is judged. A quick flick from the path onto the odd one → `right`. A slow drag over 0.25 s → only `soft`, as designed.
- **Hammering during enter:** no member is judged during enter. During hop, gate, march and out, tapping every member makes no extra right/wrong, misses stay 0 and the round keeps 3★.
- **Barn and stage:** tapping the barn before the gate → `soft` only. Tapping the member on the stage in the gate → `doorOpen`.
- **HUD taps** mid-hop never reach the canvas.
- **Rotation** in every phase: mid-play with a finger down, mid-hop/count, mid-march, mid-enter, Talk. On all 4 devices no member left the screen, the next tap worked, and HUD stars = world stars. The Talk buttons stay inside the screen after rotating, and a tap on them still works.
- **Page hidden mid-march** → paused, world time frozen. Resume → the march finishes, the next round starts, HUD = world stars, the AudioContext is running again.
- **Pause in every phase** (play, hop, gate, march, enter, Talk unanswered, Talk answered, levelDone): world time freezes, Resume brings back the right screen, and Talk is re-shown.
- **Idle:** 4 nudges, then an auto-pause.
- **Parent gate:** a 300 ms touch does not open settings; a 2.3 s hold does.
- **Settings during a session** (Home → hold the gear): VI, age 3→7, name "Mầm Đức", volume 0, then Done → Play. Age 7 topics (`initial/add/sub/oddeven`), every line Vietnamese, title "Tuổi 7+", button "Chơi". Volume 0 sets `Audio.volume` 0, the `user` gain 0 and the voice volume 0. 3 × "+" → 30 % (gain 0.48) and it is saved. "−" stops at 0 %, "+" stops at 100 %.
- **Child name with diacritics:** said correctly ("Hoan hô bé Mầm Đức!", "Oa, bé Mầm Đức tìm siêu giỏi!").
- **Language switch** on the title mid-session (pause → Home → chip): the next session is fully VI (bubble, voice, `<html lang>`, pause menu).
- **Play again:** a double tap starts exactly 1 new session. Stars go to 0, the HUD shows 0, the dots reset to `now,,,`, the done screen hides, and a real tap works.
- **Double tap on Play:** 1 session, the chapter line is said once.
- **Autostart:** `?autostart=1&lang=vi&age=7` plays a VI age-7 game and the flags are never saved (reload → en, 4, speed 1). `?autostart=1&bot=1` without autorestart stops on the done screen, and Home works.
- **Talk:** wrong, wrong, right taps → exactly 1 `talkResult` and no extra star, with kind words "There are four apples! Good try!".
- **Long bot sessions** (speed 8, 10 runs × 2–3 sessions): see the table. No stuck phase (the longest is the hop + count run, 7.0 s, at age 6), no NaN, exactly one odd member in every play phase, world stars and HUD stars only go up, and the HUD peak = the session stars.
  - Talk time happens in every chapter (4 per session).
  - Every round has exactly one `right`, and the dots match the round.
  - In the voice log: every line is in the session's language, no line is said twice in a row, there are no raw keys, NaN or negative words, every count run is complete ("One, two, three, four apples!"), and every `sayWrong` names the tapped thing.
- **Safe areas** emulated with `--sa-*`: phone portrait 59/0/34/0, phone landscape 0/59/21/59, iPad 24/0/20/0. No button, HUD item, bubble, member, Bo or barn door sits under an inset, on the title or in play.

| run | sessions | rounds | right | wrong (lines) | talks | voice lines |
|---|---|---|---|---|---|---|
| age 3 en / vi | 2 / 2 | 32 / 32 | 32 / 32 | 5 / 4 | 8 / 8 | 175 / 176 |
| age 4 en / vi | 2 / 2 | 32 / 32 | 32 / 32 | 11 (9) / 9 (8) | 8 / 8 | 182 / 178 |
| age 5 en / vi | 2 / 3 | 32 / 33 | 32 / 32 | 9 (8) / 8 (6) | 8 / 8 | 179 / 182 |
| age 6 en / vi | 2 / 3 | 32 / 32 | 32 / 32 | 13 (10) / 12 (10) | 8 / 8 | 182 / 185 |
| age 7 en / vi | 3 / 3 | 32 / 32 | 32 / 32 | 2 / 5 | 8 / 8 | 172 / 179 |

(Fewer wrong lines than wrong taps is expected: main.js says at most one wrong line per 1.5 s.)

---

## P1

### P1-1 Tapping Bo or the bubble after the right answer cuts the count run and asks the question again
Breaks a CLAUDE.md rule: "the count run is never cut".

**Repro (all 4 devices, `ONLY=ipp TESTS=bo_tap_mid_count node tests/qa/qa_touch.js`)**
1. Start a `count` chapter at age 4 and wait more than 3 s after the ask.
2. Tap the odd crate. Bo starts the count run "One, two, three, four apples! The others have two."
3. 0.9 s later (phase `round/hop`), tap Bo once. This is very likely: excited kids tap the puppy.

**Expected:** at most a bark or "Woof! That tickles!". The count run keeps going.

**Actual:** `speak("Count the apples! Every crate has four apples… but one! Which crate does NOT have four apples?", {interrupt:true})`. The count run is cut and the question that was already answered is asked again while the crate lands on the stage.

The bubble does the same thing. Repro: `TESTS=bubble_tap_mid_hop` → in `round/hop` a bubble tap says "They’re all purple… but one! Which one is NOT purple?" on every device.

**Suspected cause**
- `game/js/world.js:280` `prompt()` returns the prompt for the whole state `round`, including phases `enter` and `hop`. So `_pokeBo` (`world.js:648–650`) emits `pokeBo` with a prompt during the hop.
- `game/js/main.js:329–334` checks only `world.state !== 'round'`. Then line 331 skips only when the speaking line is the prompt. Here the count run is speaking, so line 334 calls `repeatPrompt()`.
- `repeatPrompt()` (`main.js:543–549`) sets `promptUntil = 0` and speaks with `interrupt: true`.
- `bubbleTap()` (`main.js:550–553`) calls `repeatPrompt()` with no phase check at all.

**Fix idea:** in `repeatPrompt` and in the `pokeBo` handler, require `world.interactive` (state `round`, phase `play`, not answered). Otherwise say `bo.poke` only when nothing is speaking. Or make `world.prompt()` return null once `_answered` is set.

## P2

### P2-1 Tapping the bubble while the parade walks in makes Bo say the question twice
**Repro (all 4 devices, `TESTS=bubble_tap_enter`)**
1. Start a session.
2. While the bubble shows "Here comes the parade!" (phase `enter`), tap the bubble.

**Expected:** nothing new, or the question once when the `ask` event arrives.

**Actual:** the voice log has `["They’re all purple… but one! Which one is NOT purple?", "They’re all purple… but one! Which one is NOT purple?"]`. The same long line is said twice in a row: first by `repeatPrompt` (`lastAsk` is null, but `world.prompt()` is non-null in `enter`, so `currentPrompt()` builds the `first:true` ask), then by the real `ask` event.

**Suspected cause:** `main.js:550–553` (`bubbleTap` → `repeatPrompt`), `main.js:547` (`if (!lastAsk && !(world.prompt && world.prompt())) return;` should be `if (!lastAsk) return;`), `world.js:280`. The P1-1 fix (require `world.interactive`) fixes this too.

## P3

### P3-1 Resume after a Talk answer asks the Talk question again
**Repro (`TESTS=pause_each_phase`, step `talk-answered`)**
1. Reach Talk time and tap the right picture.
2. Within the 1.6 s before `levelDone`, tap Pause, then Resume.

**Expected:** no question (it is already answered), or "Great!".

**Actual:** `speak("What colour is this?", {priority:true})` after the answer was marked right. A moment later the chapter ends.

**Suspected cause:** `main.js:188`. Add `&& !world.talkAnswered` to the condition.

### P3-2 Pausing during the hop loses the "right" line for good
**Repro:**
1. Tap the odd one.
2. Within about 0.3 s tap Pause, wait, then tap Resume.

**Actual:** `pause()` calls `Voice.stop()` (`main.js:176`), so "The blue bucket! It's not red." / the count run is never heard. `resume()` re-says something only in `play`, `gate` and Talk (`main.js:188–190`). For phase `hop` nothing is said and the child never hears why it was right.

**Suggested:** remember the last feedback line and, in `hop`, re-say it on resume (queued).

### P3-3 A double tap on Resume falls through to the canvas and counts as a press without progress
**Repro (all devices, `node tests/qa/qa_extra.js`):** in play, tap Pause, then double-tap Resume (40 ms apart).

**Actual:** the 2nd tap lands on the canvas → `soft` (dust puff) and `_noProgress`. Three of these (`hintAfterSoft` = 3) give an early hint. Nothing was under the button on any device, so a member was never judged by mistake.

**Suggested:** after Resume (and Play / Play again), ignore canvas presses for about 250 ms (`main.js:560`). Or block world input briefly after `FP.UI.only()` hides a screen.

### P3-4 The name filter keeps the letters inside stripped tags
Typing `Mầm Đức<b>{x}` saves `"Mầm Đứcbx"` (`ui.js:48` strips only `<>{}`). The diacritics are kept and said correctly, so this is only cosmetic.

**Suggested:** also trim the name and collapse spaces.

### P3-5 Some e2e tests are timing-sensitive under CPU load (test issue, not game)
`functional.js` `rotate_mid_hop` uses a 3 s `waitForFunction` window, and `tap_wrong` uses the 1 s same-member window. Both measure world time, which falls behind wall time when frames are slow: dt is capped at 0.1 s in `main.js:515`. They failed once while other Playwright jobs were running and passed when run alone.

My own flick test (a CDP swipe of about 80 ms against the 0.25 s `flickTime`) was also flaky on iPad portrait under load and passes when run alone.

**Suggested:** run the suite alone in CI, or check those windows with `FP.debug.world.time`.

## Not defects / observations
- The 75 s chapter limit, auto-open of the gate (4.3 s max in the gate) and the Talk re-ask flow all behaved as MECHANICS.md says during the long runs.
- At age 7 a session may not include `count`: the topic pool rotates 4 of 5 topics. This is by design.
- A Talk wrong answer cannot be corrected (one try per chapter, kind "Good try!" line). This matches DESIGN.
- Talk buttons on the iPhone are 106×96 css px, on the iPad 140×128.
