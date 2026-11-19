# Functional QA report: Mochi's Icing Bakery (2026-11-19)

Scope: functional QA only. No game code was changed. New probe: `tests/e2e/qa_functional.js` (results go to
`tests/out/qa_functional/results.json`). It uses isMobile + hasTouch contexts at iPhone 393×852 @3 and 852×393 @3, and
iPad 820×1180 @2 and 1180×820 @2. All input is real CDP touch (`Input.dispatchTouchEvent`), with several fingers where a
test needs them.

## 1. Existing suites

| suite | result |
|---|---|
| `node tests/unit/run.js` | PASS, 33/33 (10.8 s) |
| `node tests/unit/i18n_voice.test.js` | PASS, 7804/7804 |
| `node tests/unit/cookie_art.test.js` | PASS, 24/24 |
| `node tests/e2e/smoke.js` | PASS: iphone-landscape, iphone-portrait, ipad-landscape (real tap + drag, bot sessions for ages 3/4/5/7) |
| `node tests/e2e/functional.js`, run 1 | PASS, 120/120 |
| `node tests/e2e/functional.js`, run 2 | PASS, 120/120. No flakes. |

## 2. New probe `tests/e2e/qa_functional.js` (full run: 163/170; after fixing 3 false positives in the probe, 4 real FAILs remain, listed in §3)

| group | what it checks | result |
|---|---|---|
| jitter | finger with ±0.45·tol random jitter on iPhone P (colours), iPad L (shapes), iPhone L (letters) completes, no magic | PASS |
| backwards | start at the wrong end and slide back: no progress, no traceStart, no crash | **FAIL**: 61 % progress, a 2nd reverse drag completes the trace (BUG-1) |
| resume | lift 3× and resume: progress only grows, `tracePause` ×3, `resume:true`, finishes | PASS |
| twofinger | a 2nd finger landing mid-trace is ignored; the 1st finger keeps the stroke; a 2nd finger tracing while the 1st rests is ignored | PASS |
| offedge | slide off the tray, over the HUD, past the screen edge, lift outside: press ends, progress kept, icing stops, no pause, completes after | PASS (iPhone P + L) |
| fastswipe | 200–500 ms swipe sampled at 60 Hz (12–30 samples) completes in one stroke | PASS |
| taphop | quick 70 ms taps hopping along the dots (no slide) must not complete the trace | **FAIL**: a line takes 3 taps, a letter 8 taps (BUG-1) |
| taponly | a child who only taps the middle of the tray (ages 3/4/6) gets assist → magic icing → finishes; never a miss (3 stars) | PASS (18 / 18 / 23 taps) |
| stars | 0 / 1 / 3 wrong → 3 / 2 / 1 stars; HUD total grows by the same; hint + ghost hand on the right choice after 2 wrong | PASS |
| chips | need+4 fast taps → exactly N `chipDrop`, `chip` i = 1..N in order, one `chipsDone`, extras not misses, counted aloud | PASS |
| mochi | tap Mochi (> 3 s after the prompt) and tap the bubble both repeat the prompt aloud (fake speechSynthesis); bubble tap sends no world event | PASS |
| visibility | hidden → paused, speech cancelled, music stopped / ctx suspended, silent while hidden; Resume → play + prompt repeated | PASS |
| voice volume | settings slider 40 % → `gains().user` = 0.64, utterance.volume = 0.4 | PASS |
| surprises | bird tap → `birdTap`; mouse ×3 → 3 `mouseTap` (taps counted); sack on screen in iPhone portrait; never misses | PASS |
| hud | taps on HUD stars / dots / bubble never reach the world; a press that starts on the bubble cannot pipe icing | PASS |
| pausetrace | pause mid-trace: press cancelled, icing stops, moves while paused do nothing, progress kept, completes after Resume | PASS (a 2nd-finger tap on ⏸ did nothing in Chromium; see §4) |
| rotate | mid-trace iPad L→P and iPhone L→P: press cancelled, progress kept, all dots + cookie on screen, completes. Mid-hop iPhone P→L and iPad P→L: hopping / rack cookies stay on screen, still lands on the rack | PASS |
| settings | 1.8 s hold and hold-then-slide-away do not open it; 2 s does; age 6 / VI / name (`<>` stripped) / volume 0.35 saved and persist after reload; `?lang=en&age=3` applies for the session only; `?lang=vi&age=6` plus a volume change does not write lang/age; the age chip shows the session age | PASS |
| sessions | bot at speed 8, ages 3–7: 16 rounds, 16 cookies, 4 Talk times each; done stars = world stars; all 11 topics seen; Play again (real tap) rotates chapters | PASS |
| vi | title / settings / play / pause / Talk show no English; whole VI session: every bubble + voice line is Vietnamese; done title VI | PASS except **aria-labels** (BUG-2) |
| audio | `IB.debug.audio().gains()`: makeup 1.6, compressor, user 1.6 at 100 %; ⏸ volume − to 0 → 0 %, gain 0, saved 0; + ×3 → 0.48; persists after reload | PASS |
| errors | zero console errors / pageerrors / HTTP ≥ 400 on every page of every group | PASS |
| network | no request to any host other than the local server | PASS |

## 3. Bugs

### BUG-1 (P2): tracing can be done without following the dots (tap-hopping, starting mid-path, tracing backwards)
The tracker accepts the first sample of a press anywhere within `look + 1.2·tol` arc length (≈ 160 picture px) of the
icing head. It does not require the finger to touch the glowing start or the icing head, and the progress made by a
quick tap is kept. So the "write it" step (stroke direction / order for numerals and letters) can be skipped.

Repro (iPhone landscape 852×393, `?seed=42&age=4`, chapter `colors`, warm-up path = straight line, 250 px):
1. Tap the right icing bag.
2. When the dots show, quickly tap (70 ms, no slide) at 35 %, then 65 %, then 97 % of the line.
   - Expected: these are `traceTap`s ("Keep your finger down and slide!"). No icing.
   - Actual: progress 0.35 → 0.66 → 1.0, `traceDone` (no magic), 0 `traceTap` events. A capital letter (iPad P, age 5) is done with 8 such taps.
3. Variant: press on the END of the line and slide back towards the start.
   - Expected: no progress (the docs say "the start must be touched", forward only).
   - Actual: when the finger passes ≈ 60 % of the line, progress jumps to 0.61 and icing appears ahead of a finger that never touched the start. A second reverse drag from the end then completes the trace.
4. In all these cases `traceStart` is not emitted, yet icing appears (the squeeze sound / "start" line are skipped).

Suggested fix:
- `game/js/trace.js` → `trackOne` / `track`. While `state.done <= 1e-9` (stroke not started), accept a sample only when it
  is within `tol·1.2` of the stroke's first point (not of any point in `[0, look]`). On the first sample after `lift()`
  (`state.fx == null`), accept only `nb.s <= done + tol` (the finger must land on the icing head). After that, the
  normal `[done, done + look]` window applies while sliding.
- `game/js/world.js` → `_traceUp`. When the press was a tap (`p.maxD < traceTapMove && dur < traceTapTime`), roll the
  progress back to `p.total0` (already stored in `_traceDown`, never used) and emit `traceTap`, unless magic icing is on.
- Add `taphop` + `backwards` cases to `tests/unit/run.js` (Trace.track with the finger at s = 0.35·len, 0.65·len, …).

### BUG-2 (P3): aria-labels stay English in Vietnamese (VoiceOver)
Repro: open `?lang=vi` (or pick Tiếng Việt) and inspect `#btnPause`, `#btnParents`, `#btnVolDown`, `#btnVolUp`,
`#btnMic`.
- Expected: Vietnamese labels (the keys exist: `ui.quieter` "Nhỏ hơn", `ui.louder` "To hơn", `ui.mic`, …).
- Actual: "Pause", "Parents: hold to open settings", "Quieter", "Louder", "Answer by talking".

Only `#btnPlay` is translated. Suggested fix: `game/js/ui.js` → `applyLang`. Add a `data-i18n-aria="ui.pause"`
(etc.) pass that does `setAttribute('aria-label', T(lang, key))`. Add `ui.pause` and `ui.parentsHold` to both languages
in `i18n.js`.

### OBS-1 (P3, not confirmed on a device): a button can't be tapped while another finger rests on the screen
In Chromium emulation, a second-finger tap on ⏸ while a finger traces (or on Play while a thumb rests on the screen edge)
produces no `click`. That is Chromium behaviour for non-primary touches. However, `IB.Input.kidProof()`
(`game/js/input.js`) calls `preventDefault()` on every `touchstart` with `touches.length > 1`, and on iOS Safari that
also suppresses the click. So a child holding an iPad with a thumb on the glass probably cannot press Pause, Play,
Talk-time answers or Resume. Please check on a real iPad. If it reproduces, the fix is in `input.js` → `kidProof`: skip
the multi-touch `preventDefault` when `e.target.closest('button, .screen')`. Pinch zoom is already blocked by the
viewport meta and the `gesture*` handlers.

## 4. Notes (not bugs)
- A tap on Mochi within 3 s of a prompt starting is ignored on purpose (`pokeMochi` in main.js) so the prompt is not cut off.
- Extra chip taps after N land silently (no `already` event, because `_stepDone` makes the step non-interactive). Fine.
- A tap-only child always gets 3 stars (`needPick` / `traceTap` are not misses, assist taps the right choice). This matches the "no fail state" rule.
- Three checks were false positives in the probe and were fixed in it:
  - Vietnamese words without diacritics ("Hai!", "Con ong! Vo ve!") were flagged as English.
  - The chip count was read after the round had moved on.
  - The gain was read before `setTargetAtTime` settled.
- CDP `touchEnd` lists the points being released (not the ones left). The probe follows that.
