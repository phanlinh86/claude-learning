# Functional QA report: Momo's Toy Train (2026-11-06)

Report only. No game code was changed. New test script: `tests/e2e/qa_extra.js` (17 groups, real CDP touch in
isMobile/hasTouch contexts at iPhone 393×852 @3, 852×393, iPad 820×1180 and 1180×820 @2). Screenshots are in
`tests/out/qa_extra/`.

## Suites run
| suite | result |
|---|---|
| `node tests/unit/run.js` | 28/28 pass |
| `node tests/unit/i18n_voice.test.js` | 11 347/11 347 pass |
| `node tests/e2e/smoke.js` | pass (iPhone portrait and landscape, iPad landscape; real drag plus bot sessions) |
| `node tests/e2e/functional.js` (JOBS=3) | 193/197. The 4 failures are flaky test timing (see P3-3). `functional.js drag lang` alone passed 19/19 twice. |
| `node tests/e2e/qa_extra.js` (all groups) | 168/172 on the first pass. 3 real failures (the balloon, P1-1) and 1 test bug that is now fixed. |

The following checks pass (qa_extra):
- **Drops:** correct, wrong, miss and tap on all 4 viewports. A 12 px wobble still counts as a tap. A fast 3-move flick lands.
- **Dropping high above a car:** 60 or 85 px above the car top lands. 140 px above is a miss, not a wrong drop.
- **Fingers:** a second finger mid-drag is ignored. A palm (two fingers at once) grabs at most one toy and leaves nothing stuck.
- **HUD and bubble:** a press on the bubble or HUD never grabs a toy. A drag released over the HUD is a miss and the toy goes home.
- **Rotation:** rotating mid-drag cancels the drag, and every toy and car stays on screen. Rotating while a toy is flying still lands it. The round can still be finished after rotations.
- **Touches during other phases:** touches during arrive, deal, whistle or depart do nothing harmful. A loaded toy cannot be pulled back out. Taps during depart fire no second whistle.
- **Whistle:** a tap fires the whistle. The nudge comes at 6.0 s and the auto whistle at 12.0 s (`auto:true`).
- **Count mode:** an extra toy dropped into a full car gives `full` (seen), never `wrong`, and every train still gets 3 stars.
- **Talk time:** wrong and right answers by tap both work. The mic is hidden when SpeechRecognition is missing and shown when a recogniser exists.
- **Pause:** `visibilitychange` pauses the game and cancels the drag. The world stays frozen until Resume. Pausing and resuming during Talk time works.
- **Parent gate:** a short tap, 5 rapid taps and a 1.8 s hold all leave settings closed. A 2.15 s hold opens them.
- **Settings and volume:** pause − / + steps by 10 % with 0–100 % clamps and is saved and restored. URL flags are never saved.
- **Language:** EN → VI → EN via pause, Home and the chip. The bubble, `world.lang`, html `lang` and every voice line follow.
- **Audio:** the audio chain exists and user gain = volume × 1.6.
- **Bot sessions:** ages 3 to 7 at speed 16 (skill 0.2–0.7) all reach `sessionDone`. Longest round 62 s game time. Zero console errors in every group.

## Specific questions
**Toys left on the rug while the train departs (colour round): this is not a loading bug.** I sampled every 180 ms
through depart in 12 colour rounds on 3 viewports. The `whistle` phase is only reached when every toy is `in` a car,
and no toy was ever outside a car while the train was departing.

What the screenshot showed is the **next** round's toys popping onto the rug (round N+1, `arrive`/`deal`) while the
bubble still says the old depart line ("Off we go! Bye-bye, toys!" / "Choo choo! Bye-bye!"). Captured state:
`round 1, phase deal, bubble "Off we go! Bye-bye, toys!", items pop:119 pop:19 …`. So it is next-round dealing under a
stale bubble. That is filed as P2-1.

**Balloon on iPad landscape: it is clipped. The same happens in both portrait layouts.** Filed as P1-1.

## P1

### P1-1 The balloon surprise is cut off at the right edge (iPad landscape, iPad portrait, iPhone portrait)
- **Repro:** iPad 1180×820, `?age=4&seed=1` (chapter 0's surprise is the balloon). Play to round 3 (index 2). The balloon is tied to the last car. Tap it a few times.
- **Observed:** at rest, the balloon head's right edge is 1055 logical px on a 1036-wide screen, so it overflows by 22 CSS px. The same happens on iPad portrait (747 on a 720 screen, +31 CSS) and iPhone portrait (759 on 720, +21 CSS). After taps (sway up to about 0.3 rad), the drawn balloon reaches x = 1230 on an 1180 screen: about half the balloon is off screen, and so is part of its tap target. See `tests/out/qa_extra/ipad-landscape-balloon-load.png`. iPhone landscape is fine, because the train is centred there and the head ends at 1353 on 1561.
- **Expected:** the whole balloon and its tap circle stay on screen, including while it swings after a tap.
- **Cause:** `world.js` `P._balloonTie` puts the tie point at `c.x1 + c.ox − 0.08·c.w`. When the cars fill the width, `c.x1` is about `W − ins.right − 20`. The head is a pendulum of length about 0.75 × 1.55 S with radius 0.3 × size. Nothing clamps it to the screen: `computeLayout` only adds a cargo keep-out box, and `_stepSurprises` has no screen clamp.
- **Fix:** tie the balloon further in, for example `x: c.x1 + c.ox − 0.35·c.w`, and clamp the idle and tap sway so the head stays inside. In `_stepSurprises`, while the train is parked (phase ≠ depart): `var hx = B.x + Math.sin(B.sway)·Lh; var maxX = L.W − ins.right − 0.3·B.size − 12; if (hx > maxX) { B.sway = Math.asin(clamp((maxX − B.x)/Lh, −1, 1)); B.swayV = Math.min(0, B.swayV); }`. Also bias the idle sway target slightly left (−0.12 rad). Then add an on-screen assert to `tests/unit/run.js` that checks `_balloonHead()` across 16 viewports.

## P2

### P2-1 Stale "Off we go! Bye-bye, toys!" bubble while the next train arrives and deals its toys
- **Repro:** any viewport, `?age=4&seed=3`. Load round 0 and tap the whistle. Watch the next train arrive.
- **Observed:** during round N+1's `arrive` and `deal` (about 2–2.5 s), the bubble still shows the old depart line while new toys pop onto the rug. It reads as if toys were left behind, which explains the screenshot in the brief. The bubble only changes at the `ask` event. See `tests/out/qa_extra/iphone-portrait-stale-bubble-deal.png`.
- **Expected:** the bubble is cleared, or shows a "new train" line, as soon as the next round starts.
- **Cause:** `main.js` `onEvent` `case 'round'` only calls `TT.UI.say(T('deal'))` when `round % roundsPerLevel === 0`. Otherwise the bubble keeps the `whistle` text set in `case 'whistle'`.
- **Fix:** in `case 'round'`, add `else TT.UI.say('');`. Alternatively, show `T('deal')` on every round but only speak it at chapter start: `TT.UI.say(T('deal')); if (first) speak(T('deal'));`.

## P3

### P3-1 A tap on Pause by a second finger while the first finger drags is ignored
- **Repro:** iPhone landscape. Finger 1 drags a toy. Finger 2 taps ⏸, then lifts.
- **Observed:** the mode stays `play`, so no pause happens until finger 1 lifts. This is Chromium's multi-touch click suppression, and iOS behaves the same way.
- **Expected:** this is arguably fine, since it is kid-proofing. If a parent should be able to pause mid-drag, handle `pointerup` on `#btnPause` instead of `click`.
- **Fix (optional):** `$('btnPause').addEventListener('pointerup', …)` with a de-dup flag. Low priority.

### P3-2 A spare toy that is waving goodbye can still be grabbed
- **Where:** count mode, `world.js` `P._grabbable` (`rest` / `home`).
- **Observed:** it does not check `it._bye`. A toy marked `_bye` but still waiting for its stagger slot (`byeStagger`) can be picked up. Dropping it into a full car gives `full`, which is harmless. It was not seen in this run, but the code path exists.
- **Fix:** `return (it.state === 'rest' || it.state === 'home') && !it._bye;`.

### P3-3 `functional.js` is flaky under parallel load (JOBS=3 together with the bot group)
- **Observed:** "wrong car → toy goes home" fails because it checks `rest` after a fixed 1000 ms, and the wrong-car shake plus the 0.55 s return overruns under load. The next check ("2nd finger") then grabs a toy that is still flying home. "Home from pause → title" checks the mode immediately after a 150 ms tap.
- **Fix (tests only):** replace the fixed sleeps with `until(P, id => TT.debug.world.itemById(id).state === 'rest', …)` and `until(P, () => TT.debug.mode === 'title')`. Alternatively, run the `bot` group alone (`JOBS=1` for it).

### P3-4 Test-author note: CDP `touchEnd` releases the listed touch points
- To lift only finger 2, send `touchEnd` with `[{id: 2}]`. Sending the remaining fingers lifts those fingers instead. This was fixed in `qa_extra.js`.

## How to re-run
```
node tests/e2e/qa_extra.js                       # all (about 12 min)
node tests/e2e/qa_extra.js balloon leftover      # the two specific questions
```

## Fixes applied (lead, QA round 1)
- **P1-1 balloon clipped:** tied at `x1 − 0.35·carW` (was 0.08), idle sway leans left (−0.12 rad), the swing is clamped while
  parked so the head stays ≥ 12 px inside the right edge; `balloonHit` / `hitchHit` targets clamped inside the screen; the
  bunny's seat moved in to `x1 − 0.3·carW`. Unit test `QA1: balloon head stays on screen` covers 7 viewports with taps.
- **P2-1 stale bubble:** every `round` event now sets the bubble to the deal line (shown, not spoken).
- **P3-2:** `_grabbable` excludes `_bye` toys (unit test).
- **P3-3 flaky waits:** `functional.js` waits with `until()` for the toy to be back at rest and for `mode === 'title'`.
- P3-1 (second finger on Pause mid-drag) left as kid-proofing.
