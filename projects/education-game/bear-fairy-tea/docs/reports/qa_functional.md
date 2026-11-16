# Functional QA: Moka's Fairy Tea Party (2026-11-16, report-only)

Suite: `node tests/qa/qa_functional.js`. It writes `tests/out/qa/results.json` and screenshots, and exits 1 on any failure.
Filters: `ONLY=<device>`, `TESTS=a,b`, `SKIP_SESSIONS=1`, `SESS_ONLY=1`, `PAR=n`.
Every finger is a real CDP `Input.dispatchTouchEvent`. Tests run in isMobile + hasTouch contexts on four screens: iPhone 393×852 @3, iPhone 852×393 @3, iPad 820×1180 @2 and iPad 1180×820 @2.

**Result:** the last full run passed 64 of 70 tests in 672 s. Afterwards I made `hammer_wrong` deterministic (it now runs the world at half speed). In that re-run it fails on 3 of 4 devices. It only passed in the full run because CPU load pushed some tap gaps over 1 s.
**Bugs:** 0 P0, 1 P1, 1 P2, 4 P3.

## What passed (beyond `tests/e2e/functional.js`)
- **Warm-up at age 4, 6 seeds:** chapter 1 is colours. Round 0 has 3 things: one object in two colours, exactly one of them odd. Hit radius is at least 0.6 × size + 14. Chapter-1 round sizes are 3, 3, 4, 4.
- **Wobbly taps:** an 18 logical-px wobble on the odd one counts as one right answer. An 18 px wobble on Moka pokes him. A 48 px slide off Moka does not.
- **Slides:** a press on empty space that slides onto the odd one within 0.25 s counts. A slide that starts 0.65 s after the press is not judged, and the press gives a soft sparkle.
- **Two fingers:** a resting finger plus a second finger on the odd one does not answer. A finger on a wrong thing plus a second finger on the odd one gives exactly one wrong. Two fingers in one touchstart (a palm) do not answer. Input is not stuck afterwards.
- **Rapid taps:** 6 fast taps on the odd one, then 6 on it while it rises, give exactly 1 right, 1 rise and 1 lantern. The round still scores 3★ with the full chime wave and 1 lantern lit.
- **Stars:** 0, 1, 2 and 3 misses give 3, 2, 1 and 1★. The same wrong thing tapped again after more than 1 s counts as a 2nd miss. An assisted round (6 soft presses, then a press in the table band) gets 2★ and `assisted: true`. With assist armed, a tap on Moka does not answer.
- **Taps that must not count:** taps on Moka (5 points in his box), the bubble, the HUD stars and the HUD dots count as nothing. They add no miss, no soft press and no "no progress".
- **Critters:** for each of ladybug, butterfly, snail and fairies, up to 10 taps at and around the centre (out to 0.8 × r) never give a right, a wrong or a miss.
- **Idle nudges:** they come at 12, 30, 57, 87 and 117 s after the ask, each repeating the prompt. The idle hint comes at 30 s and respects the cooldown. The game auto-pauses at 117 s.
- **Talk time, all 11 topics × EN/VI:** the question and choices are clean (VI has diacritics) and the question is spoken. A wrong pick gives a kind line, no star, and shows the right answer; a later tap on the right answer is ignored. The next chapter starts. A right pick gives +1★.
- **Talk re-asks:** at 12, 24 and 36 s. The answer glows from the 2nd re-ask. The question is spoken exactly 3 times and never after 36 s. Moka answers by himself at 38 s.
- **Pause and resume (fake `speechSynthesis`):** speech is cancelled and stays silent. No world time passes in 3 s. Resume says the prompt again. A pause during the rise still lets the round finish.
- **`visibilitychange`:** the game pauses, the AudioContext is suspended and speech is cancelled. It stays paused when the page comes back. Hiding during Talk pauses, and Resume returns to Talk.
- **Rotation** mid-fall, mid-rise, mid-chime and mid-Talk on all 4 devices:
  - things land on their re-laid placemats;
  - the rising thing reaches its moved lantern;
  - after a mid-chime rotation every friend still poofs;
  - Talk buttons stay on screen, at least 44 px, and still answer by tap.
- **Odd screen sizes:** 320×480, 480×320, 2400×600, 600×2000, 300×300 and 1366×1024. Nothing is outside the screen, covered by the DOM or overlapping, and a tap on the odd one answers.
- **Parent gate:** presses of 60, 400, 1200 and 1700 ms and `touchscreen.tap` do not open settings. A 2.3 s hold does.
- **Settings:** age, language, name ("Bông") and volume 35 % survive a reload, and the volume reaches the audio chain. URL flags (`?lang=en&age=7&speed=2`) are played but never stored, and every storage key starts with `ft:`.
- **Language toggle on the title:** every `[data-i18n]` text, the logo, tagline, age, document title and name placeholder change, and switching back to EN restores them exactly.
- **Audio chain:** compressor −18 dB, knee 12, ratio 4:1, 4 ms / 180 ms. Makeup gain is 1.6 × volume (0.96 at 60 %). The AudioContext is running after the Play tap.
- **Full sessions, ages 3–7 × EN/VI** (bot, speed 12, child's name set):
  - every session reaches the done screen, with 0 console errors, page errors or failed requests;
  - every ask prompt is in `FT.debug.voiceLog`, and no line is empty, a raw key, `undefined` or contains `{`;
  - the voice is in the right language;
  - session stars = round stars + Talk stars, matching the screen;
  - "Play again" starts a clean session: 0★, HUD 0, no lantern lit, no gallery, no Talk or done screen;
  - the chapter-1 topic rotates, within the age's pool.

## P0
None.

## P1

### P1-1: the game auto-pauses about 12 s after a returning child touches the screen
**Repro** (`TESTS=idle_after_touch`):
1. Start a round at age 4 and do not touch the screen through 4 idle nudges (≈ 87 s after the ask).
2. Tap the moss once, or tap a wrong thing.
3. Think for 12 s without touching.

**Expected:** a touch means somebody is there. The idle cycle restarts (12 → 18 → 27 → 30 s) and the auto-pause comes only after about 2 min without a touch.

**Actual:** 11.9 s after the touch the 5th `idle` event fires and `main.js` calls `pause()`. A child who is playing gets the Pause screen, which a toddler cannot read. After that, every single touch buys only 12 s more.

**Suspect:**
- `world.js` `P._touch` resets `_idleT` and `_idleGap` but not `_idleN`.
- `main.js` counts nudges in its own `idleSaid`, which is reset only on `round`, `ask` and `resume`. The `case 'idle'` branch pauses at `++idleSaid >= 5`.

**Fix:**
- In `P._touch` add `this._idleN = 0;`.
- In `main.js` drive the pause from the world's count: `case 'idle': if (e.n <= 4) speak(…); else if (!bot) pause();`, dropping `idleSaid`. Or reset `idleSaid = 0` in the `down` handler of `FT.Input.attach` whenever `world.pointerDown` returns non-null.
- Add a unit test: 4 idles, one touch, 12 s → no 5th idle with `n >= 5`.

## P2

### P2-1: hammering the same wrong thing never brings help (no hint, no assist, no idle nudge)
**Repro** (`TESTS=hammer_wrong`, deterministic at speed 0.5):
1. In a colours round at age 5, tap one matching (wrong) thing again and again, each tap less than 1 s after the last.

**Expected:** this is the most typical toddler behaviour. Rule: "after 2 misses the right target glows". The child should get the hint glow and ghost hand after the 2nd tap, or at least within a few seconds.

**Actual:** 24 taps over 6.6–7.7 s of world time give `misses 1`, `_noProg 1` and only `wiggle {repeat: true}` events. No `hint` ever comes. Idle nudges never fire either, because every press resets the idle timer. The child can stay stuck for as long as they keep tapping.

**Suspect:** `world.js` `P._wrong`. The same-thing branch (`time − m._lastWrongT < sameWrongWindow`) refreshes `m._lastWrongT` on every repeat (a sliding window) and returns before `_noProgress()`.

**Fix:**
- Do not slide the window: only set `_lastWrongT` on a counted miss, so a tap ≥ 1 s after the last counted miss counts again.
- And/or call `this._noProgress(false)` on every repeat wiggle, so the 3-press hint and 6-press assist rules apply. Alternatively, count `m._repeatN` and call `_autoHint(false)` on the 3rd repeat.
- Add a unit test: same thing every 0.4 s for 6 s → a `hint` arrives.

## P3

### P3-1: the bubble font shrinks to 12.3–13.4 CSS px on iPhones (long VI / EN prompts)
**Repro:** the session tests, iPhone 852×393 at ages 3 VI, 4 EN and 7 VI, and iPhone 393×852 at age 6 VI.
- "Đây là chữ G hoa và chữ g thường… và một chữ khác! Thẻ nào không phải chữ G hoa hay chữ g thường?" renders at 12.3 px.
- "Count the berries! Every plate has four berries… but one! Which plate does NOT have four berries?" renders at 13.3 px.

The text still fits (no overflow), but it is small for a parent reading along on a phone.

**Suspect:** `ui.js` `_fitBubble`, whose loop runs `while fs > 13` with ×0.92 steps, together with a small `layout.bubble.h` on phones.

**Fix:** keep a floor of 14 px and instead let the bubble grow, or use a shorter wording on phones. For example, use the short ask (no "…but one!" lead-in) when `layout.phone`, or reserve more `bubble.h` in `computeLayout` on phones.

### P3-2: a session can end without the child's name in any praise
**Repro:** in a full run, session age 4 VI on iPad portrait had name "Mầm" and 84 voice lines, none with the name. Other runs of the same config did include it.

**Expected:** rule "praise with the child's name".

**Actual:** `great`, `praise` and `session.done` pick uniformly among variants with and without `{child}`.

**Suspect:** `i18n.js`, where `CHILD_PREFERRED = { 'ui.welcome': 1 }`.

**Fix:** add `'great': 1, 'session.done': 1` (or prefer the `{child}` variants at least once per chapter).

### P3-3: the "tap = moved < 24 px" threshold is in logical px, so only ≈ 13 CSS pt on iPhone portrait
The view scale is 0.546 there. Only the Moka poke uses it (things are judged on contact).

**Repro:** a 15 CSS-px wobble on Moka on 393×852 → no `pokeMoka`.

**Fix:** in `world.js` `pointerUp`, compare against `max(cfg.tapMovePx, 24 / viewScale)`. Main can pass the scale, or `FT.Input` can measure in CSS px.

### P3-4: taps on a moving critter often land as `soft` presses, which count toward "no progress"
This affects the butterfly loop just after a tap, and a ladybug walking.

**Repro:** tap the reported `critterScreen()` circle while the butterfly is in `loop`. 2 of 10 taps gave `soft`, which feeds `_noProgress` (3 → hint, 6 → assist). It is not a miss, so it is minor.

**Fix:** in `world.js` `pointerUp`, skip `_noProgress` when the press was within about `1.5 × r` of the critter. Or give `_critterAt` a `+12 px` tolerance while the critter is moving.

## Notes / test-side caveats
- Speech texts in `voiceLog` are the spoken form ("…" → ",", "NOT" → "not"), so prompt comparisons must normalise.
- Headless timing: the quick-slide and hammering checks slow the world (`setSpeed(0.2)` and `setSpeed(0.5)`), because under 5 parallel pages a CDP touch sequence can take more than 0.25 s or 1 s of wall time.
