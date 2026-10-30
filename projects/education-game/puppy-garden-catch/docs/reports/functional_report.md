# Puppy Garden Catch: functional QA report

Date: 2026-10-30 · Tester: functional QA agent (report-only; nothing in `game/` was changed by QA)
Suite: `node tests/e2e/functional.js [groups…]` (Playwright Chromium, `isMobile` + `hasTouch`, real CDP
`Input.dispatchTouchEvent` touches). Groups: `boot lang gate settings input count talk pause rotate hud bot`.
Env: `DEVS=iphone-portrait,…` limits the device list, `PAR=n` sets bot parallelism, `REP=n` repeats the bot matrix.
Output: `tests/out/functional/results.json`, screenshots, `texts-<age>-<lang>.json`, and `stuck-*.json` if the stuck-round check (150 s) trips.
The suite exits 1 when any check fails.

Devices: iPhone 393×852 @3, iPhone 852×393 @3, iPad 820×1180 @2, iPad 1180×820 @2.

## Final result (round 2, after the round-1 fixes)

**Full run: 378 passed, 0 failed, exit 0 (≈ 11 min).**
Extra bot run (`REP=3`, 30 sessions, ages 3–7 × EN/VI × 4 viewports, speed 10): **255 passed, 0 failed**. No round got stuck,
and sessions took 204–318 s game time.

| Area | Result | Notes |
|---|---|---|
| Boot without console errors (4 viewports) | PASS | Title, logo, stars and age shown; Play ≥ 44 px; tapping Play shows the HUD and the prompt |
| Language switch EN ↔ VI | PASS | DOM text, `<html lang>`, `document.title`; the voiceLog greeting is logged with `lang:'vi'`; a VI session speaks only VI; the choice survives a reload; VI→EN works |
| Parent gate | PASS | A short tap, a 1.2 s hold, and a hold that slides off all leave settings closed. A 2.2 s hold (touch or mouse) opens them. The panel fits on screen |
| Settings persistence | PASS | Age, language, name, sfx, music and mic survive a reload. `{}<>` are removed from the name. 7 shows as "7+". The game starts at the saved age |
| URL flags never saved | PASS | `?lang&age&mute&speed&seed&level` are never written, even when a parent toggles another option. A later visit uses the saved values |
| **F4** storage namespacing | PASS | Keys are `pg:*`, none are `dn:*`, and `pg:settings` exists |
| Real-touch drag catches a right bubble | PASS (4/4) | `catch{right:true}` → `correct` → `land`; praise is spoken |
| **F1** Pip follows the finger while the render quality is stepping down | PASS (4/4) | The first steer is checked before the render quality has settled. The steer is no longer cancelled |
| Steer under a wrong bubble | PASS (4/4) | `catch{right:false}` + `wrong`; the item hops out and never lands; stars never drop; round stars follow the rule; the line is kind |
| A right bubble hits the grass (miss) | PASS (4/4) | `bounce` + `miss`, no mistake and no star lost; the bubble floats back up; another right bubble comes; a miss line is spoken |
| **F2** a bubble tap (60 ms and 200 ms) leaves Pip still | PASS (4/4) | Pip moves < 12 px |
| **F3** tap on a new bubble (also iPhone portrait) | PASS (4/4) | The `tap` event fires and the voice names the item. New check: a new bubble's top edge is below the speech bubble on all 4 viewports |
| Tap Pip → `tapPup`, prompt repeated | PASS (4/4) | |
| Count mode (age 4, level 2) | PASS (3 viewports, EN + VI, 2 rounds each) | `land` counts are 1..need; every number is spoken in the right language |
| Talk time by tap, right and wrong | PASS (EN iPad P, VI iPhone L) | Right: +1 star and praise. Wrong: no star change, "It is \<answer\>…". A second tap is ignored; the game continues |
| Pause / resume, Home, Play debounce | PASS | |
| visibilitychange pause | PASS | Hidden → paused; it stays paused until Resume; hidden during Talk time silences audio |
| Rotation mid-steer (3 rotations) | PASS | The steer is cancelled; the old finger can't steer; Pip and the bubbles stay on screen; still playable |
| HUD / speech bubble taps do not steer | PASS | A second finger is ignored as well |
| Full bot sessions, ages 3–7 × EN/VI | PASS (10/10 + 30/30) | 4 chapters with 4 Talk times each; star rules hold; Play again works; no stuck round |
| voiceLog / UI strings clean | PASS | No `{`, `undefined`, NaN, raw keys or wrong-language lines |

### Test changes in round 2
- **Wrong-catch test** (`steer(c, 'wrong', { wander: true })`): the new rules are idle hold (no touch for 15 s) and the still-Pip guard
  (no wrong bubble aimed at a Pip that hasn't moved for 1 s). So the test now acts like a playing child: the finger stays
  down and sweeps Pip back and forth across the lanes (period 2.4 s) until a wrong bubble is in the air, then follows it to the rim.
- **Tap-Pip test**: it now also waits until no bubble is about to drop into the basket. Before, a catch could end the round
  between the tap and the check: test timing, not a game bug.
- F1–F4 are now checked against the fixed behaviour:
  - F1: the first steer, before the quality settles, follows the finger, and the bot check passed 40/40 sessions.
  - F2: Pip moves < 12 px on a bubble tap.
  - F3: a new bubble is born below the speech bubble, and a tap on it fires `tap`.
  - F4: `pg:settings`, no `dn:` keys.

## Round 1 bugs (all fixed by the integrator and verified)

| Bug | Was | Repro | Fix verified by |
|---|---|---|---|
| F1 (P1) | `adapt()` (main.js) → `applySize()` → `world.setViewport()` → `cancelDrag()`: a quality step on slow frames dropped the child's steer mid-drag. The bot kept its finger "down" and never pressed again, so rounds got stuck (150+ s of misses, 2/30 sessions) | iPad 1180×820, `?mute=1&seed=4&age=4`, hold and drag for 3 s on a slow device | `[input *] (F1) …follows the finger…`, bot watchdog 40/40 |
| F2 (P1) | A 60/200 ms tap on a bubble moved Pip 98–300 px (`pointerDown` steered at once) | `?mute=1&seed=11&age=4`, tap a bubble 300+ px from a standing Pip | `[input *] (F2) …Pip does not run` |
| F3 (P2) | iPhone portrait: the speech bubble, moved under the HUD, covered the spawn line (logical 135–235 vs spawnY 190); new bubbles were hidden and untappable | iPhone 393×852, tap a just-spawned bubble → `#bubble` gets the touch | `[boot *] (F3) …born below the speech bubble`, `[input iphone-portrait] (F3) … tap event` |
| F4 (P2) | `storage.js` prefix `dn:` shared localStorage with Dino Nest Sort on the same github.io origin | `Object.keys(localStorage)` after a settings change → `dn:settings` | `[storage] …namespaced…` |

## Notes (not bugs)
- `tapPup` fires only when no bubble is inside the hit radius around Pip's chest; a bubble tap wins (MECHANICS §0).
- Count lines use digits ("Yes! 2 apples!"); the check accepts a digit or the word.
- The idle hold and still-Pip guard work as designed: a test that waits with no touch and a standing Pip sees no wrong bubbles,
  which is what broke the old wrong-catch test.
- Except for the first `[input]` steer and the bot sessions, the groups still let the render quality settle before steering.
  That way an F1 regression shows up in one place instead of everywhere.
