# Functional QA report — Pip's Camp Hide & Seek (2026-11-03)

Suite: `tests/e2e/functional.js`, ported from the old rocket game. It now tests the hide-and-seek world and uses real CDP touch in Playwright `isMobile` / `hasTouch` contexts:
iPhone 393×852 and 852×393 @3, iPad 820×1180 and 1180×820 @2.
It never edits `game/`. It reads `FC.debug` and the world's state, and wraps `world._emit` without draining it: it keeps a copy of each event and main still handles them.
It also wraps `world.pointerDown` and `setViewport` to record the phase, the lock and the result at the moment of each tap or relayout.

```
node tests/e2e/functional.js                 # all 21 groups, ≈ 9 min 15 s on 2 CPUs (JOBS = 2–3 by CPU count)
node tests/e2e/functional.js tap wrong rotate  # some groups; unknown group → exit 2; any FAIL → exit 1
```
Output: PASS/FAIL lines per group, a summary, `tests/out/functional/results.json`, and screenshots in `tests/out/functional/`.

## Result (final run): 448 pass, 0 fail, 554 s, exit 0

| group | pass | fail | covers |
|---|---|---|---|
| boot | 32 | 0 | 4 viewports: title, logo, Play ≥ 60 px, short side 720, no overflow, Play by touch, first ask (≥ 2 places on screen, exactly 1 right), clean bubble |
| lang | 10 | 0 | EN default; VI chip changes the logo ("Cáo Pip / Chơi Trốn Tìm"), document.title and html lang; VI welcome line; persists across reload; ?lang=vi / ?lang=en prompts; VI lines after a find |
| gate | 7 | 0 | short tap, 1 s hold and a slide-off do NOT open settings; progress ring; 2 s hold opens them |
| settings | 9 | 0 | age, name "Mầm", music, lang and volume saved in `fc:settings` and kept after reload; panel shows the saved values; age 5 is played; name used in praise |
| flags | 7 | 0 | ?lang=vi&age=7 applied but never saved (nor speed/seed/mute/level); only `fc:` keys |
| volume | 12 | 0 | ctx/master/user/sfx/music exist; DynamicsCompressor on the game context; user gain = vol×1.6; mute → master 0; slider 30 % → 0.48 and persists; pause −/+ (30→50 %, clamps at 0 %, saved, never reaches the world) |
| tap | 32 | 0 | 4 viewports: real tap → peek(right) → found(n=1) → friend seated on the bench, place stays found, 3 stars, next round asks, HUD = 3 |
| wrong | 45 | 0 | 3 viewports: wrong → peek(right=false) + wrong, boo → duck → hidden; tap inside the lock → `locked` (window checked with world time); kind line; 2nd miss → hint on the answer + glow; lock 0.8 s / 1.6 s (measured at emit); right tap still finds; 2 misses → 1 star |
| empty | 12 | 0 | tap on a found place → `empty`, no miss/peek, friendly line, no lock afterwards |
| poke | 16 | 0 | tap on Pip → pokePip and the same prompt again (voiceLog grows); long press does nothing; bubble tap repeats and never reaches the world; rapid taps OK |
| count | 14 | 0 | taps during gather/count → pointerDown null (checked per tap); countNum 1,2,3 → ready → ask; hideIn for every place; taps during peek/found/party ignored |
| countup | 30 | 0 | ages 4/5/6: gotoLevel(count) and ?level=N; rounds 0–1 `p.countUp` n = 1,2,3… in order, round 2 `p.count`; star signs 1…N; ?level is not saved |
| talk | 33 | 0 | 3 viewports: Talk screen, 2–4 choices ≥ 64 px, right choice tapped (DOM) → +1 star, 2nd answer ignored, taps never reach the world, next chapter uses tent/rock, HUD = stars |
| pause | 11 | 0 | world time frozen; canvas taps blocked; resume repeats the prompt; pause in mid-peek still finishes found+seat; Home → title; fresh session |
| visibility | 6 | 0 | hidden → paused, stays paused when visible, world stopped; hidden mid-peek → the find finishes after resume |
| rotate | 36 | 0 | 4 rotation pairs: relayout during **peek** (round 0) and during the **bench hop** (round 1): every place and friend on screen, find/seat finish, friend sits exactly on the seat of the new layout, round 1 finishes by touch |
| surprise | 27 | 0 | rotation during gather / count (friends running) / swap (friends hopping) / leave → all on screen, game goes on; taps during the swap ignored; after swap + rotation the answer place holds the asked friend and a real tap finds it; squirrel visible (not under the DOM) and a real tap → critterTap + a line |
| bot | 75 | 0 | 10 full sessions at speed 20 (ages 3–7 × EN/VI): mode done; 4 chapters, 4 talks; round = roundDone; found = asks; found + reveal = seat; no raw keys or undefined; every line in the session language, VI ≥ 80 % with diacritics; done screen stars = world stars; 13–24 s each |
| done | 11 | 0 | campfire party screen; buttons ≥ 44 px; Play again → fresh session and taps work; Home → title stars = session stars; persists after reload |
| layout | 15 | 0 | 5 full sessions (iPhone P/L, iPad P/L, ages 3–7), ≥ 80 % of all asks checked: places on screen, clue band clear of the HUD/bubble, ≥ 60 px, no overlap, hit-box centre and peeking head resolve to that place, Pip on screen, **the answer friend matches the prompt (all 11 topics incl. add/sub/oddeven/size) and no other hidden friend also matches** |
| misc | 8 | 0 | second finger ignored; touchcancel on Pip; grass tap → null; idle nudges at 12 s then 18 s, 2nd idle hints; auto-pause ≈ 2 min; taps work after resume |

Zero console errors, zero page errors and no HTTP ≥ 400 in every group.

## GAME bugs
**P1: none. P2: none.** No real game bug survived checking. Every failure seen during the port was a test bug, fixed in the suite (see below).

**P3 (documentation / contract only, no effect on play):**
1. **The project's `CLAUDE.md` still describes the old game**: "Bim's Rainbow Rocket", namespace `window.RR`, storage prefix `rr:`, rocket world, `sky_art.js`, helper "Bim".
   The code is `FC` / `fc:` / Pip.
   Repro: open `fox-camp-hide-seek/CLAUDE.md`. Expected: Pip / FC / `fc:`, `camp_art.js`.
2. **The `reveal` event is not in DESIGN §5.2.** At the end of each round, the last hidden friend reveals itself and hops to the bench. It emits `reveal`, then `seat`.
   So there is 1 more `seat` per round than `found` (for example, age 7: found 68, seat 84, reveal 16). The event list in DESIGN §5.2 should include `reveal {placeId, friendId, …}`.
   Suspected place: `world.js` `_party`/reveal (around line 598).
3. A resize in the middle of an animation finishes it at once, as DESIGN §5.2 says ("finish any running animation instantly"): a peek jumps to `found`, and a friend that is hopping lands on its seat.
   This is per the spec and nothing gets stuck. It only means a child who rotates the device during a peek does not see the pop.

## Test bugs found and fixed while porting (so they are not mistaken for game bugs)
- **Last-friend reveal:** the round's last friend also sits down, so the suite now counts `seat` events by friend id.
- **Count-phase taps:** taps sent during the count could arrive just after it ended and count as real answers in `ask`. They are now sent one per poll, only while ≥ 1 s of the count is left, and checked against the recorded phase of each tap.
- **Lock timing:** the 0.8 s lock was too short to test reliably on a 2-CPU host. The suite now slows the game to 0.25× during that check and confirms the timing with the recorded world time and lock end.
- **Pause tap:** a test tap "under the pause panel" hit the Home button. It now uses a point that is not on any button.
- **Rotation checks:** the suite records the phase when the relayout actually happens, and waits for that relayout instead of a fixed sleep.
- **Load:** with 5 bot pages on 2 CPUs the bots ran slowly and sessions timed out. Parallelism now follows the CPU count, and bot sessions run at speed 20.
- **Layout checks:** an ask with no answer yet (null `answerId`) is skipped, the number of asks checked is a share (≥ 80 %) of the session's asks, and add/sub/oddeven prompts are checked by their meaning.
