# Functional QA report — Nuka's Snow Dig (2026-11-23)

Tester: functional QA agent (report-only; no `game/` file was edited).
Script: `tests/e2e/functional.js` (adapted from `../bunny-dino-dig/`: namespace `NK`, `nk:` storage, Nuka / seal / tern,
no hatch, new rub / rubDemo / twirl / slide / float / `w.aurora` checks). Probe helper: `tests/qa/rub_probe.js`.
Run: `node tests/e2e/functional.js [group …]` — groups `layout boot lang gate persist audio dig rub slide count help talk
pause rotate multi surprise bots`; writes `tests/out/functional/results.json`; **exits 1 on any FAIL**.
Input: real CDP touch (`Input.dispatchTouchEvent`) on `isMobile` + `hasTouch` Chromium contexts — iPhone 393×852 @3,
852×393 @3, iPad 820×1180 @2, 1180×820 @2. `NK.debug` is used to read state and to jump to a topic / round.

## Result

**660 / 660 checks pass** (final state of the script).

| run | checks | result |
|---|---|---|
| Full run, all 17 groups (≈ 26 min) | 660 | 639 pass, 21 fail. 20 were a mistake in the new bot-rub check (fixed). 1 was a CDP stall during a rub timing check (check made more robust). No game bug. |
| Re-run `rub` + `bots` after the two test fixes | 182 | 182 pass |
| Groups not re-run (layout … multi, surprise) | 478 | 478 pass in the full run |

Per group (final): layout 84 · boot 24 · lang 9 · gate 18 · persist 10 · audio 10 · dig 88 · rub 62 · slide 30 · count 21 ·
help 18 · talk 52 · pause 12 · rotate 48 · multi 6 · surprise 48 · bots 120. Unit tests: `node tests/unit/run.js` 52/52.

**No P1 or P2 game defects found.** Zero console errors, failed requests or page errors in every group, including 20 full bot
sessions (ages 3–7 × 4 viewports, EN/VI alternating, `speed=8&bot=1`). Each session: 16 rounds, 4 Talk times, 1–5 surprises,
stars only go up, and sessionDone = world = HUD = done panel.

## What was covered (all by touch unless noted)
- **Boot / title**: title shown, loader gone, HUD hidden, Play ≥ 88 px, gear on screen, Play → chapter 1 asks, pause ≥ 44 px.
- **Language**: VI chip → Vietnamese title, welcome line and prompts, every voice line `vi`. Settings EN chip syncs both switches.
- **Parent gate**: a short tap and a 1 s hold do **not** open settings; a 2 s hold does. The game does not start, and Done can be reached (3 viewports).
- **Persistence**: age / language / name / volume survive a reload. `?age= ?lang= ?speed= ?seed=` are never written. Every key starts with `nk:`. The volume (80 %) persists and shows in the pause menu. The audio chain goes master → compressor (−18 dB / 12 / 4 / 4 ms / 180 ms) → user gain (vol × 1.6) → destination.
- **Tap dig**: one tap gives `dig → scoop ×3 → reveal → found → twirl → hop {float: true, T 0.9} → shelved {n: 1}` with no `hatch`. The hat lands in the aurora ribbon (`w.aurora.n = 1`) and the drift becomes an empty hole. The paw keeps scooping by itself: reveal **2.20–2.22 s** after one tap (spec 2.21).
- **Rub dig** (one touchMove per ±50 CSS px swing):
  - **Right drift**: `dig {rub: true}` plus `rub` strokes on that drift only. Reveal **0.82–0.85 s** (spec ≈ 0.82; < 0.6 × tap on all 4 viewports). Queued ≤ 3, scoops = needed. Never `soft`, `wrong`, `busy`, `sandTap` or `pokeBun`. Misses unchanged. No voice line per stroke.
  - **Empty snow** inside the dig site: `sandTap {rub: true}` at most every 0.25 s. `_noProg` and misses unchanged, no hint, no dig, no soft.
  - **Wrong drift**: a rub dig there leads to exactly one `wrong {kind: 'thing'}` and 1 miss, judged at the pop-out.
  - **Another drift while digging**: `busy` ≤ 1 per 0.25 s, and that drift stays buried.
  - **Already-open hole**: exactly one `already` per press, no dig, no new miss.
  - **Rub demo**: the first ask of the session triggers `rubDemo` on the right drift (`hintHand.rub`, no glow), and the "Rub the snow!" line is queued after the prompt. A dig ends it, and it happens only once per session.
- **Soft / tap rules**: a 1.3 s press gives soft `hold`. A press that leaves the drift in one move gives soft `drag` with no rub. An 8 px wobble is still a tap. `busy`, `already`, sand tap and stars (3 + 2 = 5) behave as before, and re-tapping the digging drift is faster (0.9–1.1 s).
- **Count mode** (EN/VI, ages 4–6): N finds counted 1..N aloud, the spares stay buried, and re-tapping a dug hole gives `already`.
- **Help**: hint after 2 taps without progress, assist after 4 (age 4), idle nudge, bubble tap repeats the prompt (and never reaches the canvas).
- **Talk time** (4 viewports, EN/VI): choices ≥ 60 px and tappable. A right or other answer gives a correct `talkResult`. A second tap does not answer twice. Lines are clean and kind, stars go +1 or stay the same, and play goes on.
- **Tap Nuka**: `pokeBun` and the prompt is said again word for word.
- **Pause**: the world freezes and taps don't dig. Resume repeats the prompt. A dig started before the pause holds and then completes. `visibilitychange` hidden → paused (stays paused when visible again, until Resume). The pause button works during Talk time, and Resume returns to it.
- **Rotation mid-dig** (4 directions): the layout re-flows, every drift and tap point stays inside the new screen and clear of HUD / bubble / shelf, the dig completes, ribbon items sit on the new ribbon, and the round finishes.
- **Rotation mid-rub** (4 directions; the finger is down and rubbing with a dig running): `world._press` is dropped on relayout. Later moves and the lift of that finger do nothing (no rub / dig / soft / sandTap / busy / wrong). Drifts stay inside, the dig completes with no miss, a new rub after the rotation digs, and the round finishes.
- **Belly-slide**: one `slide` event (dist 324 portrait / 420 landscape), slidePuff ×14, and the `slide` mood is seen. `slideBox()` stays inside the safe screen in every sample and never overlaps the bubble. Nuka is back on his feet afterwards. This also holds when rotating L→P mid-slide (iPhone and iPad).
- **Surprises**: on every viewport, the seal and the tern appear, their tap points are on screen and clear of HUD / bubble, and a real tap gives `sealTap` / `ternTap` plus a line. Score, misses and no-progress don't change, and the round still finishes.
- **Multi-touch**: a second finger is ignored, and the first finger digs.
- **Layout**: on 4 viewports × ages 3–7 × every topic × rounds × rerolls, every drift tap point is inside the screen, clear of the DOM and logical HUD / bubble / ribbon, and hits the canvas. `moundTap(id)` hits that same drift, and Nuka's tap point is not over a drift.

## Failures seen during the run (none are game defects)
1. **Bot-rub check (20 FAILs, test bug, fixed).** The new check assumed `stats.rubs < stats.digs`. In fact `stats.rubs` counts every `dig {rub}` event, including queued scoops (`game/js/main.js:251`), while `stats.digs` counts only first digs. The check now only asserts `rubs ≥ 1`. Every bot session rubs (25–105 rub events).
2. **`ipadL rub: digs faster than a tap` (1 FAIL, environment).**
   - What happened: reveal at 1.58 s. Only 2 strokes reached the world before the reveal (world time 0 and 0.1 s), and the remaining moves arrived after it.
   - Cause: a CDP stall while the machine was busy. CDP touch dispatch took 0.2–0.45 s per event here (`tests/qa/rub_probe.js`), and pointermove was not coalesced (checked).
   - Fix in the test: it now keeps rubbing until the thing pops out (≤ 12 swings), like a child would. Re-run: 0.83 s on ipadL.
   - Repro of the slow case: `node tests/qa/rub_probe.js 12 5 5 50` (5 sub-moves per swing at ~0.3 s per CDP event, so a very slow rub).
3. **Load-only flakes (not in the final runs).** These appeared only while 3 Playwright runs and other agents' browsers shared the machine (load average ≈ 12). They pass when run one after another:
   - **Soft hold judged as a tap.** A 1.3 s press was judged a tap: world time advanced < 1 s because `dt` is capped at 0.1 s per frame (`main.js:467`) and frames ran below 10 fps.
   - **Talk did not close in time.** It closes 1.6 s of world time after the answer; the Talk check now waits for the state instead of sleeping.
   - **Tern tap missed.** The tern moved between the read and the tap because CDP was slow.
   - **Dig chains ran past their time limits.** The longer runs then cascaded into later checks failing.

## Findings and suggestions (P1 / P2 / P3)
**P1:** none. **P2:** none.

**P3 (polish / testability):**
1. **No screen-px rub or slide hooks in `NK.debug`** (`game/js/main.js` `hooks()`, ≈ lines 573–598). `world.rubPath(id)` and `world.slideBox()` exist, but there is no `NK.debug.rubScreen(id)` / `slideScreen()`, so tests convert with `toScreen` themselves. There is also no `rubMound` hook (not needed: real touch was used).
2. **Misleading `stats.rubs`** (`main.js:251`). It counts `dig {rub}` events, including every queued scoop, so `rubs` > `digs`. Suggest `stats.rubDigs` (first digs started by a rub) plus `stats.rubStrokes`.
3. **Press timing uses world time** (`world.js` `pointerUp`: `this.time - p.t > cfg.tapTime`, with dt capped at 0.1 s per frame). If the page stalls (< 10 fps, e.g. an old iPad in low-power mode), a long press can count as a tap and dig. It can never become a mistake on its own, but using `performance.now()` for tap / hold timing would be safer.
4. **Strokes inside `rubGap` are dropped, and the path is reset first** (`world.js` `pointerMove`: `p.path = 0;` before the `rubGap` test). At 120 Hz with a very fast rub, every other stroke is lost instead of deferred. It is harmless at real rub rates (queue ≤ 3), but keeping `p.path` when gated would make fast rubbing a little more responsive.
5. **Tapping Nuka during `enter` may use a different wording** (`main.js` `currentPrompt()` 186–189). Before the round's `ask`, `lastPromptText` is `''`, so Nuka says a random wording of `T(promptKey)`. The `ask` a moment later may use a different one. This is minor; it could wait for the ask, or reuse the same wording.

## Notes
- `tests/out/functional/results.json` holds the last run only (`rub` + `bots`). The full run's log is summarised above.
- Under load, run the groups one after another (`node tests/e2e/functional.js dig rub …`). The timing checks (dig and rub speed, soft hold, Talk close) read world time, which runs slower than real time when frames drop.
