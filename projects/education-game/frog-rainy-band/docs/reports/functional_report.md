# Functional QA report: Bop's Rainy Band (2026-11-05)

**Test:** `node tests/e2e/functional.js` (all groups, about 4 min, `JOBS=3` by default). Run some groups with
`node tests/e2e/functional.js pick drum rotate`. Results go to `tests/out/functional/results.json` and screenshots to
the same folder. The process exits with 1 if any check fails.

**How it tests:** Playwright Chromium with `isMobile` and `hasTouch` on iPhone 393×852 @3, iPhone 852×393 @3,
iPad 820×1180 @2 and iPad 1180×820 @2. Every child or parent action uses **real touch**
(CDP `Input.dispatchTouchEvent`), including two-finger drumming. That covers the title, chips, gear hold, slider
drag, band members, big drum, Bop, bubble, snail, pause menu, Talk choices and the done screen. World calls are
used only for setup, such as fast-forwarding with the bot or `roundsPerLevel = 1` to reach Talk time quickly. An
event recorder wraps `world.drainEvents` to read the results. No game file was changed.

**Result:** 211 of 216 checks pass. The 5 failures are the game bugs listed below and are stable across 4 full
runs. There are **zero console errors and zero page errors** on every page in every group.

## What passed
| Group | Checked |
|---|---|
| boot (×4 devices) | Title screen appears and the loader goes away. Play and the gear are on screen, and Play is at least 64 px. Touching Play starts the game. Every member, the big drum and Bop are on screen, and no member sits under the HUD. The bubble shows the prompt. Touching the right member gives `play` and puts a note on the sheet. |
| lang | VI chip: `html lang=vi`, VI logo and a VI welcome line. EN chip switches back. The in-game bubble prompt changes from English to Vietnamese and is voiced with `lang: vi`. A language tap is saved. |
| gate | A 150 ms tap, a 1 s hold, and a hold that slides off the gear do **not** open settings. A 2.2 s hold does. Done returns to the title. |
| settings | Age chip 6, VI, typing the name "Mam" and a touch drag on the volume slider all apply right away. All four persist after a reload, including the restored audio volume. `?age=3&lang=en&speed&seed&level` apply for the session only. Storage keeps age 6 and vi even after a parent saves other settings under those flags. No flag keys are stored, and only `rb:` keys exist. |
| pick | An 80 px slide and a 0.9 s long press are not taps. A tap with a 10 px wobble still counts. A wrong tap gives a `wrong` event, adds nothing, keeps the ask open and says one gentle line with no negative words. A tap during the 0.6 s lock gives `locked`. A 2nd wrong tap gives `hint` (ghost hand plus glow). A right tap after that gives a note and removes the hand. The whole round finished by touch gives song events and `roundDone`, with 1 star for 2 misses. |
| poke | Touching Bop gives `pokeBop` and repeats the prompt word for word. Touching the bubble repeats the prompt. Touching the big drum during a pick ask gives a `boom` only. |
| drum (age 4, count chapter via `?level=`) | `answerId` is null and the stage drums are plain. n touches give `drumTap` 1..n, then `drumDone`, then a note. The count words ("One!", "Two!") are in `voiceLog` in order: voice.js logs every `say()` before it checks enabled or mute, so the log works with `?mute=1`. 2 taps on a band drum give a boom plus a big-drum hint. |
| listen | Bop plays n beats before the ask opens. There are 3 number drums and the right one shows n. Touching Bop gives `replayBeats` and n beats again. Touching the right number drum gives a note. The snail surprise works: touching it gives `snailTap` with no score change. |
| talk | Talk time opens with 2–5 choices. Touching the right choice gives `talkResult correct`, marks the choice and adds 1 star, then the next chapter starts. A wrong choice is gentle and the right one is marked. A 2nd tap after answering is ignored. On iPhone landscape every choice is fully on screen. |
| pause | Pause button: the world freezes and a touch behind the panel does nothing. Volume − ×2 and + update the settings, audio, label and storage. Resume runs the world again and repeats the prompt. `visibilitychange` to hidden pauses. Becoming visible again stays paused until Resume. A finger held across a background switch does not play. |
| rotate | A press cut by a rotation does not count. After portrait → landscape all members, the big drum and Bop are inside the screen and the right member is still tappable. Rotating back while a note is flying: the note still lands. On iPad, portrait → landscape stays inside the screen and tappable. |
| audio | The AudioContext is created on the first touch. The master, user, sfx, music and amb gains and a DynamicsCompressor exist. User gain = volume × 1.6. Volume −30 % gives a user gain of 1.12, and that persists across a reload. `?mute=1` sets the master gain to 0. |
| idle | 5 idle nudges then auto-pause. The 2nd idle gives an idle hint. Resume brings back the same open ask. |
| bot (ages 3–7, speed 8, EN/VI, 4 devices, in parallel) | Every session reaches `sessionDone` and the done screen, with 4 chapters each followed by Talk time. Stars are above 0 and match the done screen. There are 149–230 voice lines per session with no raw keys, braces or `undefined`, all in the session language (VI lines contain Vietnamese). URL flags are not saved. |
| extra | Two-hand drumming (overlapping fingers) gives 2 counts. Play again starts a new session with the HUD at 0 and the chapters rotated. Done → Home goes to the title. |

## Bugs

### P2: none found.
Every core path works on all 4 viewports with real touch: tap, slide, hint, drum, listen, Talk, pause, rotate,
persistence and full sessions. There are no crashes or errors.

### P3-1: Tapping the bubble in a listen ask does not replay the beats (DESIGN §5.2)
- **Repro:** `?mute=1&age=4&seed=<count seed>&level=<count level>`. Play to round 2 of the count chapter (a listen
  ask), wait more than 3 s, then tap the speech bubble. Only the prompt is spoken again. There is no
  `replayBeats` event and no beats. Tapping Bop does replay them.
- **Where:** `game/js/main.js:509` (`$('bubble').addEventListener('click', repeatPrompt)`) and `repeatPrompt` at
  `main.js:489-494`, which never calls `world.replayBeats()`.
- **Fix:** in `repeatPrompt`, if `world.prompt()` has `mode === 'listen'`, call `world.replayBeats()` (or route the
  bubble through the same path as `pokeBop`) before speaking.
- Check: `[listen] tap on the bubble in a listen ask → replayBeats`.

### P3-2: Music is no longer ducked after pause and resume during the song playback
- **Repro:** finish the last ask of a round. While phase is `song`, tap Pause and then Resume. `RB.Audio.songOn` is
  now `false` while `world.phase === 'song'`, so the music plays at full level (0.22 instead of 0.03) under the
  child's song for the rest of the playback.
- **Where:** `pause()` sets `RB.Audio.setSong(false)` (`main.js:166`), and `resume()` (`main.js:169-179`) never
  turns it back on.
- **Fix:** in `resume()`, add `if (world.state === 'round' && world.phase === 'song') RB.Audio.setSong(true);`.
- Check: `[extra] pause + resume during the song`.

### P3-3: The pause button cannot be reached during Talk time
- **Repro:** reach Talk time (any chapter end). The HUD pause button is still drawn top-right, dimmed, but the
  full-screen `#scrTalk` sits on top of it. The HUD has `z-index: 5` (`game/css/style.css:114`) and `.screen` has
  `z-index: 10` (`style.css:31`), so touches hit the Talk screen. A parent cannot pause or go Home during Talk.
  `pause()` itself accepts mode `talk` (`main.js:162`), so pausing in Talk was clearly meant to work. Talk only
  pauses itself after 4 re-asks of 12 s each.
- **Fix:** raise `#hud` above Talk while it is open (for example `#scrTalk:not(.hidden) ~ #hud`, or give `#hud`
  `z-index: 11`), or add a small pause button inside `.talk-panel`. Otherwise hide the HUD pause button in Talk
  so it doesn't look tappable.
- Check: `[extra] pause button usable during Talk time`.

### P3-4: `RB.debug.getState().askMode` is always wrong (hook, DESIGN §5.5)
- **Repro:** in any ask, `RB.debug.getState()` gives `{ ask: 0, askMode: 0 }`. On later asks it gives `undefined`.
- **Where:** `main.js:576`, `askMode: world.ask && world.ask.mode`. `world.ask` is the ask **index** (a number),
  not the ask object.
- **Fix:** `askMode: world._mode ? world._mode() : null` (or `(world._askObj() || {}).mode`). Note that
  `tests/e2e/smoke.js:32` has the same mistake (`w.ask && w.ask.mode === 'drum'`), so its "real touch tap" step
  can never handle a drum ask. That step only passes because seed 3 / age 4 starts with a pick ask.
- Check: `[extra] getState().askMode reports the ask mode`.

### P3-5: The pause-menu volume −/+ step is uneven from a 5 % slider value
- **Repro:** in settings, set the slider to 45 % (the slider has `step="5"`), start a game, Pause, then tap −. The
  volume becomes 40 %, not 35 %. From 45 %, + goes to 60 % (+15).
- **Where:** `main.js:519`, `Math.round((v + d) * 10) / 10` rounds to tenths, so 0.35 rounds to 0.4 and 0.55
  rounds to 0.6.
- **Fix:** `Math.round((v + d) * 20) / 20` (keep the 5 % grid), or `Math.max(0, Math.min(1, +(v + d).toFixed(2)))`.
- Check: `[extra] pause − from 45 % → 35 %`.

## Notes (not game bugs)
- Chromium's mobile **touch adjustment** snaps a tap that is near a button onto that button. In the first test
  version, a tap "behind" the pause panel landed on Home. The test now taps well outside the panel. Real iOS does
  something similar, so keep big gaps between the pause buttons and the game area (already true).
- The count chapter is not always in an age-4 session (`topicsFor` draws 3 of 4). The test picks a seed whose
  session contains `count` and reaches it with `?level=`.
- With `?autostart=1` the `level 0` event fires during boot, before any test hook can watch it. Tests should check
  `levelDone` instead.

## Lead follow-up (2026-11-05)
All 5 P3 bugs fixed (bubble tap replays the beats in a listen ask, song ducking restored on resume, HUD above Talk time,
`getState().askMode`, volume steps of 5 %). Playtest P1/P2 changes applied in `world.js` (round 2: beats wait for Bop's
prompt via `holdBeats`, drumQuiet/drumGuard/drumShortNudge, slower beats and song, more forgiving taps) and visual P1s
(note size, bubble/count card, Talk-time number cards). Re-run: unit 29/29, i18n 62 264 checks, smoke 3/3,
functional 211/211 (the rotate group was flaky once, then green twice).
