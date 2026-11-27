# Functional QA — Tupi's Bakery Delivery (2026-11-27)

Report-only: no game code was changed. Suite: **`node tests/e2e/functional.js`** (Playwright Chromium, `isMobile + hasTouch`,
real CDP touch events → pointer events → `BD.Input` → `World`). It takes about 13 min: 17 tests × 4 devices, then 10 bot sessions.
Options: `ONLY=<device>`, `TESTS=a,b`, `SKIP_BOT=1`, `BOT_ONLY=1`, `BOT_SPEED=8`. Output goes to `tests/out/functional/`
(`results.json` + screenshots). The script exits 1 on any failure, including any console or page error, any HTTP ≥ 400 and any missing asset.

Devices: iPhone portrait 393×852 @3 · iPhone landscape 852×393 @3 · iPad portrait 820×1180 @2 · iPad landscape 1180×820 @2.

## Results

| suite | result |
|---|---|
| `node tests/e2e/functional.js` (final run) | **78 / 78 PASS**: 68 device tests + 10 bot sessions (see the table below) |
| `node tests/unit/i18n_voice.test.js` | PASS — 180 821 checks, 0 failed |
| `node tests/unit/house_art.test.js` | PASS — 15 053 checks, 0 failed |
| `node tests/e2e/smoke.js` | PASS: iPhone portrait (bot age 4: 16 rounds, 25 right) and iPhone landscape (bot age 3: 16 rounds) |
| `BD_BOT_N=20 node tests/unit/run.js` | PASS — 34 / 34 tests; 20 bot sessions × ages 3–7, mean session 5.3–6.0 min, max 6.7 min |

### Per-device tests (all 4 devices PASS)

| test | what is checked (real touches) | iPh P | iPh L | iPad P | iPad L |
|---|---|---|---|---|---|
| boot_title | 77/77 assets, 0 console errors / 404s, the title, logo, ▶, no horizontal scroll; a real ▶ tap → play + HUD | ✓ | ✓ | ✓ | ✓ |
| language | EN ↔ VI chips: logo, `<html lang>` and bubble text change (EN has no Vietnamese letters; VI has diacritics); a VI welcome line | ✓ | ✓ | ✓ | ✓ |
| parent_gate | a tap ✗, a 1 s hold ✗, a 2.3 s hold ✓ opens the settings; Done goes back to the title | ✓ | ✓ | ✓ | ✓ |
| settings_persist | age 6, VI, name "Mai", volume 60 %, music off all survive a reload; `?lang=en&age=3` is applied but never saved; every storage key starts with `bd:` | ✓ | ✓ | ✓ | ✓ |
| volume_chain | `BD.debug.audio()`: ctx running, master → compressor (−18 dB, 4:1) → user gain; pause-menu − × 2 → 80 %, gain 1.28, label "80%", restored after a reload | ✓ | ✓ | ✓ | ✓ |
| drag_right | CDP drag along `routeScreen(answer)` → grab, right, deliver; cart ≤ 2 px from its road edge, the art on screen at every sample | ✓ | ✓ | ✓ | ✓ |
| wrong_house | drag to the other house → `wrong` (kind line), `reverse`, back to the fork (s = 0), misses + 1, no fail, interactive again | ✓ | ✓ | ✓ | ✓ |
| drag_offroad | the finger leaves the road (towards a corner, then in a big circle): the cart is 0.00 px off the road the whole time and stays on screen | ✓ | ✓ | ✓ | ✓ |
| tap_cart_honk | a short tap on the cart → `honk` + the question again; no autoDrive, no right or wrong, the cart moves < 4 px | ✓ | ✓ | ✓ | ✓ |
| tap_house_autodrive | a tap on the target house → `autoDrive {houseId}`, cart `auto`, → right | ✓ | ✓ | ✓ | ✓ |
| count_chapter | count topic: 3 `count` events = `cargoCount`; voiceLog "One! Two! Three! Three cookies!"; the bubble names the number; a real drag delivers | ✓ | ✓ | ✓ | ✓ |
| talk_time | bot plays chapter 1 at ×8 and is switched off as Talk opens; a real tap on the answer card → `talkResult`, +1★, back to play | ✓ | ✓ | ✓ | ✓ |
| pause_resume | the ⏸ tap freezes `world.time`; a tap on the dim pause screen reaches no world event; Resume → play, and a drag still delivers | ✓ | ✓ | ✓ | ✓ |
| visibility_pause | mid-drag `visibilitychange` (hidden): the drag is cancelled, mode is paused, audio is suspended; on return the pause menu waits; Resume works | ✓ | ✓ | ✓ | ✓ |
| rotate_mid_drag | the viewport is swapped mid-drag: the drag is cancelled, the stale finger never re-grabs, the cart stays on its road and on screen, every house is on screen, a fresh drag → right | ✓ | ✓ | ✓ | ✓ |
| second_finger | finger 2 is held on the wrong house while finger 1 drags: no autoDrive or soft, the drag survives finger 2 lifting, finger 1 delivers | ✓ | ✓ | ✓ | ✓ |
| hud_bubble_taps | taps on the bubble, HUD stars and dots, plus a drag that starts on the bubble and slides over the cart: 0 world events | ✓ | ✓ | ✓ | ✓ |

### Bot sessions (`?speed=8&bot=1&autostart=1&mute=1&age=N&lang=L`): 10 / 10 reach the done screen

| age | EN | VI |
|---|---|---|
| 3 | ✓ iPh P · 16 rounds, 24 right, 4 talks, 92 lines | ✓ iPh L · 16 rounds, 0/93 VI lines without diacritics |
| 4 | ✓ iPad P · 16 rounds, 27 right | ✓ iPad L · 16 rounds, 6/125 without diacritics (all "Hai!" = two) |
| 5 | ✓ iPh P · 16 rounds, 28 right | ✓ iPh L · 16 rounds, 5/125 (all "Hai!") |
| 6 | ✓ iPad P · 15 rounds, 30 right | ✓ iPad L · 16 rounds, 6/164 (all "Hai!") |
| 7 | ✓ iPh P · 14 rounds, 27 right | ✓ iPh L · 16 rounds, 6/131 (all "Hai!") |

Every bot session ends on the done screen with 0 console errors and 0 missing assets. The voiceLog has no `undefined`, `NaN`, `{`, `}`,
`null` or `[object`, and every line is in the session's language. EN sessions have no Vietnamese letters. No settings record is saved
from URL flags, and all storage keys start with `bd:`. Each session takes 45–56 s of wall time at ×8.

## Bugs (prioritised)

**P0: none. P1: none.** Every core function works with real touches on all 4 shapes.

### P2-1: one tap on the pause menu's Home button ends the session and loses all its stars
- **Repro:** iPad landscape 1180×820. Play to chapter 2 (12 ★ in the HUD), then tap ⏸. The **Home** button is 588×64 CSS px and sits
  in the middle of the screen (x 296–884, y 497–561), right where the cart usually is. One tap on it: mode `title`, the title shows **0 ★**,
  and `bd:progress` is never written. The functional suite first hit this by accident: a test "tap through the pause menu at the cart's
  point" landed on Home (`tests/out/functional/ipad-landscape-FAIL-pause_resume.png` from the first run). A child who keeps tapping where
  the cart was will do the same.
- **At fault:** `game/js/main.js` `bindUI` (`btnHome` click → `goTitle()`). `goTitle()` never adds the session's stars to
  `progress`; only `sessionDone` does.
- **Fix:** make Home a hold-to-confirm button (`BD.Input.holdButton(btnHome, 800, goTitle, …)` with the same ring as the gear), or
  open a 2-step confirmation. Make Resume the big, centred button and Home a small one. In `goTitle()`, when it leaves a session with
  `world.stars > 0`, add those stars to `progress.totalStars` and save it.

### P3-1: the `assist` event says nothing
- VOICE.md §1.1 says `assist` → `t('hint')` (priority). In `main.js` `onEvent`, `case 'assist'` only does `stats.assists++`. After 5
  presses without progress or 3 misses, the cart drives itself with no explanation.
- **Fix:** `case 'assist': stats.assists++; speak(T('hint'), { priority: true }); break;`

### P3-2: aimless scribbling counts as a wrong delivery
- **Repro (drag_offroad):** grab the cart and circle the finger over empty table. The finger stays within roadW/2 + 140 px of a branch,
  and the release is past 80 % of that branch, so the cart auto-rolls into a house. On iPhone portrait, iPad portrait and iPad
  landscape this made a `wrong` (a miss) for a child who never chose a house. The cart itself never leaves the road (this part is correct).
- **At fault:** `game/js/world.js` `P._release` (auto-roll past `autoRollFrac`) together with the generous `projectR`.
- **Fix:** auto-roll on release only if the finger's last point was within about roadW of the road. Or do not count a miss
  when the arrival comes from an auto-roll after the finger was far off the road. Only the hint and star logic would change.

### P3-3: leftovers from the river game in comments and names
- `game/js/audio.js` header and `BROOK`/"brook" ambience comments (Nim, stones, fish, frog), `game/index.html` "Nim's speech bubble",
  `game/css/style.css` header "Nim's River Hop … Nim on the bank", `game/js/assets.js` mentions `river_art.js`, `tests/e2e/serve.js`
  header. There is no functional effect. The ambience node is still a band-passed noise with a 0.6 Hz wander ("babbling water").
  The audio reviewer should listen and confirm it sounds like an oven hum and not a brook.
- **Fix:** update the comments, rename `BROOK` → `HUM`, and lower the wander depth if it still sounds like water.

### Notes (not bugs)
- The first honk often logs only the question again, without "Toot! Toot!", because the prompt guard is active (VOICE §1.1 rule 4).
  This is by design. The trumpet sound still plays.
- The bubble shows CAPS emphasis ("the BLUE house", "màu TÍM"). VOICE says this is intended, and `speech()` lowers it for the TTS.
- In VI, the only lines without diacritics are "Hai!" (two), which is correct Vietnamese.
- CDP note for future tests: `Input.dispatchTouchEvent` `touchEnd` lists the points that **lift**. The first version of
  second_finger lifted finger 1 by mistake. That gave a false failure on iPad landscape, which is now fixed in the test.
