# Functional QA — Kitten's Balloon Farm (2026-11-01)

Suite: `node tests/e2e/functional.js [group …]` (Playwright Chromium, `isMobile` + `hasTouch` contexts: iPhone 393×852 @3,
852×393 @3, iPad 820×1180 and 1180×820 @2). All game input is REAL touch: `page.touchscreen.tap` at
`KB.debug.balloonScreen(id)` and raw CDP `Input.dispatchTouchEvent` (parent-gate holds, two fingers, touchcancel).
Results: `tests/out/functional/results.json`, screenshots on failure in `tests/out/functional/`. Full run takes about 12 min
(the bot group is about 4 min). The suite exits 1 while any check fails.

## Result: 339 / 343 checks pass. 4 fail, and all 4 come from the 2 game bugs below.

| group | pass | fail | covers |
|---|---|---|---|
| boot | 24 | 0 | 4 viewports: title, loader gone, Play ≥ 60 px on screen, short side 720, no horizontal scroll, Play by touch, zero console errors / HTTP errors |
| lang | 8 | 0 | EN → VI chip updates logo, `document.title`, `<html lang>`, tagline, age, gear tip, VI welcome line; persists across reload; `?lang=vi` prompt in VI |
| gate | 7 | 0 | short tap, 1 s hold and a hold that slides away do NOT open settings; progress ring; a 2.3 s real-touch hold opens settings |
| settings | 12 | **2** | age / name "Mầm" / music / lang saved in `kb:settings` and restored after reload; `?lang=vi&age=6` never saved (also not when another setting is saved) |
| tap | 52 | 0 | ×4 viewports: empty sky (reaches the world, pops nothing), wrong → `wrong` event only, balloon stays/squashes and is back home in under 30 px, names the target; right → `correct` at touch-down + `pop` 40–400 ms later; the round ends; no NaN |
| stars | 9 | 0 | 0 / 1 / 2 / 3 mistakes → 3 / 2 / 1 / 1 stars, hint on the 2nd wrong tap, a double tap within the cooldown counts once, HUD total = 7 |
| count | 20 | 0 | age 4 chapter 3: `sign.filled` 1..N on every pop, `correct.n/need`, exactly N pops solve the round and the extras fly away, no (N+1)th pop, roundDone count = need |
| ask | 19 | **2** | target = queue[0], wrong animal → `wrong` with the target unchanged, pops in queue order, one `ask` per target, the bubble follows, 2 stars, all friends land, no NaN |
| multi | 5 | 0 | a 2nd finger on the right balloon is ignored (sequential and in one touchStart); a later single tap pops; taps work after touchcancel |
| repeat | 10 | 0 | no mute, speed 1 (headless: TTS supported, 0 voices, so the checks use `voiceLog`): tapping Miu, the bubble or the sign repeats the prompt (+1 line each, clean text, no pop); 8 rapid taps cause no errors; voice is off at speed > 1 |
| talk | 19 | 0 | right answer by tap (+1 star, marked, the 2nd tap ignored, does not reach the canvas); re-ask every 12.0 s of game time, no glow after the 1st re-ask, only the right answer glows after the 2nd; wrong answer (no star lost, both buttons marked, the game goes on); 5 silent re-asks → only 3 spoken, still waiting |
| pause | 15 | 0 | HUD ⏸ → pause (world frozen, the tap does not reach the canvas), Resume, `visibilitychange` → pause and stays paused when the page is visible again, Home → title → Play, pause and resume inside Talk time |
| rotate | 63 | 0 | P→L and L→P on iPhone and iPad, colours and count chapters, mid-round: same round/pops, balloons inside the screen, homes inside `layout.play`, settled in the band, real taps finish the round, HUD and bubble on screen; rotate during the rise and during a friend's fall |
| hud | 3 | 0 | taps on the HUD stars, dots and bubble never reach `world.pointerDown`; no balloon home under the HUD |
| bot | 73 | 0 | full sessions at bot skill 0.75 and speed 8, ages 3/4/5/6/7 × EN/VI over all 4 viewports: done screen, 4 chapters, no NaN, all bubble/voice text clean, VI done title, stars ≤ 52 = done screen; Play again (touch) gives a fresh session where real taps work (ages 4 and 7) |

Bot sessions: 17–23 s wall clock each at speed 8, 37–51 stars. Topics per age match `KB.AGE_TOPICS`.

Test bugs found and fixed in the suite: the per-round event window in `ask` (the first `ask` event fired before the clear), and
re-ask timing now uses world time, not wall clock. In `rotate`, the warm-up round has only one target, so the suite makes a
gentle wrong tap instead of popping it.

## Game bugs

1. **P2: tall portrait phone: the round ends (stars, "Great!") while the last animal friend is still in the air.**
   `game/js/world.js:32` `roundEndFriendWait: 3.0` (used at `world.js:630`). On iPhone portrait (logical 720×1561) a friend
   needs up to **4.4 s** from the pop to the grass (iPad portrait 720×1036: 3.5 s; landscape: 2.1 s). This is because of
   terminal speed 222 px/s over a ~900 px fall. A headless probe (39 seeds, age 3 animals chapter, instant taps) found a
   friend still falling at roundDone in **137 / 156 rounds on 720×1561** and 22 / 156 on 720×1036 (0 in landscape). The
   e2e `ask` checks fail on iPhone portrait in both rounds. The friend does land before the fade (1.6 s into roundDone), so
   nothing is lost, but the stars fly and Miu cheers over a falling animal. The new round's `_beginRound` also cuts the
   landing bounce short.
   Repro: `?mute=1&seed=41&age=4` on 393×852, play to chapter 4, then pop the animals quickly. At `roundDone`, `world.friends`
   still has one with `state:'fall'`.
   Fix (pick one): (a) set `roundEndFriendWait: 5.0`. (b) Better feel: scale the fall to the drop height so every friend
   lands in ≈ 2 s. In the friend spawn, set `f.vt = Math.max(cfg.friendTerminal, (f.ty - f.y0) / 2.0)` and use `f.vt`
   instead of `cfg.friendTerminal` in `_stepFriend` (`world.js:806`, drag `g / f.vt`). Update MECHANICS §4/§5 ("≤ 3 s").

2. **P3: the `?age=` URL flag overrides the age a parent picks in settings, and the settings chip shows the wrong age.**
   `game/js/main.js:22` `const curAge = () => FLAGS.age || S.age;`, plus the age-chip callback at `main.js:415` and
   `ui.js` `refresh()` highlighting `s.age`. With `?age=6` the settings panel highlights **4** (the saved age) while age 6 is
   being played. Tapping "5" saves `age:5`, but the title still says "Tuổi 6 / Age 6" and the next session plays age 6.
   The language chip already does this right: it clears `langOverride` at `main.js:~402`.
   Repro: open `?mute=1&lang=vi&age=6`, hold ⚙ for 2 s, and look at the chips (4 is lit). Tap 5, then Done: the title shows 6.
   Fix: make the flag a session override that a parent's choice clears. Use `let ageOverride = FLAGS.age;` and
   `curAge = () => ageOverride || S.age;`. In the bindSettings callback add `if (k === 'age') ageOverride = null;`. Light
   the chip for `curAge()` (pass a getter to `KB.UI.bindSettings`, or call `refresh` with `Math.min(7, curAge())`). URL
   flags stay unsaved.

3. **P3 (docs): the project `CLAUDE.md` is still the sister game's.** `projects/education-game/kitten-balloon-farm/CLAUDE.md`
   describes "Owlet's Snow Garden", `window.SG`, the storage prefix `sg:` and Lumi. The code uses `KB` and `kb:`. Future
   agents following it will write to the wrong namespace and storage keys. Fix: rewrite it for Kitten's Balloon Farm (`KB`,
   `kb:`, Miu, balloons, the tap-to-pop rules).

## Not covered / unverified
- Real iOS Safari: TTS voices (headless has 0 voices, so voice is checked through `KB.debug.voiceLog`), speech
  recognition (the mic button is hidden in headless), AudioContext unlock, safe-area insets on a real notch.
- The Talk-time mic answer path (`listen()`) is not exercised.

## Status after fixes (lead, 2026-11-01)
- Friend fall: every friend now lands 1.2–2.2 s after the pop (gravity/terminal scaled by drop height, world.js).
- `?age=` is session-only: a parent's pick clears it, and the settings chips show the age actually played (main.js, ui.js).
- CLAUDE.md rewritten for this game.
- Suite updated for the new rules (wrong-tap lock 0.8 s, 6 rounds per chapter at ages 6–7, the game pauses itself after the
  4th unanswered Talk re-ask, rising balloons may sit below the grass). Full run: **344/344 checks passed**.
