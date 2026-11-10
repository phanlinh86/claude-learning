# Functional QA report — Kiki's Camp Chimes (2026-11-10, re-run after the fairSwipe / per-round layout fixes)

Suite: `tests/e2e/functional.js` (rewritten for the chimes; it was the jigsaw suite). Playwright Chromium with `isMobile` +
`hasTouch` contexts. Every tap and swipe is a **real CDP touch sequence** (`Input.dispatchTouchEvent` → pointer events →
`CC.Input` → `World`). The world's full events are recorded by wrapping `world._emit` (`window.__ev`, with the world time
`_t`). Every line sent to the voice is recorded by wrapping `CC.Voice.say` and `CC.I18N.ask`. Screenshots and `results.json`
go to `tests/out/functional/`.

```
node tests/e2e/functional.js                              # everything (≈ 11–13 min): 4 devices + 10 bot sessions; exit 1 on any failure
ONLY=ipad-portrait node tests/e2e/functional.js           # one device, no bot sessions
TESTS=song_swipe,rotate_mid_round node tests/e2e/functional.js
SKIP_BOT=1 node tests/e2e/functional.js                   # no bot sessions
BOT_SPEED=10 BOT_PAR=4                                    # bot session speed / how many run at once (defaults)
```

**Result after the fixes: 96 / 96 passed in 679 s (exit 0). No P1 or P2 game bugs found.** The first run (before the
fixes) passed 88 / 88. The fixes were: fairSwipe "judge the core, brush the rim", layout per round, a beam press starts
the song, an assisted round gives ≤ 2 ★, and surprises come at 3–5 s. After them, two old tests failed because the tests
were written to the old rules. Both are updated and two new tests are added. The page logged no console errors, page
errors, failed requests or HTTP ≥ 400 responses in any test or session.

## Pass / fail

Devices: iPhone portrait 393×852 @3, iPhone landscape 852×393 @3, iPad portrait 820×1180 @2, iPad landscape 1180×820 @2.
The core tests run on all 4 devices. The extra tests run on the two portrait devices.

| test | what it proves | iP-port | iP-land | iPad-port | iPad-land |
|---|---|---|---|---|---|
| boot_title | boots with 0 errors; title, ≥ 44 px play button and gear on screen; Play → round, HUD shown | ✅ | ✅ | ✅ | ✅ |
| tap_right | real tap on the asked chime → judged `ring` + `right` + `lantern`; chime done, lantern 0 lit | ✅ | ✅ | ✅ | ✅ |
| tap_wrong | real tap on another chime → dull `ring` + `wrong`, misses 1, still in play (no fail state); the right chime still works; round gives 2 ★ | ✅ | ✅ | ✅ | ✅ |
| swipe_from_right | swipe that starts on the asked chime and runs through the farthest one → 1 judged ring (right), the others only `brush`, no `wrong`, 0 misses | ✅ | ✅ | ✅ | ✅ |
| swipe_from_sky | swipe from empty sky across every chime → `soft` first; ≤ 1 judged ring, every other ring is a brush. The judged chime is the **first body core (0.42 × size + 8) the straight path enters**, worked out from the geometry before the swipe and checked when the entry is clear by > 12 px. Every device checked it (slack 21–46 px: judged c0 = expected c0, asked c1 → `wrong`). Rim entries before it only brush. The sky press / rim brushes are not a miss; no hint | ✅ | ✅ | ✅ | ✅ |
| rim_tap (new) | press on the asked chime's **rim** (between core and hit circle, clear of the other chimes): while the finger is down only a `brush`; on release (moved < 24 px) → judged ring + `right`. A rim press on another chime that slides ≥ 40 px away into empty sky → brush only, never judged, 0 misses | ✅ | ✅ | ✅ | ✅ |
| tap_sky_soft | tap on empty sky (a point clear of `layout.keep` = bubble / HUD boxes, the band, Kiki and the chimes, on the bare canvas) (`soft kind sky`) and on the empty beam band (`soft kind beam`) → only soft (+ the designed hint on the 2nd no-progress), no ring, no miss | ✅ | ✅ | ✅ | ✅ |
| song_swipe | real swipe in song time → one `songNote` per chime in order 0…n−1, `songDone auto:false` | ✅ | ✅ | ✅ | ✅ |
| song_band_press (new) | a tap on the **empty beam band** in song time → the full cascade (one `songNote` per chime), `songDone auto:false`, no `soft` | ✅ | ✅ | ✅ | ✅ |
| rotate_mid_round | finger down on the sky, then rotate (viewport swap) → gesture cancelled (`world._g` null); the same finger dragged over every chime rings nothing; all chime bodies and hooks inside the screen; real tap works after; rotate back → still inside | ✅ | ✅ | ✅ | ✅ |
| rotate_swinging | hard swipe sets every chime swinging, rotate there and back; every settled frame checked: no body leaves the screen | ✅ | ✅ | ✅ | ✅ |
| surprise_hedgehog / _bird / _fireflies | surprise forced into round 1 (chapter 0 / 1 / 3); its tap circle is on the bare canvas, on screen, clear of every chime centre; every chime centre still hits its chime; real tap → `hedgehogTap` / `birdTap` / `fireflyTap`, no ring, no miss; the asked chime still rings right while it is there | ✅ | ✅ | ✅ | ✅ |
| two_misses_hint | age 5: a wrong tap and then a soft press → `hint` on the asked chime (after the 2nd, not the 1st), hint hand shown, misses 1, wrong + hint lines spoken, no assist | ✅ | – | ✅ | – |
| assist_young | age 4: 3 soft band presses → hint, then `assistArmed` on the asked chime; the next band press → `assist` + `right`; 0 misses; the assisted round ends with **≤ 2 ★** | ✅ | – | ✅ | – |
| count_strings | age 4 count chapter: tap the asked bell string → `right` with `count {n}`, exactly n `count` events (i = 1…n), the count run "One, … bells!" spoken | ✅ | – | ✅ | – |
| song_auto | no touch in song time → cascade 4.0 s (world time) after `songAsk`, `songDone auto:true` | ✅ | – | ✅ | – |
| kiki_repeat | real tap on Kiki (> 3 s after the ask) → `pokeKiki`, the prompt appears again in `CC.debug.voiceLog` (with `mute=1`); no ring, no soft, no miss. A tap on the bubble repeats it too and never reaches the canvas | ✅ | – | ✅ | – |
| talk_time_tap | Talk time reached (bot, then off): 2–3 picture choices, clean question text; tapping the right picture → +1 talkRight, +1 ★, `.right` mark; back to a round | ✅ | – | ✅ | – |
| pause_resume | pause button → paused, world time frozen; Resume → runs again and repeats the prompt | ✅ | – | ✅ | – |
| visibility_pause | `visibilitychange` (hidden) with a finger down → paused, gesture cancelled; the finger's later move over the asked chime rings nothing; pause screen stays; Resume → real tap is right | ✅ | – | ✅ | – |
| second_finger_ignored | finger 1 on the sky, finger 2 lands on the asked chime → nothing rings | ✅ | – | ✅ | – |
| language_switch | title VI: `lang=vi`, logo "Khỉ Kiki / Chuông Gió Lửa Trại", play "Chơi", VI document title; a round's bubble + voice are Vietnamese; the pause title is translated; back to EN via Home: logo / play / bubble in English | ✅ | – | ✅ | – |
| parent_gate | 120 ms tap, `page.touchscreen.tap`, a hold shorter than 2 s (the real hold time is measured in the page), and a hold that slides off the gear → no settings; 2.3 s hold → settings | ✅ | – | ✅ | – |
| settings_persist | age 6, VI, name "Mầm", volume 40, music + sfx off → only `cc:` keys in localStorage; after a reload all of it is applied and shown; `{child}` reaches the lines; `?age=3&lang=en&speed=2` applies but is never saved (settings changed while flags are active are saved, the flags are not); no speed left over after a reload | ✅ | – | ✅ | – |
| audio_chain_volume | after the Play gesture: ctx + master → compressor (threshold ≤ −12, ratio ≥ 2) → user gain 1.6; pause − ×3 → 70 %, user gain 1.12, saved; settings slider 30 % → user gain 0.48, saved; restored after a reload | ✅ | – | ✅ | – |
| release_over_hud | a swipe that starts on the asked chime and ends over the pause button → right, no pause; a tap on the HUD never reaches the canvas | ✅ | – | ✅ | – |
| url_age_shown | `?age=2 / 4.5 / 9` → plays 3 / 5 / 7 and the title shows the same | ✅ | – | ✅ | – |

**Full bot sessions** (`?bot=1&speed=10&autostart=1&mute=1`, run 4 at a time). Each one reaches the done screen. All
pass, with 0 errors. Every prompt built in the session reaches the voice and `CC.debug.voiceLog`, in the session's
language. **No spoken line contains a raw key, `{` / `}`, `undefined`, `NaN`, `null` or `[object`.** Vietnamese sessions
have diacritics in ≥ 90 % of lines; English sessions have none. After the session, Play again (odd ages) starts a new
session and Home (even ages) goes back to the title.

| age | lang | device | topics | rounds | right / wrong | songs (auto) | talks | prompts / voice lines |
|---|---|---|---|---|---|---|---|---|
| 3 | en | iP-port | colors/shapes/size/animals | 16 | 32 / 5 | 16 (3) | 4 | 32 / 116 |
| 3 | vi | iP-land | colors/shapes/size/animals | 16 | 32 / 5 | 16 (3) | 4 | 32 / 114 |
| 4 | en | iP-land | colors/shapes/count/animals | 16 | 44 / 9 | 16 (2) | 4 | 44 / 150 |
| 4 | vi | iPad-port | colors/shapes/count/animals | 16 | 44 / 5 | 16 (4) | 4 | 44 / 145 |
| 5 | en | iPad-port | shapes/count/letters/animals | 16 | 47 / 14 | 16 (2) | 4 | 47 / 160 |
| 5 | vi | iPad-land | shapes/count/letters/animals | 16 | 48 / 10 | 16 (1) | 4 | 48 / 159 |
| 6 | en | iPad-land | lower/initial/add/count | 16 | 52 / 16 | 16 (5) | 4 | 52 / 171 |
| 6 | vi | iP-port | lower/initial/add/count | 16 | 54 / 11 | 16 (3) | 4 | 54 / 171 |
| 7 | en | iP-port | initial/add/sub/oddeven | 16 | 52 / 15 | 16 (6) | 4 | 46 / 163 |
| 7 | vi | iP-land | initial/add/sub/oddeven | 16 | 52 / 7 | 16 (3) | 4 | 46 / 156 |

**Voice with `mute=1` at speed 1:** `voice.js` logs every line in `say()` (`logLine`, voice.js:287) *before* it checks
`enabled` / speed. `main.js` still calls `CC.Voice.say` when the voice is off (`voiceOn()` is false with `mute`). So
`CC.debug.voiceLog` (the same array as `CC.Voice.log`) holds every line even when muted or in test-speed mode. `kiki_repeat`
relies on this, and it works.

## Game bugs

No P1 or P2 bugs. Taps, swipes, judging, brushes, hints, assist, counting, song, Talk, pause, rotation, surprises,
settings, audio and both languages all work as `docs/DESIGN.md`, `docs/MECHANICS.md` §7 and `docs/VOICE.md` §1.1 describe.

### P3-1 (mostly fixed) Quick players at age 3 see the surprise only briefly
- **Before the fix** (spawn [3, 8] s after the first ask): in a bot session at age 3 (`?bot=1&speed=10&age=3&seed=23`),
  only 2 of the 4 surprise rounds showed their surprise. The night fireflies never came (at age 7 they did not come either).
- **After the fix** (`hedgehogAt / birdAt / firefliesAt: [3, 5]`, world.js:80-83): re-measured on ages 3, 4 and 7 with
  `world._emit` wrapped. **Every surprise round now spawns its surprise**, fireflies included. With a fast player at age 3
  the surprise round lasts 6.5–7.5 s, so the surprise is on screen ≈ 2–3 s before it leaves at the song. At ages 4 and 7
  it is on screen for 5–9 s. A typical 3-year-old (≈ 18 s rounds, MECHANICS §11) sees it for over 10 s.
- **Optional:** let a surprise that appeared less than 3 s before the song stay through the cascade.

### P3-2 The project's `CLAUDE.md` still describes the jigsaw game
- **Where:** `monkey-camp-chimes/CLAUDE.md` (title "Pom's Puzzle Town", storage prefix `pz:`, drag / magnet / tray rules,
  `puzzle_art.test.js` in the test command, script order with `puzzle_art`).
- **Effect:** none in the game. The code uses `cc:` (storage.js:5) and `chime_art.js`. A future agent that reads this
  file first (the repo rule) gets the wrong prefix, rules and test command.
- **Fix:** rewrite it for Kiki's Camp Chimes. Prefix `cc:`, tap / swipe judging rules, `chime_art.js`, and the test
  command `node tests/unit/run.js && node tests/unit/i18n_voice.test.js && node tests/e2e/smoke.js && node tests/e2e/functional.js`.

## Notes (not bugs; only the test was changed)
- **Re-run after the fixes:**
  - `swipe_from_sky` used the old rule ("the first hit circle touched is judged"). Under fairSwipe the path brushed c0's
    rim, then entered c0's core and judged it (`soft, ring~c0, ring!c0, wrong:c0`). That is correct, so the test now works
    out the first core along the path.
  - `tap_sky_soft` picked a point under the speech bubble's box (the DOM bubble could appear there). Soft points now
    avoid every `layout.keep` box.
- **Rotation transient:** for the ≈ 120 ms resize debounce (`main.js:172`, and 250 ms on `orientationchange`,
  `main.js:639`), the canvas still has the old layout. A frame checked in that window shows the chimes "outside" the new
  viewport. After `applySize` everything is inside. The test checks only settled frames (the view matches the window's
  orientation), and requires ≥ 10 of them.
- **World time under a slow frame rate:** `frame()` caps dt at 0.1 s (`main.js:556`). In a busy headless run (iPhone @3) the
  world ran at about half wall speed, so the 4 s auto-song took 8.2 s of wall time. `song_auto` measures world time.
  Real iPhones run at 60 fps.
- **Test bugs fixed during the run:**
  - The soft-tap test now allows the designed hint on the 2nd no-progress press.
  - `tapEl` now waits for the 0.32 s panel pop animation to finish before tapping (the Home tap missed during the scale-in).
  - The parent gate test now measures the real hold time in the page (CDP stretched a "1.2 s" hold past 2 s on a busy page).
  - The `{child}` check now samples several variants of `great`.
