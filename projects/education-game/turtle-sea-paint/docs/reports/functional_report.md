# Functional QA report — Nini's Sea Painting (2026-11-07)

Tester: functional QA agent (report only, `game/` untouched). Every child action uses **real CDP touch events**
(`Input.dispatchTouchEvent`) in `isMobile` + `hasTouch` contexts: iPhone 393×852 @3 / 852×393 @3, iPad 820×1180 @2 /
1180×820 @2. `SP.debug` is only used to read state, to jump to a chapter topic, or to force a surprise.

New suite: `tests/e2e/qa_functional.js` (17 groups, 454 checks, exits 1 on any FAIL; results in
`tests/out/qa_functional/results.json`). Run one group: `node tests/e2e/qa_functional.js layout talk`.

## Summary

| suite | result |
|---|---|
| `node tests/unit/run.js` | **PASS** 30/30 (42 s) |
| `node tests/unit/i18n_voice.test.js` | **PASS** 19 775 / 0 |
| `node tests/unit/pictures.test.js` | **PASS** |
| `node tests/e2e/smoke.js` | **PASS** (3 devices, bot ages 3–7) |
| `node tests/e2e/functional.js` (existing) | **PASS** 65/65 |
| `node tests/e2e/qa_functional.js` (new) | **449/454**: 5 FAIL = the 2 bugs below |

| group (qa_functional) | what is covered | result |
|---|---|---|
| layout | 4 viewports × 11 topics (age 4: colours, shapes, size, animals, count · age 7: letters, lower, initial, add, sub, odd/even) × round 0 and round 2: every shell and part tap point is on screen, not under the HUD or bubble, and `elementFromPoint` is the canvas. Same for Nini. Real tap on Play | PASS 192/192 |
| lang | title EN→VI chip by touch → title, bubble prompt and every voice-log line in VI. Back to EN through the settings switch → EN everywhere, both switches agree | PASS |
| gate | short tap on ⚙ and a 1 s hold do not open settings, a 2 s hold does (iPhone P, iPad L) | PASS |
| persist | touch: age 6, VI, name "Mai", volume slider tap, 4 toggles → all survive a reload. `?age=3&lang=en` applied but never written (raw `sp:settings` keeps 6/vi). Only `sp:` keys | PASS |
| colors (EN ×2, VI) | needPaint before picking (not a miss, line names the colour). Wrong shell → `wrong{color}` + a line naming both colours (EN and VI). Right shell → pick + follow-up ask. Another shell after the right one → `notThis{shell}` (no miss, brush keeps its paint). Another part → `notThis` (no miss, not painted). Right part fills with the colour | PASS |
| parts | shapes / animals / size: wrong part → `wrong{part}` + a line naming what was tapped and the goal. Right part paints, and the round finishes by touch | PASS |
| count | N + spares. Re-tap a painted spot → `already` (not a miss). Paints counted 1..N, "One! … Ten!" spoken, the spare spot is not painted after N | PASS |
| help | hint after 2 misses (event, shell glow, ghost hand), idle nudge repeats the prompt, Nini tap repeats the prompt word for word (`novoice`). **Nini tap with voice ON** | **2 FAIL**: bug P2-1 |
| drag | 60 px drag does not paint, an 8 px wobble still paints, a fast tapper (shell → part 100 ms apart) paints | PASS |
| multi | a second finger on a shell is ignored. With finger 1 on the right shell and finger 2 on a wrong shell, only the pick counts | PASS |
| talk | iPhone L, iPad P: right tap → +1 star, wrong tap → kind line with no star, a second tap is ignored, Talk time is left. All choices on screen (also all 11 topics × 4 viewports in VI, checked separately) | PASS |
| pause | ⏸ pauses (world frozen, taps don't reach the world). Resume. `visibilitychange` hidden → paused and stays paused until Resume. Pause and resume inside Talk time | PASS |
| rotate | iPhone P→L and iPad L→P, rotating mid brush flight and mid fill: layout re-flows, fill completes, brush back at rest, every point still tappable, round finishes by touch | PASS |
| surprise | fishy and pearl on 4 viewports: tap point on screen, real tap → `fishyTap` / `pearlTap`, stars, misses and HUD unchanged | PASS |
| fishysteal | tap on an unpainted count spot while the fishy swims over it | **3 FAIL**: bug P2-2 |
| audio | chain sfx/music → master → compressor → user gain. − − → 80 % (user gain 1.28). Volume persists across reload and shows in the pause menu | PASS |
| bots | `?speed=8&bot=1`, ages 3, 4, 5, 6, 7 × EN, VI → sessionDone (16 rounds, 4 talks each). Stars only go up (100 ms sampler on HUD and world). sessionDone stars = world = HUD = done panel. Voice lines clean and in the right language. 0 console errors | PASS 50/50 |

Exploratory checks, all OK: settings, pause and done panels fit and are tappable on all 4 viewports. Rotating while paused
then resuming works. "Play again" resets the HUD to 0 with no stray star bumps. With sound, music and voice off the gains
are 0 and the voice is disabled. Zero console or page errors in every run.

## Bugs

### P2-1: Tapping Nini never repeats the prompt when the speech engine does not start the utterance
- **Repro:** open `game/?seed=9&age=4` (voice ON, no `novoice`, no `mute`) in a browser where `speechSynthesis` exists but
  never fires `onstart`. Headless Chromium does this (0 voices). On real devices the same happens when the language has
  no voice, the utterance is dropped (queue `MAXQ`, `stale`, flushed by an interrupt), or `speechSynthesis` is missing.
  Tap Play, wait for the prompt, wait > 3 s, tap Nini. `pokeNini` fires, but nothing is said and no voice-log line is added.
  It stays like this for the whole step. Tapping the bubble does repeat it. (Test:
  `qa_functional.js help` → "voice on, TTS silent".)
- **Cause:** `game/js/main.js:311`: `if (performance.now() - promptStart > 3000 && !pendingPrompt) repeatPrompt();`.
  `pendingPrompt` is set in `speakPrompt` (l.128) and only cleared by `onVoiceStart` (l.134), by a `paint` (l.285), or
  when voice is off (l.131). If the utterance never starts, `pendingPrompt` stays set, so every Nini tap is dropped. The
  next prompt that also fails to start keeps it stuck. Nini also flaps her mouth (`world._pokeNini` → mood `talk`) with
  no sound.
- **Fix:** clear the flag when the line ends without being spoken:
  `SP.Voice.say(...)` already returns a promise → in `speakPrompt`: `const p = speak(txt, opt);` and make `speak` return
  `SP.Voice.say(...)`, then `p && p.then(r => { if (!r || !r.spoken) { if (pendingPrompt === txt) pendingPrompt = null; } })`.
  Also add a time limit: in the `pokeNini` case use
  `const stuck = pendingPrompt && performance.now() - promptStart > 6000; if (performance.now() - promptStart > 3000 && (!pendingPrompt || stuck)) repeatPrompt();`.

### P2-2: The swimming fishy swallows a right tap on a picture part under it
- **Repro:** iPad L / iPhone L / iPad P, age 4, a count chapter whose surprise round is the fishy
  (`qa_functional.js fishysteal`). In landscape the fishy lane is `canvas.y + 0.13·canvas.h` (over the top of the
  picture). When the fish is over an unpainted target spot, tap that spot. Result: `fishyTap` only. The spot is not
  painted and the count does not go up. A child counting "3 bubbles" loses a count and Nini giggles instead. It also
  happens with colours/shapes parts in the top 20 % of the picture.
- **Cause:** `game/js/world.js:492–493`: `pointerDown` checks `fishyHit()` before anything else and handles the press
  at once. The lane comes from `world.js:209`.
- **Fix (either one):** (a) in `pointerDown`, while `this.interactive`, first hit-test the picture
  (`SP.Pictures.hit(this.picture, q.x, q.y, this.cfg.hitPad)`). If it is an unpainted part that the current step wants
  (`stepInfo.targets` contains it, and for pickColor/pickTap the brush is loaded), skip the fishy and start a normal press.
  (b) Move the landscape lane into the water band above the canvas
  (`fishY = Math.max(bubble.y + bubble.h + 0.4·fishyH, canvas.y − F − 0.38·fishyW)`), or keep the fish's tap circle
  off the picture box. (a) is the smaller change and keeps the look.

### P3 notes (not blocking)
- **P3-1:** a press longer than 0.6 s, or a move of 40 logical px (≈ 22 pt on iPhone), does nothing at all: no sound, no
  wobble. A toddler who presses and holds gets no feedback. Suggestion: on such a release over the right shell or part,
  play the soft sound and give the part a small wobble (`world.js:507`), without painting.
- **P3-2:** tapping Nini within 3 s of a prompt plays the click and flaps Nini's mouth but says nothing
  (`main.js:311` + `world.js:553`). Set Nini's mood only when the prompt is actually repeated.
- Test-infra note: under heavy CPU load, CDP `touchEnd` can arrive up to about 1 s late. The gate test therefore
  measures the hold length the page saw (`hold()` in qa_functional.js) instead of trusting `sleep`.
