# Functional QA report: Dee's Forest Memory

Date: 2026-11-02 · Tester: functional QA agent (report-only for `game/`) · Suite: `tests/e2e/functional.js` (rewritten for the memory-card game)

```
node tests/e2e/functional.js                    # all 21 groups, about 25 min
node tests/e2e/functional.js flip match third   # only some groups
```
Groups: `boot lang gate settings volume flags phases flip match mismatch third tapup multi stars hint repeat talk pause rotate hud bot`.
An unknown group name exits with code 2. Results go to `tests/out/functional/results.json`, and screenshots of failures to `tests/out/functional/`.
Playwright Chromium, `isMobile` + `hasTouch` contexts: iPhone 393×852 and 852×393 @3, iPad 820×1180 and 1180×820 @2.
Every card tap is a **real touch** (`page.touchscreen.tap` at `DM.debug.cardScreen(id)`). Multi-finger input, holds, slider drags and touch-cancel go through CDP `Input.dispatchTouchEvent`.

## Result

| group | checks | result | notes |
|---|---|---|---|
| boot | 28 | PASS | 4 viewports: title, logo, Play by touch, short side 720, no overflow, first-round cards ≥ 120 px, 0 console errors |
| lang | 9 | PASS | EN↔VI on the title, persists, VI welcome line, `?lang=vi` prompt + flip line in Vietnamese |
| gate | 7 | PASS | short tap / 1 s hold / slide-off do NOT open; 2 s hold opens, progress ring at mid-hold |
| settings | 10 | PASS | age / name / music / lang saved in `dm:settings`, persist; saved age 6 is played (`lower` first); name appears in praise |
| volume | 17 | PASS | slider dragged by a real finger → `settings.volume`, saved, `DM.Audio.volume`, `Voice._volume`; user gain = vol × 1.6; persists; pause − / + (step 10 %, clamps 0 / 100 %, saved, gain follows 0.9 × 1.6 = 1.44, slider follows); − / + taps never reach the canvas |
| flags | 7 | PASS | `?lang=vi&age=6&speed=2&seed=9` never saved; parent's age chip wins over the flag |
| phases | 7 | PASS | taps during deal / peek / hide ignored; all cards face down at play start |
| flip | 24 | PASS | 4 viewports: flip on touch-down, face up within 0.38 s, voice line names it, `open = [id]` |
| match | 192 | PASS | 4 viewports × 4 chapters (colours / shapes / count / animals): match, reward 0.6–1.2 s later, cards gone, reward lands inside the safe area, off the board, not on Dee / bubble / HUD (single reward; see bug 1 for crowded chapters) |
| mismatch | 28 | PASS | ages 3 and 4: mismatch event, faces stay up, kind line, flip back after 1.0 s (age 3: 1.2 s) ± 0.05, then play |
| third | 10 | PASS | 3rd tap before the check and while the mismatch shows: A and B go down at once, C goes up, the mismatch counts once; a 3rd tap during a pending match is ignored, then works |
| tapup | 7 | PASS | double-tap = 1 flip; tap on a face-up card → `tap` + name again, state unchanged; a tap on a matched card never flips |
| multi | 7 | PASS | 2nd finger ignored (two touchStarts, or one touchStart with 2 points); single tap works after; recovers from touchcancel |
| stars | 7 | PASS | 3 / 2 / 1 stars at m = max(1, N−1) / 2N / 2N+1; world total = HUD |
| hint | 8 | PASS | no hint after 1 or 2 mismatches; hint right at the 3rd, on one unfound pair, both glow, streak reset |
| repeat | 9 | PASS | tap on Dee and on the bubble → exactly the bubble prompt again, nothing flips, Dee "think"; voice off at speed > 1 |
| talk | 22 | PASS | right / wrong by tap (+1 / no loss, marks), choice taps never reach the canvas, re-ask every 12 s, glow at the 2nd; 4th silent re-ask → 3 spoken, game self-pauses, world frozen, Resume → Talk, answer works |
| pause | 16 | PASS | HUD pause, frozen world, card behind the pause screen not tappable, resume; visibilitychange pause (open card kept); Home → Play; pause during Talk |
| rotate | 123 | PASS | 4 rotations × 2 chapters with one pair found and one card open: new shape, same round, inside the safe area, ≥ 120 px, no overlaps, nothing on Dee, open card still up, rewards re-perched inside, partner tap matches, round finishes; rotate during the deal and during a reward flight |
| hud | 16 | PASS | HUD / bubble / title taps never call `world.pointerDown`; no card under the real DOM HUD or bubble |
| bot | 93 | **FAIL (5–6)** | ages 3–7 × EN/VI: all 10 sessions reach the done screen, 4 chapters, 50–52 stars, clean text, no NaN, Play again + real tap OK. **Resting rewards end up under the DOM HUD** in 5–6 of 10 sessions (bug 1) |

Last full run: **639 / 647**. The 8 failures were 3 test bugs, since fixed (re-run 3× green), and 5 times bug 1 below. With today's game the suite exits 1 only because of bug 1.

Test bugs fixed on the way (not game bugs):
- The child's name in praise: `great` lines are picked at random and only some carry `{child}`, so one round may not say it. The test now samples the line 40 times.
- The hide wave lasts about 0.3 s, so a tap could land just after it ended (a legal play tap). The test now only counts events emitted while the phase was still deal / peek / hide.
- The third-tap (b) case needs ≥ 3 face-down cards, so it now runs on a fresh round.

## Game bugs

### P2-1: Rewards perch under the real HUD (star counter / round dots), partly or fully hidden
- **Where:** `game/js/world.js:59` (`hudW: 160, hudH: 96`), `game/js/world.js:182` (`L.hud`), `game/js/world.js:290-297` (`boxFree` keep-out). `game/js/main.js:72` passes no HUD size.
  The HUD is sized in **CSS px** (`game/css/style.css:114-122`: a star pill, 4 dots and a pause button, ≈ 240 × 56 CSS px, 10 px from the corner). Its logical size depends on the screen scale:

  | viewport | scale s | DOM HUD in logical px | world keep-out |
  |---|---|---|---|
  | iPhone landscape 852×393 | 0.546 | x ≥ W − 421, y ≤ 106 (403 × 88 px) | x ≥ W − 160, y ≤ 96 |
  | iPad landscape 1180×820 | 1.139 | x ≥ W − 218, y ≤ 58 | x ≥ W − 160 |
  | iPad portrait 820×1180 | 1.139 | x ≥ 502, y ≤ 58 | x ≥ 560 |
  | iPhone portrait 393×852 | 0.546 | x ≥ 262, y ≤ 121 | x ≥ 560, y ≤ 96 |

  Perches in the gap between the two areas count as free, so branch lanterns, air stars and butterflies sit behind the star pill.
- **Repro** (headless, `DM.debug.setBot(true, 0.75); setSpeed(8)`):
  - `?mute=1&seed=206&age=5&lang=vi` on 852×393: a lantern on branch perch (1160, 88), box 1116..1204 × 26..114, is **63 × 80 px under the star pill**, almost fully hidden (screenshot: orange lantern behind "★ 3").
  - `?seed=208&age=6&lang=vi` on 1180×820: a star at the air perch (804, 40) overlaps 13 × 45 px.
  - `?seed=207&age=6` on 820×1180: a star at (484, 40) overlaps 9 × 45 px.
  - The bot group flags 5–6 of 10 sessions.
- **Why the sims and unit tests missed it:** `tests/sim/lib.js:233` and `tests/unit/run.js:270,579` check against the same logical `L.hud`, not the DOM rect.
- **Fix:** let main.js measure the real HUD and give it to the world as the perch keep-out. Change only the obstacle, not the bubble formula, so portrait card sizes stay as tuned:
  ```js
  // world.js setViewport, after computeLayout:
  this.layout = computeLayout(W, H, ins, this.cfg);
  if (this.hudKeep) this.layout.hud = this.hudKeep;          // DOM-measured HUD (logical px), used by boxFree only
  // main.js applySize, before world.setViewport(...):
  const hudEl = $('hud'), hid = hudEl.classList.contains('hidden');
  if (hid) { hudEl.style.visibility = 'hidden'; hudEl.classList.remove('hidden'); }
  const hr = hudEl.getBoundingClientRect();
  if (hid) { hudEl.classList.add('hidden'); hudEl.style.visibility = ''; }
  if (hr.width) world.hudKeep = { x: (hr.left - view.left) / view.s - 8, y: 0,
                                  w: view.W - ((hr.left - view.left) / view.s - 8), h: (hr.bottom - view.top) / view.s + 8 };
  ```
  Also have the sim / unit checks use a 403 × 106 px HUD on the iPhone-landscape viewport so this cannot come back.
  Check after the fix: `node tests/e2e/functional.js bot match rotate`.

### P3-1: On iPhone portrait the bubble ends flush with the card grid (0 px instead of 24 logical px)
- **Where:** `game/js/main.js:84-96` (`placeBubble`).
- **What happens:** the DOM HUD bottom (66 CSS px) is lower than the logical HUD (96 × 0.546 = 52 CSS px). So `placeBubble` moves the bubble to `hud.bottom + 8` = 74 CSS px. Its bottom is then at 146 CSS px, which is exactly the grid top (146). The designed gap is `boardTopGap` 24 px ≈ 13 CSS px.
- **Repro:** 393×852, `?seed=3&age=7`, round 4 (5 pairs). Grid CSS rect 151..351 × 146..797, bubble 13..380 × 74..146.
- **Effect:** nothing overlapped in 10 bot sessions, but long Vietnamese prompts that wrap to 3 lines would cover the top card row.
- **Fix:** same root cause as P2-1. With the measured HUD, compute the portrait bubble `y` from the DOM HUD bottom in the world, so the grid is laid out below the real bubble. Or shrink the HUD in portrait (`#hud { transform: scale(.85) }` below 430 px width) so it fits the 96-px logical band.

### Notes (not bugs)
- `MECHANICS.md §1` says `world.hint()` is the manual hint for a "tap on Dee / the bubble". `main.js:374 repeatPrompt` only repeats the prompt, which matches REQUIREMENT ("tap Dee or the bubble to hear it again"). Either update the doc, or call `world.hint()` on the 2nd Dee tap within a few seconds.
- On Chromium, a real finger drag on the volume slider moves it (no fallback was needed).

## Status after fixes (lead, 2026-11-02)
P2-1 fixed (real HUD + bubble keep-out, `world.hudKeep`). Tests updated for the new rules: early third taps are ignored
(`thirdTapAfter` 0.5 s), age topics rotate from `DM.AGE_POOLS`, the pause-backdrop tap avoids the new − / + buttons.
