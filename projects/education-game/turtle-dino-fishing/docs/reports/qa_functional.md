# Functional QA — Tibo's Dino Lake Fishing (2026-11-17)

Report-only: no game code was changed. Test files: `tests/e2e/functional.js` (the gate, rewritten for this game; exits 1 on
any failure) and `tests/qa/qa_functional.js` (exploratory probes, always exits 0).

```
node tests/e2e/functional.js                       # all: 4 devices + 10 bot sessions (≈ 15 min)
ONLY=iphone-portrait node tests/e2e/functional.js  # one device, no bot sessions
TESTS=rotate_mid_cast node tests/e2e/functional.js # one test on all 4 devices (the P1 repro, ≈ 2 min)
SKIP_BOT=1 node tests/e2e/functional.js            # devices only
node tests/qa/qa_functional.js                     # probes (PROBES=pause_in_talk,rotate_storm …)
```

## What was tested
Playwright Chromium, `isMobile + hasTouch` contexts: iPhone 393×852 @3, iPhone landscape 852×393 @3, iPad 820×1180 @2,
iPad landscape 1180×820 @2. **Every game tap is a real CDP touch** (`Input.dispatchTouchEvent` → pointer events → `TL.Input`
→ World) at the fish's **current** screen position (`TL.debug.memberScreen`), retried only while the fish is under the
bubble/HUD. World events are copied by wrapping `world._emit`; speech is checked through `TL.debug.voiceLog` (`?mute=1`:
logged, not spoken).

| test | what it checks | iPhone P | iPhone L | iPad P | iPad L |
|---|---|---|---|---|---|
| boot_title | title, logo, play/gear sizes on screen, no missing asset, 0 console errors, Play → HUD | PASS | PASS | PASS | PASS |
| tap_right | real tap on the moving target → right → cast → plop → bite → reel → surface → show → roundDone (3★) → release → dive → lily, +1 open lily, colour named in the voice log | PASS | PASS | PASS | PASS |
| tap_wrong | other fish → wrong (that id) + dart, no right/cast/lily, misses 1, still interactive, kind words; then target → 2★ | PASS | PASS | PASS | PASS |
| tap_water_soft | 2 taps on empty water → `soft {kind:'water'}`, misses 0, no wrong | PASS | PASS | PASS | PASS |
| rotate_mid_round | finger held on water, rotate, slide over every fish → gesture cancelled, nothing judged, everything on screen, next tap right, rotate back on screen | PASS | PASS | PASS | PASS |
| **rotate_mid_cast** | rotate in the 0.27 s cast wind-up after `right` → the catch must still finish | **FAIL** | **FAIL** | **FAIL** | **FAIL** |
| rotate_mid_reel | rotate while reeling (+ finger down) → gesture cancelled, fish/hook/Tibo/lilies/bubble on screen through the catch, lily, next ask | PASS | PASS | PASS | PASS |
| critter_ptero / bronto / frog / fireflies | forced in round 1 of chapter 0/1/2/3, real tap → `critterTap {kind}`, never wrong/soft, misses + no-progress unchanged | PASS | PASS | PASS | PASS |
| two_misses_hint | 2 different misses (the 2nd > 1 s world time later) → `hint` on the target, hand + glow | PASS | – | – | PASS |
| count_topic | count round: `right.count.n` = spots, `count` events 1..n after `show`, count run "1, 2, 3 — three spots!" in the voice | PASS | – | – | PASS |
| animals_topic | bubbles only, bubble names the animal; round 1 at age 5 is a home rule, bubble says "in the …", right + `home` badge | PASS | – | – | PASS |
| tibo_repeat | tap on Tibo > 3 s after the ask → `pokeTibo`, the question repeated word for word, not soft/wrong | PASS | – | – | PASS |
| talk_time_tap | Talk screen, 2–3 picture choices, real tap on the answer → talkRight +1, +1★, back to play | PASS | – | – | PASS |
| pause_resume | world time frozen while paused, resume repeats the prompt | PASS | – | – | PASS |
| visibility_pause | hidden page → paused + finger gesture cancelled; visible → stays paused; resume → real tap works | PASS | – | – | PASS |
| language_switch | VI title / logo "Rùa Tibo · Câu Cá Hồ Khủng Long" / document title / Play label saved; VI prompt in bubble + voice (lang vi), no overflow; pause title VI; back to EN | PASS | – | – | PASS |
| parent_gate | short tap, `touchscreen.tap`, 1.2 s hold and a hold that slides off do NOT open; 2.3 s hold opens | PASS | – | – | PASS |
| settings_persist | age 6, VI, name "Mầm", music/sfx off, volume 40 % survive reload under `tl:`; `?age=3&lang=en&speed=2` apply but are never saved (also when settings change under them) | PASS | – | – | PASS |
| url_age_shown | `?age=2/4.5/9` → plays and shows 3 / 5 / 7+ | PASS | – | – | PASS |
| audio_chain_volume | after the Play unlock `gains()`: threshold −18, knee 12, ratio 4, attack 0.004, release 0.18, user 1.6, master 1; pause − ×3 → 70 % saved, gain 1.12; slider 30 % → 0.48, restored after reload, `Voice._volume` 0.3 | PASS | – | – | PASS |
| voice_log_langs | speed 1, EN and VI: ask, wrong, right, count run, release/lily lines all in the voice log, right language, no raw keys | PASS | – | – | PASS |
| hud_tap_ignored | taps on the HUD stars and the bubble never reach the canvas | PASS | – | – | PASS |

Bot sessions (`?speed=8&bot=1&autostart=1&mute=1`, ages 3–7 × EN/VI, 10 runs spread over the 4 devices): **all 10 PASS** —
each reached the done screen with 16 rounds, 16 casts, 16 lilies, 4 Talks, 4 critters, every prompt in the voice log, only
the session language, no raw keys; Play again / Home from the done screen work. 36–59 s each.

**Total last full run: 78/82 passed (920 s) — the 4 failures are the P1 below.**

Exploratory probes (`tests/qa/qa_functional.js`): idle ×5 → auto-pause PASS; resume back into Talk + answer PASS; Tibo tap
while reeling says nothing over the right line PASS; a second finger on the target ignored PASS; name sanitising PASS; Play
double-tap PASS; voice log at `?speed=8` (VI) PASS; landscape bubble fades after `right` and returns at the next ask PASS;
**rotate_storm FAIL** (= P1); **pause_in_talk FAIL** (= P3-1).

## Bugs (most severe first)

### P1-1 — Rotating (or any viewport change) during the cast wind-up leaves the round stuck forever
- **Repro:** start any round, tap the asked fish, rotate the device within ≈ 0.27 s (`castWindup 0.12 + castRelease 1.0 ×
  castWhip 0.15`). Deterministic: `TESTS=rotate_mid_cast node tests/e2e/functional.js` (slows the world to 0.05× so the
  window is ≈ 5 s). In-page: `w.pointerDown(m.x, m.y); w.pointerUp(m.x, m.y); w.setViewport(1556, 720, {})`.
- **Result:** `phase` goes back to `play`, `interactive` = true, but the caught fish stays `state: 'hooked'` and is never
  released: a tap on it only `wiggle`s (pointerDown judges only `swim` / `dart`), `_doHint` / assist need `swim` / `dart`, so
  no hint either. Idle nudges repeat a question that cannot be answered, 5 idles → auto-pause; resume → still stuck. Only
  Home gets the child out. All 4 devices.
- **Why it matters:** the same thing happens on any `setViewport` that changes the logical size — on iPhone landscape the
  logical W = 720 × aspect, so a Safari toolbar show/hide (a `visualViewport` resize) can trigger it without a rotation.
- **Cause:** `game/js/world.js:451` — `_snapAll()` calls `this._lineRest(true)` when `line.state === 'rest'`, which is the
  line's state during the wind-up (`_right` sets `line.state = 'rest'`, world.js:720). `_lineRest` sets `ln.id = null`
  (world.js:1254), and `_stepCast` (world.js:969) then sees no member and falls back to `play` without un-hooking the fish.
- **Fix (verified in-page: a 70-rotation storm × 3 seeds then never stalls):** in `_snapAll`, keep the cast going:
  ```js
  else if (ln.state === 'rest' || ln.state === 'free') { var keep = this.phase === 'cast' ? ln.id : null; this._lineRest(true); if (keep) ln.id = keep; }
  ```
  and make the `_stepCast` fallback safe: before `_setPhase('play')`, set every `hooked` member back to `swim` (and
  `line.state = 'rest'`), so a lost line can never strand a fish. Add a unit test "resize during the cast wind-up".

### P2-1 — Project README.md and CLAUDE.md still describe the previous game
- `README.md:1–50` and `CLAUDE.md:1–40` are "Moka's Fairy Tea Party" (Moka, tea things, lanterns, `FT.*`, `tea_art.js`,
  test command `tests/unit/tea_art.test.js` which does not exist here). A parent/maintainer reading the README gets the
  wrong game and the wrong test command. Skill "Deliver" step 3 requires both to be updated.
- **Fix:** rewrite both for Tibo (mechanic, files `fish_art.js`, `TL.*`, test command `node tests/unit/run.js && node
  tests/unit/i18n_voice.test.js && node tests/unit/fish_art.test.js && node tests/e2e/smoke.js`, full `tests/e2e/functional.js`).

### P3-1 — During Talk time the HUD sits on top of the pause menu
- **Repro:** reach Talk time, tap ⏸. `#stage.talking #hud { z-index: 12 }` (`game/css/style.css:117`) stays above
  `.screen` (z 10) because `pause()` (`game/js/main.js:185`) keeps `#stage.talking`. The stars pill, round dots and a dead
  pause button float above the dimmed pause panel (tapping it does nothing). On iPhone landscape it can crowd the panel top.
- **Fix:** in `pause()` remove `talking` and in `resume()` re-add it when `mode === 'talk'`; or CSS
  `#stage.talking:not(.paused) #hud` with a `paused` class toggled by pause/resume.

### P3-2 — Stale headers from the tea-party copy
- `game/js/storage.js:1`, `game/js/assets.js:1` ("Moka's Fairy Tea Party"), `tests/e2e/serve.js:1`. Cosmetic; fix the comments.

### P3-3 (observation, no change required) — adjacent lanes' hit circles overlap in landscape
- iPad landscape: lane spacing ≈ 132 logical px, hit radius 72 → circles overlap; nearest centre wins, so a tap ≥ 66 px
  above/below a fish centre towards the neighbour lane picks the neighbour (counted wrong). Correct per MECHANICS §2;
  the playtester may want to check the wrong-tap rate in landscape. (The test's "other fish" choice was relaxed for this.)

## Notes for the team
- Headless Chromium runs ≈ 10 fps here and `main.js` caps a frame at 0.1 s, so the world runs ≈ 0.7× wall time at speed 1.
  The suite waits on **world time / events**, never fixed wall-clock gaps (the old 1 s same-fish window failed that way).
- `wrong.hint` is set on the event after `_emit` (world.js:742), so an `_emit` hook cannot see it — main reads the live
  object, fine; the test checks the `hint` event instead.
- Not verifiable here: real iOS TTS (Samantha / Linh), `audioSession`, speech recognition.
