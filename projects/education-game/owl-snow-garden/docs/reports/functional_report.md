# Owlet's Snow Garden — Functional QA report

Date: 2026-10-31 · Suite: `tests/e2e/functional.js` (rewritten from Dino Nest Sort) · Server: `tests/e2e/serve.js`
Run: `node tests/e2e/functional.js [group …]` → prints PASS/FAIL per check, writes `tests/out/functional/results.json`
plus screenshots, and exits 1 if any check fails.

## Result

| | |
|---|---|
| Checks | **304** |
| Passed | **303** |
| Failed | **1** (a game bug, P3) |
| Test bugs found and fixed while adapting | 3 (see below) |
| Wall time | 8 min 35 s (budget 12 min) |

Group times: boot 16 s · lang 6 s · gate 33 s · settings 28 s · input 128 s · pointer 14 s · count 39 s · ask 48 s ·
talk 49 s · pause 22 s · rotate 38 s · help 17 s · bot 76 s.

## What ran

Playwright Chromium, `isMobile` + `hasTouch` contexts: iPhone 393×852 @3, 852×393 @3, iPad 820×1180 @2, 1180×820 @2.
Input is real: CDP `Input.dispatchTouchEvent` (which Chromium turns into touch and pointer events), plus one test with
dispatched `PointerEvent`s and one with a mouse.

| Group | Covers |
|---|---|
| boot (4 devices) | boots to the title with zero console errors; logo "Owlet's Snow Garden", stars, age; Play button on screen and ≥ 60 px |
| lang | EN→VI chip changes logo, tagline, `<html lang>` and `document.title` (= `ui.title` "Vườn Hoa Cú Tuyết"), age shown as "Tuổi 5", Lumi greets in VI, VI kept after reload, VI→EN |
| gate (iPhone P, iPad L) | short tap / 1.2 s hold / hold that slides off the gear do **not** open settings; a 2.2 s touch or mouse hold does; panel fits on screen; Done returns to the title |
| settings + flags | age/lang/name/toggles saved to `sg:settings`, every storage key has the `sg:` prefix, settings kept after reload, name has `{}<>` removed, 7+ shown, game starts with the saved age and language; `?lang=vi&age=6&mute=1` is used for the session but never saved, even when a parent changes another setting |
| input (4 devices) | HUD and bubble taps never grab a seed; tapping the bubble or **Lumi** repeats the prompt (voiceLog grows, same text); **a quick tap on a seed is not a drop** (only a `tap` event: no drop, miss or wrong; the seed stays home; its name is spoken); the dragged seed follows the finger; **correct drop** → grab/drop/correct/land, the seed is planted in its pot, `grow`→1, `bloom` event; **wrong drop** → `wrong` (with `target` = the right pot), the seed bounces home (`return`→`idle` at home), not planted; **miss on empty snow** → `miss`, back home; **2 misses → hint**, only the right pot glows; a second finger is ignored; round ends only after every seed has bloomed, and stars fly into the HUD |
| pointer | dispatched PointerEvent drag and a mouse drag both plant a seed |
| count (iPad L, iPhone P) | one planter, N holes, more seeds than N; the prompt names N; the planter fills to N; the extra seeds fade away (`leave`, alpha 0) as soon as it is full; `bloom.n` counts 1..N; Lumi counts aloud; an extra seed thrown while the last one is in the air is refused with no penalty |
| ask (iPad L EN, iPhone P VI) | animals chapter = ask mode; the bubble names `world.target`'s animal; a drop into another pot is wrong and the target stays; a drop into the target is correct (planted and bloomed), the target moves to `queue[1]` with an `ask` event, and the bubble and voice name the next animal; the hint glows the asked pot; the round ends when the queue is empty |
| talk (3 devices, EN/VI, right/wrong) | panel opens; texts clean (Vietnamese in VI); choices on screen and ≥ 60 px; **tapping a choice answers**, a double tap or a second choice is ignored; the right choice is highlighted; Lumi answers in the right language; the panel closes and the next chapter starts |
| pause | pausing while holding a seed cancels the drag; resume; world frozen while paused; **visibilitychange** (hidden) pauses, cancels the drag and freezes the world, and stays paused when the page is visible again; Home goes to the title with music stopped; a double tap on Play starts one session; page hidden during Talk time |
| rotate (iPhone, iPad) | portrait↔landscape with layout checks; **rotation mid-drag cancels the drag**, every seed stays inside the screen, no stale drop when the finger lifts; rotation while a seed flies home; still playable afterwards |
| help (EN/VI) | low-skill bot at age 3: wrong/miss/hint/idle lines clean and in the right language; idle nudge after 12 s |
| bot | **full sessions for ages 3, 4, 5, 6, 7 × EN/VI** at `speed=12`, skill 0.7, spread over the 4 viewports: every one reaches `done` with all 4 chapters and Talk times; the done screen shows the stars; Play again starts a new session; **every voice line is non-empty, in the session's language and has no placeholder** (90–110 lines per session); VI sessions: more than 60 % of lines have Vietnamese diacritics and none has English words; zero console errors; autorestart works |

## Game bugs

### P3-1 — Talk time cannot be paused, and leaving the app during Talk time does not pause
- **Repro:** `?mute=1&seed=6&age=4` → play to the first Talk time (or use the bot at speed 12 and stop it when
  `world.state === 'talk'`). (a) The HUD pause button is covered by the Talk overlay: `elementFromPoint` at the centre
  of `#btnPause` returns `#scrTalk` (`#hud` z-index 5 < `.screen` z-index 10), so there is no pause or Home during Talk.
  (b) Hide the page (`visibilitychange`, `document.hidden = true`) and show it again: `SG.debug.mode` stays `'talk'`;
  no Pause screen appears, unlike in a round. (The world does not advance while hidden and the AudioContext is
  suspended, so nothing is lost. It is just inconsistent: the child comes back to an open question with no
  "Paused / Resume" step.)
- **Suspected:** `game/js/main.js` `pause()` returns early unless `mode === 'play'`. `resume()` already has a branch
  for `world.state === 'talk'` that can never run.
- **Suggested fix:** in `pause()` use `if (mode !== 'play' && mode !== 'talk') return;` and also call
  `SG.Voice.stopListening && SG.Voice.stopListening()`. `resume()` already reopens `scrTalk`. Optionally give the
  Talk panel a small pause button, or raise `#hud` above `.screen.dim` while Talk time is open.

No P1 or P2 bugs found. Correct, wrong, miss and tap input, planting, growing and blooming, count and ask modes,
hints, Talk time, pause, rotation, persistence and both languages all behaved as DESIGN.md and MECHANICS.md describe,
on all four viewports.

## Test bugs fixed while adapting (not game bugs)
1. Ask-mode animal name: pot labels are `{type, value}`, not `{kind, value}`. The test now calls
   `SG.I18N.name(lang, label.type, label.value)`.
2. Talk double-tap check: on this headless machine frames take 100–400 ms. Calling `tapEl` before the 3rd tap took so
   long that the panel had already closed (1.6 game-seconds after the answer), so `boundingBox()` returned null. The
   test now reads every button box before the first tap and checks the highlight right after the answer.
3. Pause during Talk: the test first tried to tap the pause button, which is covered (that is the P3 bug above). It now
   only reports whether the button can be reached and uses visibilitychange.

## Notes and observations (not bugs)
- **Rendering speed in headless Chromium:** on the iPhone @3 contexts a frame took 100–400 ms here (software
  rendering, about 3 fps). Game time then runs slower than real time because `dt` is capped at 0.1 s. This is a
  property of the CI machine, not a device measurement, but the visual/perf tester may want to profile the canvas cost
  on a real iPhone. (`renderScale()` already caps the backing store at 3.2 MP on touch devices, and adaptive quality
  steps it down.)
- One touch-start retry was logged in the count overfill test: the targeted seed had just switched to `leave` because
  the planter filled up mid-gesture. That is the expected behaviour.
- From reading the code (no test exercised it): when the chapter time limit cuts a chapter to 3 rounds, the HUD still shows 4 round dots (`setDots(roundsPerLevel, …)`).
  This is cosmetic; it is mentioned only because a parent might notice an unfilled dot.

## Re-run after the fixes (lead, 2026-10-31)
P3-1 fixed in `main.js pause()` (Talk time can be paused; speech recognition stops). Full suite re-run on the fixed build:
**304 passed, 0 failed (468 s).**
