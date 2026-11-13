# Functional QA — Bao's Bubble Sky (13 Nov 2026, report-only)

Tested commit `663f5af`. Playwright Chromium contexts with `isMobile` and `hasTouch`: iPhone 393×852 @3, 852×393 @3, iPad
820×1180 @2, 1180×820 @2. Every game tap was a real CDP `Input.dispatchTouchEvent` at `PB.debug.bubbleScreen(id)`. Buttons were
pressed with `page.touchscreen.tap`.

My suite is new and independent: `tests/qa/qa_functional.js`. Its output goes to `tests/qa/out/`, which is gitignored. It
replaces `speechSynthesis` with a fake engine. Each utterance "speaks" for 300 ms + 75 ms per character and records `end` or
`interrupted`, plus what cut it. That makes "lines not cut" something we can measure. The fake engine also exposes Samantha
(en-US) and Linh (vi-VN) voices.

```
node tests/qa/qa_functional.js dev <ip|ipl|pad|padl> <test,…|all>   # boot right wrong soft countpop countsel talk multitouch domtaps
                                                                  # visibility rotate voicelog perf title_lang gate persist audio
                                                                  # poke_during_count held_release_menu held_into_talk
node tests/qa/qa_functional.js bot <age> <en|vi> [speed]            # full bot session + Play again
node tests/qa/qa_functional.js live <age> <en|vi> <secs> [skill]    # real-time bot play, fake voice → which lines were cut, by what
```

## Summary
- **P1: none.** Nothing found that breaks the game or blocks a child.
- **P2: 2** (below).
- **P3: 7.**
- Existing `tests/e2e/functional.js`: 4 devices, 70 / 71 passed. The one failure was `iphone-landscape swipe_right`. It failed only
  while my suite was running at the same time. Run alone it passed 3 / 3. See P3-7.

## P2: wrong but playable

### P2-1. A press that starts on the canvas and is lifted after a screen opens "clicks" a button on that screen. It can answer Talk time or press Home.
- **Repro (Talk):**
  1. Use iPhone 393×852, `?seed=33&age=4&lang=en`, chapter `colors`.
  2. Play to the last round of chapter 0.
  3. During the `roundDone` / `out` phase, put a finger down where the first Talk choice will appear (CSS ≈ 83, 408) and hold it.
  4. Talk opens. Lift the finger 100 ms later.
- **Repro (Home):**
  1. During play, hold a finger on the sky where the pause menu's **Home** button will be.
  2. Pause the game while the finger is down: `btnPause.click()` here. On a device this is the visibility pause or the idle
     auto-pause after ~2 min.
  3. Lift the finger.
- **Tests:** `node tests/qa/qa_functional.js dev ip held_into_talk` (also with `HOLD_MS=100`) and `… held_release_menu`.
- **Observed:**
  - Talk: `talkResult {correct:false, choiceId:'c0'}`. The child hears "It is yellow! Good try!" and does not get the Talk star.
  - Pause: the mode goes to `title`, so the session is lost.
  - The event trace is `pointerdown:game … pointerup:btnHome, click:btnHome`. The same applies to whatever button sits under the
    finger: Resume, the volume row, and on the Done screen Play again or Home.
- **Expected:** a press that did not start on a screen never activates that screen's buttons.
- **Why it matters:** Talk opens automatically right after the last whoosh. That is exactly when a child is still tapping the
  leftover bubbles.
- **Suspected cause:**
  - `main.js` 472–482 (`openTalk`) and 177–185 (`pause`) call `inputCancel.cancel()`.
  - That leads to `input.js` 101–107 (`cancelActive` → `release()`), which drops pointer capture while the finger is still down.
    The pointerup and the synthesized click then land on the newly shown button.
  - The screen buttons act on `click` (`ui.js` 121; `main.js` 559–566).
- **Fix idea:**
  - Remember the pointerdown target per pointer. Ignore a screen button's click when that pointer went down outside the screen.
  - Or block screen-button clicks for about 400 ms after `PB.UI.only(…)` opens a screen.
- **Not verified:** whether iOS Safari dispatches the click the same way when touchstart and touchend hit different elements.
  Chromium does.

### P2-2. Tapping Bao during a countPop round cuts the count line ("One!").
- **Repro:**
  1. Use iPad 1180×820, `topic count, age 5, seed 8`. This gives countPop with k = 3.
  2. Wait more than 3 s after the prompt, until it has finished.
  3. Pop one target. Bao starts "One!".
  4. Tap Bao 200 ms later.
- **Test:** `VIA=bao node tests/qa/qa_functional.js dev padl poke_during_count`.
- **Observed:** utterances `["One! [interrupted]", "Let’s count bubbles! Pop 3 bubbles!"]`.
- **Expected:** VOICE §1.1 says "countPop counts … are queued + protected, never cut". The Bao tap should queue the question, or
  skip it while a count line plays.
- **Suspected cause:**
  - `main.js` 356–367 (`pokeBao`) only checks `lastSpoken === lastPromptText`. The round is still `interactive` after k − 1 pops.
  - It then calls `repeatPrompt()` (537–543), which runs `promptUntil = 0` followed by `speakPrompt(…, {interrupt: true})`.
  - A speech-bubble tap (`bubbleTap`, 544) takes the same path. My run of that variant passed only because the DOM tap landed
    after "One!" had already ended.
- **Fix:** in `pokeBao` and `bubbleTap`, don't interrupt while `!canInterrupt()` (the count or wrong line is protected). Queue
  the prompt instead.

## P3: polish
1. **A right pop cuts the prompt and the wrong line, which differs from VOICE §1.1.**
   - The real-time fake-voice runs (`live 4 en 105 0.6`, `live 3 vi 105 0.5`) produced 35 + 26 utterances, of which 14 + 11 were
     cut.
   - **Every cut came from the child's next answer:**
     - a right `pop` cut the prompt, the wrong line, or the previous right line;
     - a `talkResult` cut the Talk question.
   - Nothing else ever cut a line: no hint, praise, poke or system line. Nothing cut a count run.
   - `main.js` 287 lowers the guard on `right` on purpose. VOICE says feedback "interrupts unless the prompt is still protected
     (then queue)". This is reasonable (the child has already answered), but the doc and the code disagree. Pick one.
   - The bot answers after 1–2.6 s, faster than a real child (sims: 2.6 s of listening), so real cuts will be rarer.
2. **Audio over Nyquist on `party`.** `audio.js` 257: `bell(NOTE(84 + 24))` adds a 5.4× partial at 22 604 Hz. Every session end
   logs `warning: Oscillator.frequency.setValueAtTime value 22604.4 outside nominal range [-22050, 22050]` on a 44.1 kHz context.
   It is inaudible and gets clamped; iOS runs at 48 kHz. Fix: cap partials at `0.45 × ctx.sampleRate` in `bell` / `glass` /
   `kalimba`.
3. **Pausing during the chapter intro.** The chapter and season lines are stopped (`Voice.stop` in `pause`). Resume says nothing
   until the ask, because `resume()` (`main.js` 186–201) only re-says the prompt or the right line. Fix: re-say the chapter
   topic when `world.state === 'intro'`.
4. **Adaptive quality only goes down.** `main.js` 528–533 lowers `quality` after 1.5 s of slow frames and never raises it again.
   In headless Chromium it dropped to 0.52 (the floor) within seconds on iPad and 0.72 on iPhone. If the first seconds on a
   device are slow (asset decode, prewarm), the whole session renders soft. Suggest stepping back up after about 10 s of fast
   frames. Not verified on a device.
5. **`cleanName` keeps the text inside tags.** `ui.js` 9's comment says "tags removed WITH their content", but `"  An <b>x</b> "`
   is saved as `"An x"`. It is harmless (no markup survives); the comment or the regex should change.
6. **Two Talk questions were cut by their own answer.** "Talk time! What colour is this?" was cut by the tap answer. This is
   expected when the child answers early. It is listed only to complete the cut-line census.
7. **`tests/e2e/functional.js` `swipe_right` is load-sensitive.** The 0.25 s swipe window is world time, and under CPU contention
   the 5-step CDP swipe can take longer. This affects the test only, not the game.

## What passed
All four devices unless noted. "Bubble" means a real touch at its live position.

### Boot and title
- No console errors or page errors anywhere. The only warnings were autostart-only (no gesture) and P3-2.
- No missing assets, the loading screen hides, and the Play (≥ 60 px) and gear (≥ 44 px) buttons are on screen.

### Language switch
- EN ↔ VI on the title updates `html[lang]`, the logo, `document.title` ("Gấu Trúc Bảo …") and the age label ("Tuổi").
- The welcome line goes to the voice log in the new language only.
- Utterances get `vi-VN` with **Linh**, and `en-US` with Samantha.

### Parent gate
- Presses of 60, 400 and 1500 ms do not open settings.
- Four 700 ms presses in a row do not add up.
- A 2.2 s hold opens settings.

### Settings persistence
- Age 5, VI, name and volume 60 % survive a reload. All storage keys start with `pb:`.
- `?lang=en&age=7&speed=2&seed=9&mute=1` is applied (title shows 7 and EN) and never saved, even after the pause +/+ changed the
  volume to 80 % (that change *was* saved).
- After reloading without the flags, it is back to 5 / VI / 80.

### Right tap
- Events: `right`, `pop`, `fly`, `paint`. There is no wrong / soft event and no miss.
- The right line names the colour.

### Wrong tap
- `wrong`, and the bubble stays `float` with a visible wob / wiggle and no pop.
- The kind line names the tapped colour and has no negative words.
- The same bubble again 0.5 s later at real speed is `squish {repeat}`, with misses still 1.
- A 2nd miss (another bubble, more than 1 s later) brings `hint` on a target: `hintHand` on, and only targets glow.

### Empty sky
- `soft` and mini bubbles, no miss, no line.

### Counting rounds
- countPop: three quick pops within about 1 s give `right.count` 1, 2, 3. "One!" / "Two!" / "Three! Three bubbles!" are all
  spoken in full, none cut.
- countSel: `count` events equal the number of stars, and the "… stars!" run is spoken in full.

### Talk time
- Answered by tap, both right (+1 star, `.right` mark) and wrong (no star, a kind line, the right answer marked).
- A second tap after answering is ignored, the canvas never receives the tap, and play continues.

### Multi-finger
- Two fingers landing together: only the first is judged.
- A palm resting on the sky plus a finger on a target: not judged.
- After lifting, the next tap works.

### DOM taps
- Taps on the speech bubble, HUD stars and HUD dots never reach the canvas.
- Pause button: pauses, world time frozen, nothing reaches the canvas.
- Resume repeats the prompt (the voice log matches the bubble text).

### visibilitychange
- Pauses while speaking.
- `AudioContext` goes to `suspended`.
- `speechSynthesis.speaking` and `Voice.isSpeaking()` become false.
- The gesture is cancelled.
- Showing the page again stays paused; Resume sets the context back to `running`.

### Rotation mid-round
- A finger held during the rotation is cancelled; sliding over every bubble afterwards judges nothing.
- No NaN over 1.2 s of 100 ms samples, and no NaN in events.
- Every floating bubble is inside the screen after rotating and after rotating back, including mid-flight.
- A tap after rotation is judged right.

### Voice log
- VI round (shapes, age 5): every line is `vi`, Vietnamese, no raw `{`, `undefined` or `NaN`, and no negative words.
- Bot sessions EN: no Vietnamese characters in any EN line.

### Full bot sessions (speed 12, skill 0.7)
Ages 3–7 × EN / VI, 10 runs, all 4 device shapes. All finished and **Play again** started session 2.

| age | topics | rounds | right / wrong / hints | Talk right |
|---|---|---|---|---|
| 3 | colors / shapes / size / animals | 16 | 24 / 7–10 / 2–3 | 1 / 4 |
| 4 | colors / shapes / count / animals | 16 | 29 / 7 / 1 | 2 / 4 |
| 5 | shapes / count / letters / animals | 16 | 33 / 11–13 / 3 | 1–2 / 4 |
| 6 | lower / initial / add / count | 16 | 39 / 10–11 / 2 | 3–4 / 4 |
| 7 | initial / add / sub / oddeven | 16 | 32 / 17 / 5 | 2 / 4 |

Every run also had 68–85 lines, all in the right language, with no raw keys, `undefined` or NaN.

### Audio chain
- After the Play tap: `ctx` running, compressor −18 / 12 / 4:1 / 4 ms / 180 ms, user gain 1.6 (makeup).
- Pause −: 12 taps floor at 0 % (gain 0, label "0%"). +: 13 taps cap at 100 % (gain 1.6).
- After − − (80 %) the next utterance has `volume 0.8`. The volume is saved.

### Performance
- iPad 1180×820 @2: `render.draw` costs 0.4 ms CPU per frame and `world.update` 0.01 ms.
- Median rAF interval was 16.7 ms on all devices; p95 was 33 ms (50 ms on iPhone portrait while another suite ran).
- Headless frame pacing is not representative of a real GPU; see P3-4 for the quality step-down.

### Existing `tests/e2e/functional.js`
- iPhone portrait 24 / 24 (with the extras), iPad portrait 24 / 24, iPad landscape 11 / 11, iPhone landscape 10 / 11 (P3-7).

## Not verified
- Real iOS TTS timing and voices.
- Whether a click in P2-1 fires on iOS Safari when touchstart and touchend hit different elements.
- Speech recognition.
- Real-GPU frame times.
