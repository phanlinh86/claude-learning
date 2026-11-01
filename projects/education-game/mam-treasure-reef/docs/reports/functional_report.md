# Mầm's Treasure Reef — Functional QA report

Date: 2026-11-01 · Suite: `tests/e2e/functional.js` (Playwright + Chromium, mobile contexts `isMobile + hasTouch`) ·
Run: `node tests/e2e/functional.js` → **328 / 330 checks passed in 520 s**, exit 1 (one real defect, seen on both devices it
was run on). Results: `tests/out/functional/results.json`, screenshots `tests/out/functional/*.png`, log `run.log`.

Every finger in the suite is a real touch: CDP `Input.dispatchTouchEvent` (touchStart / ≥ 8 touchMoves / touchEnd → Chromium
pointer events through `TR.Input`) or `page.touchscreen.tap`. The bot is used only to fast-forward and is switched off
*deterministically* by a page-side hook that wraps `TR.debug.world.drainEvents` (it also records every event into
`window.__events`; `window.__stopOn(e)` turns the bot off and the speed to 1 the moment a chosen event is drained).
URL flags on every page: `?mute=1&profile=test&seed=N` (+ `age=`, `lang=` where noted) — progress stays in memory.

Devices: **iPhone P** 393×852 @3 · **iPhone L** 852×393 @3 · **iPad P** 820×1180 @2 · **iPad L** 1180×820 @2.

## 1. PASS / FAIL matrix (checks per group × device)

| # | Check group (what was proven) | iPhone P | iPhone L | iPad P | iPad L |
|---|---|---|---|---|---|
| 1 | Boot, zero console errors, title, EN↔VI toggle (logo / tagline / `document.title`), gear: short tap and 0.9 s hold do **not** open settings, 2.3 s hold does, Done → title | 11/11 | 11/11 | 11/11 | 11/11 |
| 2 | Profiles: default "Mầm" (age 4, turtle), 1 profile → Play goes straight to the map, gate → "+ new player" → Anna / "" / 5 → Save, Play shows the picker, Anna's card opens the map as Anna, max 4 (5th `create` → null, "+" hidden) | 11/11 | – | – | 11/11 |
| 3 | Reef map: 1 unlocked, 2–6 locked (locked tap stays on the map), bot finishes lagoon 1 → `lagoons[1].done`, stars persisted = `sessionDone.stars` (0..52), lagoon 2 unlocked / 3 locked, resume cleared, trophy on the done screen and badge, "Next lagoon" → lagoon 2, Treasure Room shows 1 lit trophy of 6 | 11/11 | 11/11 | 11/11 | 11/11 |
| 4 | Resume: chapter 1 by bot → `resume {1,1}`, real Pause → "Map" → map with resume bar → tap continues at chapter 2 (`world.level 1`, stars kept); badge 1 also continues at chapter 2; **pause during the chapter-end dance** | – | **7/8** | **7/8** | – |
| 5 | Drag chapter (lagoon 2 ch. 1, 3 chests): treasure follows the finger; correct drop 60 px above the opening → grab/drop/correct/land/sparkle, `chest.count` 0→1; wrong chest → `wrong`, item back home; quick tap (100 ms, 3 px) → `tap` only; release in empty space → `miss`, floats home; nothing held after | 9/9 | 9/9 | 9/9 | 9/9 |
| 6 | Dig chapter (lagoon 1 ch. 1, seed 3): wrong mound → `dig{correct:false}` + `wrong`, `peek` then `buried` again ≤ 1.5 s; 2nd wrong → `hint` on `targetMound()`, `glow > 0`, `roundMistakes 2`; finger moving > 24 px does nothing; target tap → `dig{correct:true}`, item hops into the chest, mound `open`; round 2 reached by real taps; crab mound → `crab`, no `wrong`, `roundMistakes` unchanged | 11/11 | 11/11 | 11/11 | 11/11 |
| 7 | Count rounds: dig pearls (age 4, lagoon 3 ch. 1, long chest, need N) completed by N real taps with `count 1..N` + `roundDone`; drag pearls (age 5, lagoon 2 ch. 1) completed by N real drags into the long chest | 3/3 (dig) | 3/3 (drag) | 3/3 (drag) | 3/3 (dig) |
| 8 | Talk time (bot stopped on the `talk` event): choices = `talk.choices`; tap `[data-id=answerId]` → `talkResult correct`, button `.right`; chapter 2 wrong tap → `talkResult false`, `.wrongpick` + answer `.right`; 2nd answer ignored | 5/5 | – | – | 5/5 |
| 9 | Pause / Resume / Home buttons; `visibilitychange` (hidden) → paused and stays paused; volume −/+ steps of 10, clamps 0 and 100, meter 0 %; `tr:settings` stores `volume`, never `lang` from `?lang=vi` nor `mute/profile/seed`; slider 65 + music off survive a reload; only `tr:` keys, no `tr:progress` with `?profile=test`; language chip saves `lang` | 16/16 (iPhone P) | – | – | – |
| 10 | Rotation mid-round (viewport swapped): a held treasure is cancelled cleanly (`held null`, no `drag` state), all treasures / chests / mounds inside the viewport, a correct drag / mound tap still works after rotating, rotating back valid, no console errors | 9/9 | 9/9 | 9/9 | 9/9 |
| 11 | Full bot sessions, ages 3–7 × lagoons 1 and 6, speed 8 (`lang=vi` for lagoon 6): finish in 37–43 s, zero console errors, stars 52/52 within 0..52 and = profile total, pearls monotonic over 66–85 `pearl` events and profile pearls = `sessionDone.pearls`, chapters alternate dig/drag | – | 25/25 (5 sessions) | 25/25 (5 sessions) | – |

Zero console errors / page errors on every page of every group.

## 2. Failures

### F1 — P3 · Pausing during Tutu's chapter-end dance and leaving to the map loses the finished chapter
*Devices:* iPhone L, iPad P (code path is device-independent). *Check:* `[resume] pause during the chapter-end dance keeps resume at the NEXT chapter`.

**Reproduce** (`?mute=1&profile=test&seed=4`):
1. `TR.debug.setBot(true,1); setSpeed(8); startGame(1)`; let the bot finish chapter 2's Talk time. When the `levelDone {level:1}` event
   is drained, stop the bot (`world.state === 'levelDone'`, Tutu is dancing, 2 s window).
2. Tap **Pause** (or background the app — `visibilitychange` also calls `pause()`), then **Map**.
3. `TR.debug.profile.resume`.

**Expected:** `{ lagoon:1, level:2 }` (chapter 3) — `main.js onEvent('levelDone')` had just written `setResume(level + 1)` and
`Progress.recordChapter` recorded the stars for chapter 2.
**Actual:** `{"lagoon":1,"level":1,"levelStars":[13,13,0,0],"pearls":90}` — `saveResume()` (called by `btnMap` / `btnHome`)
overwrites it with `world.level`, which still equals the finished chapter until `World.update` runs `startLevel(level+1)` after
`cfg.levelDoneTime` (2 s). The resume bar then says "Chapter 2" and the child replays a chapter she just finished (stars never
go down, so nothing is lost but time; a quick/bored child may notice).
Event log excerpt at the moment of the pause: `… talkResult{correct:true} → levelDone{level:1, stars:13, mech:'drag'} → pearl{n:10,total:90}` → pause → map.
**Fix hint:** in `saveResume()` use `world.state === 'levelDone' ? world.level + 1 : world.level` (and drop the resume when that
would exceed chapter 4), or simply skip `setResume` when `world.state === 'levelDone'` since the `levelDone` handler already saved the
right one.

## 3. Notes and observations (no failure)
- The crab test relies on `seed=3`: round 2 of lagoon 1 chapter 1 (age 4) has a crab mound (`round.crab = 'm2'`) on every viewport
  tested; a headless scan (`tests/unit/load.js`) shows seeds 3, 6, 9, 11, 14, 15, 18, 19, 21, 23, 26 also have one in round 2.
- Drag count rounds keep `need` on the long chest (`baskets[0].need`), not on `cur.need` (that is dig-count only) — documented in
  MECHANICS §1; the suite handles both.
- The gear's `click` handler only shows the "Hold for parents" tip; a 0.9 s hold and a short tap both leave the title untouched.
- Rotation while a finger holds a treasure cancels via `applySize → world.cancelDrag()` and the item floats home (`miss` return
  animation, no `miss` event); the still-down finger's later `touchEnd` is ignored (`held === null`) — clean.
- `?profile=test` never writes `tr:progress`; `tr:settings` is written on volume / toggle / language-chip changes only, and the
  `?lang=` override is never persisted (`lang` in storage stays whatever the user last chose).
- Runtime: ~8.7 min for the full suite (map group plays 4 full lagoons, bot group 10 sessions, 5 in parallel). Groups can be run
  alone: `node tests/e2e/functional.js dig rotate`.

## 4. For the lead
1. **F1 (P3)** — `game/js/main.js saveResume()`: do not overwrite the resume with `world.level` while `world.state === 'levelDone'`
   (see fix hint above). After the fix the `[resume] pause during the chapter-end dance …` checks will pass and the suite exits 0.
