# Functional QA report — Gigi's Peekaboo Windows

Tester: functional QA agent (report-only on `game/`). Date: 2026-11-18.
Suite: `node tests/e2e/functional.js` (Playwright Chromium, `isMobile` + `hasTouch`, real touches via `page.touchscreen.tap`
and CDP `Input.dispatchTouchEvent`). Devices: iPhone 393×852 @3 and 852×393 @3, iPad 820×1180 @2 and 1180×820 @2.
Smoke: `node tests/e2e/smoke.js` (4 viewports, one real tap and a full bot session each).

**Result: 414 / 414 checks pass in 344 s (≈ 5 min 45 s). Smoke 4 / 4 pass. Zero console errors and zero page errors in every run.**
**No P1 or P2 bugs found.** There are 5 P3 issues (cosmetic or docs only), listed below.

Both scripts exit 1 on any failure. `tests/out/functional/results.json` has every check, and a screenshot is saved for any failed group.
To run some groups only: `node tests/e2e/functional.js pair critter rotate`.

## What was tested (all PASS)

| group | checks | what it covers |
|---|---|---|
| boot | 32 | title, loader gone, logo "Gigi's Peekaboo Windows", Play ≥ 60 px on screen, logical short side 720, no page scroll; Play by touch → HUD + first round reaches `play`, windows ≥ 120 px at age 4, every window on screen and clear of the HUD, the bubble and Gigi's head (all 4 viewports) |
| lang | 13 | EN logo, `document.title` and `<html lang>`; VI chip → "Hươu Gigi" / "Mở Cửa Sổ", VI tagline, age and gear tip; VI welcome line spoken; persists across reload (`gw:settings`); back to EN; `?lang=vi` → VI bubble + VI name/match lines and **not saved**; **"Gi Gi" rule**: the voice log keeps "Gigi" (it logs display text, per VOICE.md §0), while `GW.Voice.spoken('vi', …)` gives "Gi Gi" and EN keeps "Gigi" |
| gate | 7 | short tap does NOT open settings; a 1 s hold does not open them; a hold that slides off the gear is cancelled; the progress ring fills; a 2 s hold (real touch) opens settings |
| settings | 10 | age 6, the name "Mầm", music off and VI are saved in `gw:settings`; **every localStorage key starts with `gw:`**; the values persist across reload; the age-6 topic pool is played; the name is used in praise |
| flags | 8 | `?lang=vi&age=6&speed=2&seed=9&level=1` are applied for the session only; loading with them saves nothing; saving another setting does not store any flag value; a parent's age pick wins over `?age`; `?level=1` starts at chapter 2; with no flags the game is back to the saved values |
| volume | 15 | settings slider → `settings.volume`, saved, `GW.Audio.volume` and the speech volume follow; the **GW.Audio chain exists** (sfx/music → master → compressor → user gain) and user gain = volume × 1.6; persists across reload; pause −/+ are ≥ 44 px, ±10 % steps, clamp at 0 % and 100 %, the slider follows, the taps never reach the canvas, and the game stays paused |
| phases | 12 | taps during **scroll / peek / hide** are ignored; event order `scroll → round → peek → hide → play`; the first scroll has `first:true`; footstep `walk` events; every window is closed at play start; after the last match: `cheer → roundDone → scroll(first:false)`; a tap during the cheer opens nothing |
| pair | 48 | (4 viewports) the window opens on **touch-DOWN** (the `flip` event comes before `touchEnd`); open ≥ 0.9 after 0.25 s; Gigi names it; matching pair → `match`; both windows **stay `matched`** (lamp on, flowers out, still open, never `gone`); exactly 2 `bloom` events; no `deal/reward/land` events; phase back to `play`; layout clean; no NaN |
| mismatch | 16 | ages 3 and 4: `mismatch` event; both windows stay open; kind lines with no negative words; they close after 1.2 s (age 3) or 1.0 s (age 4); **2 `clack` events with v ≥ 4**; the next tap works |
| third | 8 | an early 3rd tap (< 0.5 s) is ignored; a 3rd tap after 0.5 s closes A and B and opens C, and the mismatch is counted once; a 3rd tap during a pending match is ignored, the match is confirmed, and that window opens on the next tap |
| tapopen | 9 | a double-tap gives 1 flip; a tap on an open window → `tap` event, the name is said again, nothing changes; a tap on a matched window → `tap` only, it stays matched, the name is said again; 3 extra taps on the one open window → auto hint |
| gigi | 16 | (iPhone landscape, iPad portrait) a tap on Gigi's body → `pointerDown` returns `'gigi'` and the voiceLog gets the bubble prompt **word for word**; a tap on her head does the same; Gigi's mood → `think`; no window opens; a tap on the bubble repeats the prompt and never reaches the world; rapid taps cause no errors |
| critter | 31 | the surprise comes **only in round index 2**; all three types were found by seed (pigeon, bus, balloon). For each type: `enter` event, then it settles (pigeon sits, bus stops, balloon rises); a real tap at `critterScreen()` → `'critter'` + `critter/tap` event; never a mistake (no flip, mismatch or count change); the idle timer is not reset; a reaction line is spoken; the pigeon and the balloon leave, the bus honks; the windows play normally afterwards |
| talk | 13 | Talk time opens after a chapter; 3 buttons ≥ 64 px; the right answer by tap → correct, +1 star, marked; button taps never reach the canvas; a 2nd answer is ignored; the next chapter starts; a wrong answer → no star lost, the right answer is shown with a kind line; the game goes on |
| pause | 16 | the pause button pauses, the world is frozen, a tap on a window behind the pause screen does nothing; Resume works and taps work again; **visibilitychange hidden → paused**, it stays paused when the page is visible again, and the open window is kept; Home → title; Play → fresh session; a visibility pause during Talk time → resume returns to Talk time |
| rotate | 51 | 4 rotations (phone and tablet, both ways) mid-round, with one pair matched and one window open: the world is re-laid out; the same round, found pairs and open/matched states are kept; windows ≥ 104 px; **over about 1.1 s of samples while the head moves on its spring: windows on screen, no overlaps, clear of HUD and bubble, and Gigi's head box never overlaps a window rect**; a real tap matches the partner; rotating back while the head is stretched is still clean; the round finishes; HUD and bubble are on screen. Rotating during the scroll and the peek → layout clean, dx 0, play starts |
| bot | 109 | full sessions at ages 3–7 × en/vi (speed 16–20, 5 in parallel), all 10 finish with `sessionDone` and the done screen; 4 chapters × 4 rounds; a surprise in round 2 of every chapter; no NaN; all bubble and voice text clean and in the session's language; the VI done title is Vietnamese; windows never below the age minimum; layout and head clean at every sample; stars 49–52 match the done screen; Play again (age 4) → fresh session, and real taps work |

Bot sessions (bot skill 0.75):

| age | lang | rounds | stars | chapters |
|---|---|---|---|---|
| 3 | en / vi | 16 / 16 | 51 / 50 | colors / animals / shapes / count |
| 4 | en / vi | 16 / 16 | 52 / 51 | colors / size (vi: animals) / shapes / homes |
| 5 | en / vi | 16 / 16 | 50 / 51 | colors / animals / count (vi: letters) / homes |
| 6 | en / vi | 16 / 16 | 52 / 50 | letters / count / lower / add (vi: letters / lower / initial / add) |
| 7 | en / vi | 16 / 16 | 52 / 52 | count / initial / sub / oddeven (vi: count / add / sub / oddeven) |

I also probed these edge cases by hand (scripts, not in the suite). There were no errors:
- After 5 idle nudges the game pauses itself, with hints at nudges 2–5.
- 3 mismatches in a row → 1 hint.
- Rotating during the cheer → the head never covers a window.
- Rotating during Talk time → the Talk panel stays open and works.

## Bugs

### P1 — none
### P2 — none

### P3-1 Rotation during Talk time / levelDone drops the lit building behind the panel
- **Repro:** `?mute=1&age=4&seed=71` on iPhone landscape. Play to Talk time (bot). Change the viewport to 393×852.
- **Expected:** the last building stays drawn behind the Talk panel. MECHANICS §1 says "`w.lastBuilding` is the lit building to draw in place".
- **Actual:** `world.lastBuilding` is `null` after the rotation. Only the bare street shows behind the blurred panel.
- **Suspect:** `game/js/world.js:393` `setViewport`: `this.prevBuilding = null; this.lastBuilding = null;`. Keep `lastBuilding` and re-fit its `rect` / `grid` to the new layout, for example by re-running `chooseGrid` for its card count. It is cosmetic only.

### P3-2 A pigeon that is flying in when the device rotates follows its old path, then jumps to its sill
- **Repro:** surprise round with a pigeon (`?seed=301..306&age=4`, round index 2). While `critter.state === 'fly'`, rotate landscape → portrait.
- **Expected:** the pigeon flies to its new sill.
- **Actual:** it keeps the old bezier. In one trace, x went 1459 → 1153 with W = 720, so it was briefly off screen to the right. When it lands, `sit` snaps it from about (396, 501) to the new sill (249, 606), a visible teleport of about 150 px.
- **Suspect:** `game/js/world.js:411`. For a pigeon, only `sit` is re-placed. For `fly` / `hop`, re-target `k._bz` with `x1/y1 = sx0/sy0`, and scale `x0/cx` by W/oldW. Cosmetic.

### P3-3 Docs: MECHANICS says a tap on Gigi calls `world.hint()`, but main.js only repeats the prompt
- MECHANICS §1: "`hint()` → window id (manual hint: main calls it on a tap on Gigi / the bubble)".
- `game/js/main.js:415` `repeatPrompt()` never calls `world.hint()`. DESIGN §1 and VOICE.md say "repeat the prompt", and that is what the code does (tested).
- **Fix:** correct the MECHANICS line, or add `world.hint()` if a manual hint is wanted.
- `repeatPrompt` also sets the mood through the alias `world.dee` (`main.js:418`). It works (`dee` is a getter for `gigi`), but `world.gigi` would be clearer.

### P3-4 Project `CLAUDE.md` still describes Dee's Forest Memory
- `projects/education-game/giraffe-city-windows/CLAUDE.md` has the title "Dee's Forest Memory · Vịt Dee Lật Thẻ", namespace `DM`, storage prefix `dm:`, and the VI name "Đi".
- The code uses `GW`, `gw:` and "Gi Gi". A future agent that follows this file would write wrong tests or code.
- **Fix:** rewrite it for Gigi's Peekaboo Windows.

### P3-5 (by design, FYI) A critter tap line is skipped while the round prompt is protected
- `main.js:231` speaks the critter tap reaction only when `canInterrupt()` (300 + 72·len ms of wall time after `speakPrompt`).
- At speed 1 the critter appears ≥ 1.5 s after play starts, which is after the scroll and the peek, so it does not matter in real play.
- At speed ≥ 3 the line is silently dropped. The suite waits out the protection window before it taps.
- No change needed. It is noted so other testers are not surprised.

## Notes for the team
- In the voice log, Vietnamese lines keep "Gigi"; the "Gi Gi" spelling exists only in the TTS text (`Voice.spoken`). This matches VOICE.md §0, and the suite checks both sides.
- The suite drives Gigi, the critters and the windows only through the `GW.debug` hooks in DESIGN §6.6: `cardScreen`, `gigiScreen().body/head` and `critterScreen`. All three hooks give correct CSS rects on all 4 viewports.
- Runtime: about 5 min 45 s on 2 cores. Bot sessions run 5 in parallel; intros run at speed 4, then play is at speed 1 (`startGame(c, speed, fast)` in the suite).
