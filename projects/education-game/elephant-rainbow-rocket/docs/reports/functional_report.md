# Functional QA report — Bim's Rainbow Rocket (2026-11-02)

Suite: `tests/e2e/functional.js` (rewritten for this game). Run: `node tests/e2e/functional.js [group …]`.
All contexts are `isMobile + hasTouch`: iPhone 393×852 / 852×393 @3, iPad 820×1180 / 1180×820 @2. Input is real touch
(`page.touchscreen.tap`, CDP `Input.dispatchTouchEvent` for holds and drags). Results: `tests/out/functional/results.json`,
screenshots in `tests/out/functional/`. The full run takes about 35 min; the `layout` group (8 bot sessions at 3×) is most of it.

## Result
**353 pass, 4 fail.** The two full runs gave the same result (339/4 each). The `talk` group then had iPhone landscape added
(+10, all pass), and the volume compressor check was rewritten to count real nodes (same number of checks, passes).
The 4 failures are all one bug (B1) and are deterministic with seed 400. No check flaked across the runs.

| group | pass | fail | covers |
|---|---|---|---|
| boot | 32 | 0 | 4 devices: title, loader gone, Play ≥ 60 px, short side 720, no overflow, Play by touch, first row on screen, zero console errors |
| lang | 10 | 0 | EN/VI chips change the logo, document.title, html lang, tagline and age; VI welcome line; persists; ?lang=vi / en bubble prompt; VI lines after a right answer |
| gate | 7 | 0 | short tap, 1 s hold and a hold that slides off do NOT open settings; 2 s hold does; progress ring |
| settings | 9 | 0 | age, name "Mầm", music, lang and volume saved to `rr:settings`, persist across reload, panel shows them, saved age is played |
| flags | 5 | 0 | ?lang/?age/?speed/?seed applied but never saved; parent setting wins; no flags → saved values |
| volume | 9 | 0 | ctx/master/user/sfx/music exist; a real DynamicsCompressor on the game ctx; user gain = vol × 1.6; slider → saved → gain; persists; pause −/+ |
| tap | 28 | 0 | 4 devices: real tap on the right island → go, ignite/fly, lands there (pad = id), collect, camY decreases, next hop asked |
| wrong | 27 | 0 | wrong event, nothing advances, no hint after the 1st miss, hint + glow on the right island after the 2nd, kind voice line, right tap still works |
| drag | 36 | 0 | 4 devices: aim line while dragging; release on empty sky cancels quietly (no go/wrong/poke, aim cleared); drag to the right island launches and lands; drag to a wrong island → wrong |
| poke | 8 | 0 | short tap on the rocket → pokeBim and the prompt in voiceLog; long still press does nothing; bubble tap repeats; rapid taps safe |
| flight | 3 | 0 | taps on islands and the rocket during ignite/fly/land/climb are ignored |
| boost | 16 | 0 | round by touch → 3 stars → boostReady; tap on the sky → boost(auto:false) → boostEnd → next round with camera higher; tap on the rocket boosts too |
| autoboost | 3 | 0 | no tap → boost(auto:true) 5.0 s (world time) after boostReady |
| talk | 30 | 0 | iPad L, iPhone P and iPhone L: Talk screen, 2–4 buttons ≥ 64 px on screen, right tap → correct, stars +1, a 2nd answer is ignored, next chapter, HUD = world stars |
| pause | 9 | 0 | pause button freezes world time; resume; tap works after; pause/resume mid-flight; Home → title; Play → fresh session |
| visibility | 5 | 0 | visibilitychange hidden → paused (stays paused when visible again); resume works; hidden mid-drag clears the aim |
| rotate | 36 | 0 | P↔L on iPhone and iPad, mid-ask and mid-flight: islands and rocket inside the screen, lands on the tapped island, later right taps work |
| bot | 20 | 0 | full sessions at ages 3/4/5/7 (speed 10) reach `done`: 4 chapters, 4 talks, boosts = roundDones, no raw keys, zero console errors |
| done | 14 | 0 | moon party with star count = world stars; Play again → fresh session where taps work; Home → title; total stars grow and persist |
| layout | 24 | 0 | every asked row of whole sessions (8 device × age combos, ≥ 30 rows each): islands on screen, clear of the DOM HUD and bubble, ≥ 60 px, body/token taps resolve to their own island, DESIGN spacing; rocket on screen |
| misc | 10 | 0 | pad tap → prompt repeat; a 2nd finger is ignored; touchcancel mid-drag; rotate mid-drag; rotate mid-boost; idle nudges and hint at the 2nd idle |
| shooting | 8 | **4** | see B1 |

## Bugs

### P1 — breaks play for a child
None found. Every core loop works with real touch on all four viewports: tap, drag, wrong answer and hint, boost
(tap or automatic), Talk time, pause, rotation and full sessions at ages 3–7.

### P2 — noticeable

**B1. The shooting star flies behind the speech bubble and HUD; on iPhone portrait it cannot be tapped at all.**
- Repro: `?mute=1&seed=400&age=4` on iPhone 393×852. Start the game and let the bot play (`RR.debug.setBot(true,1)`)
  until `RR.debug.world.shooting` exists. Then sample the star's screen point (`RR.debug.toScreen(s.x, s.y - camY)`)
  against `#bubble` and `#hud` `getBoundingClientRect()`. Or run `node tests/e2e/functional.js shooting`.
- Observed: the star's head (≈ 26 logical px) is under the DOM bubble or HUD for 86–100 % of its on-screen path on
  iPhone portrait, 83–84 % on iPhone landscape and 93–97 % on iPad landscape.
  A real touch on the star where it pokes out of the bubble lands on `#bubble` (`pointerdown:bubble`), so
  `world.pointerDown` is never called and there is no `shootingTap`; the bubble repeats the prompt instead.
  On iPhone portrait the star is never 40 px clear of the bubble/HUD anywhere on its path.
  On landscape it can be caught once it leaves the bubble, on the right half.
- Expected: the surprise is visible and catchable across the open sky (REQUIREMENT: "a shooting star crosses (tap it for
  a sparkle shower)").
- At fault: `game/js/world.js` `_stepRound`, shooting-star spawn (≈ line 1010):
  `sy = L.ins.top + this.rng.float(0.1, 0.22) * L.H`. That is exactly the band of the bubble and HUD (portrait bubble at
  `ins.top + 120 … +244`; HUD at `y < ins.top + 96`).
  Suggested fix: spawn below the obstacles, for example
  `top = max(L.bubble.y + L.bubble.h, hudKeep ? hudKeep.y + hudKeep.h : 0) + 50`, and
  `sy ∈ [top, min(top + 0.12·H, L.rowY − islandH − 40)]`.
  Keep `vy` small so it does not cross into the island row.

### P3 — polish

**B2. Stale bubble text after the boost and during Talk time.**
- Repro: finish a round, tap to boost (any device). Screenshots: `iphone-portrait-boost-fly.png`,
  `iphone-portrait-talk.png`, `iphone-landscape-talk.png`.
- Observed: during the boost flight the bubble still says "Tap the rocket! Blast off!". Behind the Talk panel it still
  says "Big boost! Tap the rocket!" (visible through the dim layer).
- Expected: the bubble shows the boost-go line or hides during the boost, and is hidden or shows the Talk question during
  Talk time.
- At fault: `game/js/main.js` `onEvent` `case 'boost'` (line 279) speaks `boostGo` but never calls `RR.UI.say(...)`;
  `openTalk()` (line 328) does not clear the bubble. Add `RR.UI.say(T('boostGo'))` (or `RR.UI.say('')`) on `boost`, and
  `RR.UI.say('')` in `openTalk`.

**B3. Portrait hit areas overlap (design deviation, no wrong answers seen).**
- Repro: iPhone 393×852 at age 5 or 7 (rows of 4 zig-zag) or age 3 (3 islands). Run `world._hitIsland` on a 6 px grid
  over the row.
- Observed: neighbouring hit areas share 1 500–8 900 logical px² (≈ 50×50 CSS px at worst). The closest centre distance
  is 242 logical px at age 5, where DESIGN §2 asks for ≥ islandW + 28 = 244.
  `_rowIsland` picks the nearest island, and taps on every island's cloud body and token resolve to the right island
  (the layout group checks this on every row), so no child is mis-answered.
- Expected (DESIGN §2): "Islands are ≥ 28 px apart so hit areas never overlap".
- At fault: `world.js` row placement (zig-zag at ≈ line 472, `cfg.zigzag 70`). Either raise the zig-zag amplitude in
  portrait rows of 3–4, or update DESIGN to say "nearest island wins".

**B4. Talk panel in landscape: the title is centred on the whole panel, not on the right column**
(`iphone-landscape-talk.png`). This is cosmetic, for the visual QA / CSS owner (`game/css`, `.talk-panel` landscape
layout).

## Screenshots reviewed
Title, ask, flight, wrong + hint glow, boostReady, boost through the cloud bank, Talk (3 devices), pause, moon party,
rotated rows and the portrait layouts at ages 3/5/7. The rendering is clean: no missing sprites, no blank canvas and no
NaN text. Rows of 4 on iPhone portrait are tight but readable.
