# Dino Nest Sort: Functional QA Report

**Suite:** `tests/e2e/functional.js` (Playwright Chromium, `isMobile` + `hasTouch`, real CDP touch events / mouse)
**Devices:** iPhone portrait 393×852@3, iPhone landscape 852×393@3, iPad portrait 820×1180@2, iPad landscape 1180×820@2
**Run:** `node tests/e2e/functional.js [group ...]`. Groups: `boot lang gate settings input mouse count talk pause rotate help bot`.
Setting `DN_GAME_ROOT=<dir>` runs the suite against another copy of `game/`. That is how the rest of the suite was checked while P1-1 blocks all real input.
**Output:** `tests/out/functional/` holds `results.json`, `run-real.log`, `run-patched-inputfix.log`, screenshots, and `texts-<age>-<lang>.json`, which has every voice line and canvas string the bot sessions produced.

## Summary

| Build | Pass | Fail | Notes |
|---|---|---|---|
| `game/` first build (commit 175fad5) | **221** | **50** | 43 of the 50 failures come from **P1-1**: a finger or mouse can never grab an item |
| first build + 3-line P1-1 fix (copy in /tmp) | 264 | 7 | the 7 remaining failures are real issues P2-1, P2-2, P3-1, P3-2 |
| **current `game/` (lead's fixes applied)** | **272** | **0** | P1-1, P2-1, P2-2, P3-1, P3-2, P3-3 and P3-4 are all fixed and verified; 0 touch-start retries |

**Status after the fixes (re-verified by the full suite):** all 7 issues below are fixed.
- P1-1: `main.js` now does `down: (x, y) => onDown({ x, y })`.
- P2-1: `applySize` calls `cancelDrag()` when the logical size changes.
- P2-2 and P3-4: there is a `langOverride` / `curLang()`.
- P3-1: there is a `curAge()`.
- P3-2: the Done button is sticky, and a `max-height: 500px` rule tightens the panel.
- P3-3: items win over Bo's tap zone.

The lead also re-ordered the chapters to put the easiest first, so for age 4 `count` is now chapter index 1, not 2. The count group reads the index from `DN.AGE_TOPICS` so it no longer hard-codes `?level=2`.

The table below records the first build; every FAIL in it is now fixed.

| Area | Status |
|---|---|
| Boot → title, no console errors (4 devices) | PASS |
| Title language chips EN↔VI, DOM changes, persists after reload | PASS |
| Title shows stars + age | PASS (fails when `?age=` is set, see P3-1) |
| Parent gate: short tap / 1.2 s / slide-off do NOT open; 2.2 s touch and mouse hold open | PASS (3 devices) |
| Settings: age, language, name, 4 toggles persist (`dn:settings`), name sanitised, 7+ | PASS |
| URL flags not saved | **FAIL**: `?lang=` leaks (P2-2); `?age`, `?mute` are fine |
| Real drag: correct / wrong / miss / 2 misses → hint / HUD+bubble taps / 2nd finger / tap Bo | **FAIL on committed build (P1-1)**; all PASS once fixed |
| Count mode (age 4, count chapter from `DN.AGE_TOPICS`): exactly N ends round, extra fruit rejected, Bo counts | FAIL (P1-1); PASS once fixed |
| Talk time: right and wrong answers, double tap / second choice ignored, panel closes, next chapter | PASS (EN + VI, 3 devices) |
| Pause / resume via HUD, page hidden → paused, Home → title + music stops, double-tap Play | PASS (pause-while-holding needs P1-1) |
| Rotation while idle / mid-flight: layout valid, nothing under HUD/bubble | PASS |
| Rotation while holding an item | **FAIL (P2-1)** |
| Bot sessions, speed 12, ages 3-7 × EN/VI → `done`, play again, autorestart | PASS (10/10 sessions + autorestart) |
| Text hygiene: no `{`, `undefined`, `NaN`, raw keys in voice / bubble / talk / banner / done text; VI lines are Vietnamese | PASS (about 2,050 voice lines + about 640 UI strings) |
| Idle nudge (12 s) and help lines EN/VI | PASS |

## Issues

### P1-1: Touch and mouse input never grabs anything (game unplayable by a child)
- **Status:** FIXED (verified).
- **Where:** `game/js/main.js:342-344` and `game/js/input.js:42-44`
- **What:** `DN.Input.attach` calls the handlers as `h.down(x, y, ev)`, `h.move(x, y, ev)` and `h.up(x, y, ev)`. `main.js` wires them as `down: onDown`, where `function onDown(p)` reads `p.x`/`p.y`. It does the same in `move: p => world.pointerMove(p.x, p.y)` and `up: p => ...`. `p` is a number, so `p.x` is `undefined` and `world.pointerDown(undefined, undefined)` never hits an item. Tapping Bo does nothing either. The bot and the smoke test bypass `DN.Input`, which is why this slipped through.
- **Repro:** open the game on an iPhone or iPad, press Play, and drag an egg. It does not move. There are no `grab` events and `DN.debug.world.held` stays `null`.
- **Fix:**
  ```js
  // main.js bindUI()
  DN.Input.attach($('game'), {
    toLogical,
    down: (x, y) => onDown({ x, y }),
    move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
    up:   (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
    cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
  });
  ```
  With exactly this change, every input, count, mouse, pause-hold and rotation check passes. Keep `functional.js input` in CI so this does not come back.

### P2-1: Rotating the device while holding an item gives a stale drop (counted as a miss, item at the screen edge)
- **Status:** FIXED (verified).
- **Where:** `game/js/main.js:51-62` (`applySize` → `world.setViewport`) and `game/js/world.js:275` (`setViewport` / `_relayoutRound` keep `state:'drag'`)
- **What:** after a resize the held item stays in `drag`, but `world.finger` still holds the logical point from the old view. The item springs to that stale point, which is clamped to the new `[0,W]×[0,H]`. In the measured cases it ended at `y = 720 = H`, half off the bottom of the screen in landscape. When the finger lifts, `_drop` runs: you get `drop` + `miss`, a "miss" voice line, `it.misses++`, and possibly a hint. If the stale point lands on a nest, it counts as `wrong` (a lost star) or `correct`, even though the child did nothing.
- **Repro:** iPhone portrait, hold an egg, rotate to landscape, then lift the finger. Events: `["grab","drop","miss"]`. This happened on iPhone and iPad in both directions.
- **Fix:** cancel the drag whenever the logical size changes. `cancelDrag` returns the item home quietly, with no miss.
  ```js
  function applySize() {
    const prev = view;
    view = computeView();
    if (world && (prev.W !== view.W || prev.H !== view.H) && world.cancelDrag) world.cancelDrag();
    ...
  ```
  The Input module's `active` pointer can stay as it is: later `move`/`up` calls see `held === null` and do nothing. Optionally also call `world.cancelDrag()` from the `orientationchange` listener.

### P2-2: `?lang=` URL flag gets saved into the parent's settings
- **Status:** FIXED (verified).
- **Where:** `game/js/main.js:428` (`if (FLAGS.lang) S.lang = FLAGS.lang;`) together with `saveSettings()`, which writes the whole `S`
- **What:** the comment says "session only — not saved unless the parent changes it". But the first time the parent touches any setting (toggle, age, name) under `?lang=vi`, `lang:"vi"` is written to `dn:settings`.
- **Repro:** set `dn:settings = {lang:'en',age:4}`, open `?lang=vi&age=6&mute=1`, hold the gear for 2 s, and toggle Sound. Saved: `{"age":4,"lang":"vi",...}`.
- **Fix:** keep the session override separate from the saved copy, the same way `age` is handled:
  ```js
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;
  const curLang = () => langOverride || S.lang;          // use everywhere S.lang is read for display/voice
  // language chip handler: S.lang = b.dataset.lang; langOverride = null; saveSettings(); ...
  ```
  An alternative is for `saveSettings` to write `Object.assign({}, S, { lang: savedLang })` while an override is active.

### P3-1: Title shows the saved age, not the `?age=` age being played
- **Status:** FIXED (verified).
- **Where:** `game/js/main.js:123` and `:443` (`setTitleInfo(..., S.age, ...)`), while `startGame` uses `FLAGS.age || S.age` (`:107`)
- **Repro:** open `?age=6` with saved age 4. The title says "Age 4" (VI: "Tuổi 4") but the game plays age-6 topics.
- **Fix:** pass `FLAGS.age || S.age` to `setTitleInfo` in `goTitle()`, `boot()` and the language-chip handler. The settings-panel chip should keep showing `S.age`.

### P3-2: iPhone landscape: the settings "Done" button is below the fold
- **Status:** FIXED (verified).
- **Where:** `game/css/style.css:93-104` (`.settings-panel`, `.set-grid` with 210 px columns)
- **What:** at 852×393 the panel scrolls, and Done sits at y = 414-468 px in a 393 px viewport. A parent has to discover the scroll to leave settings. Nothing else on the screen leaves it.
- **Fix:** in landscape, either make Done sticky (`.settings-panel > .btn { position: sticky; bottom: 0; }`) or add a close "×" in the panel header. Another option is to tighten spacing under `@media (max-height: 500px)`: two-column `.set-row`, `h2` margin 6 px, `.set-grid` `minmax(170px,1fr)`.

### P3-3: Bo's "repeat prompt" hit zone overlaps the touch pad of the top-left item
- **Status:** FIXED (verified).
- **Where:** `game/js/main.js:328`: Bo zone is `|x−bo.x| < 0.45h && y < bo.y+10`. `play.y = bo.y + 10` (`world.js` layout), and item touch radius is `0.6·size + 14` (about 84 px for 116 px eggs).
- **What:** for an item in the top-left grid cell, the top roughly 26 logical px of its touch circle lies inside Bo's zone. A finger touching the top edge of that egg repeats the prompt instead of grabbing. This is minor; the suite never hit it deterministically.
- **Fix:** give the item priority. Call `world.pointerDown()` first, and only if it returns `null`, test the Bo zone:
  ```js
  function onDown(p) { if (mode !== 'play' || bot) return; if (world.pointerDown(p.x, p.y)) return; if (inBo(p)) repeatPrompt(); }
  ```

### P3-4: `?lang=` override and the title language chips disagree for the session
- **Status:** FIXED (verified).
- **Where:** `game/js/main.js:107` (`world.setLang(FLAGS.lang || S.lang)`)
- **What:** with `?lang=vi`, tapping "English" on the title switches the UI and voice to EN (`S.lang`). The world is still created with `vi`, so the language-dependent content (letters / initial-sound rounds, ages 5-7) stays Vietnamese while prompts are in English.
- **Fix:** the P2-2 fix covers this. The chip clears `langOverride`, and `startGame` uses `curLang()`.

## Code review notes (no defect found, recorded for the lead)
- **Double triggers:** Play, Again and Home hide their screen synchronously, so a second tap cannot land. The test "double tap on Play → one session" passes. `world.talkAnswer` is guarded by `talkAnswered`, so a double tap, or tapping a second choice, gives exactly one `talkResult`. Tested on 3 devices.
- **Listeners:** `holdButton` and `Input.attach` are bound once. Talk choice buttons are rebuilt with `innerHTML=''` each time, so old listeners are collected. `Voice.init` guards against re-adding `visibilitychange`. No leaks found.
- **iOS:** Audio and speech unlock run in a capture-phase `touchend`/`click` listener on `document`, which is correct for iOS 15-17. `Voice.unlock` speaks a silent utterance inside the gesture. `#stage` uses `inset:0` plus `height:100dvh`; older iOS falls back to `inset:0`. `viewport-fit=cover` with `env(safe-area-inset-*)` is read through `#safeProbe`. Page hidden → pause + `AudioContext.suspend()`, and coming back stays paused until the child taps Resume.
- **kidProof:** `touchend` within 320 ms of a previous one is `preventDefault`-ed on non-buttons, including `#bubble`, so a fast second tap on the bubble is swallowed. This is intended (double-tap-zoom guard); the suite spaces its taps 400 ms apart.
- **Page hidden during Talk time:** `pause()` does nothing (`mode === 'talk'`), but audio is suspended and the world is frozen while hidden. Acceptable.
- **`Bo` tap and bubble tap** both repeat the current prompt (`voiceLog` gains the same line as the bubble). This passes once P1-1 is fixed.

## Suite reliability
- Each group runs in fresh contexts, with storage seeded through `addInitScript` only on first load.
- Waits are state-based (`waitForFunction` on `DN.debug`), not fixed sleeps, wherever the game exposes state.
- The Play button pulses, so taps use the CDP touchscreen at its bounding-box centre instead of `locator.tap` (which waits for "stable").
- Multi-touch uses CDP `touchMove` with the lifted point left out; CDP `touchEnd` must carry no points.
- When the bot hands over to a real finger, the test calls `world.cancelDrag()` so a half-done bot drag cannot leave `held` stuck.
- Full run takes about 8 min. The bot group runs 5 sessions in parallel (about 95 s).
- **Touch-start retry:** about 6 full runs showed two intermittent cases where a drag did not grab, and neither reproduced in isolation. If a touchStart lands on a grabbable item but nothing is grabbed, the drag helper lifts and retries once. It only does this if a grab has already worked on that page, so a real input bug like P1-1 still fails. Each retry is logged to the console and to `results.json` → `flakeRetries`. The "drop on empty sky" check also dumps item, finger and Bo positions on failure.
