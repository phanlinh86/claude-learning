# Functional QA report — Pom's Puzzle Town (2026-11-09)

Suite: `tests/e2e/functional.js` (Playwright, Chromium, `isMobile` + `hasTouch` contexts). Every drag, tap and hold is a
**real CDP touch sequence** (`Input.dispatchTouchEvent` → pointer events → `PZ.Input` → `World`); DOM buttons are tapped
with `page.touchscreen.tap`. Prompt/voice checks use a test-only init script that records every `I18N.ask` result and every
`Voice.say` line (game code is not changed). Artefacts: `tests/out/functional/` (screenshots, `results.json`, `run.log`).

```
node tests/e2e/functional.js                       # everything (~8 min; the bot sessions run in parallel)
ONLY=iphone-portrait node tests/e2e/functional.js  # one device, no bot sessions
SKIP_BOT=1 node tests/e2e/functional.js            # all devices, no bot sessions
```

**Result: 63 / 65 passed.** The two failures are the same P3 game bug (B1) on the two devices that run the extra tests.
No console errors, page errors, failed requests or HTTP ≥ 400 responses on any device. No P1 or P2 bugs found.

## Devices
| device | viewport | DPR | tests |
|---|---|---|---|
| iphone-portrait | 393 × 852 | 3 | core + extra |
| iphone-landscape | 852 × 393 | 3 | core |
| ipad-portrait | 820 × 1180 | 2 | core + extra |
| ipad-landscape | 1180 × 820 | 2 | core |

## Pass / fail
| test | what it proves | iPhone P | iPhone L | iPad P | iPad L |
|---|---|---|---|---|---|
| boot_title | boots with zero errors / failed requests; `document.title`; title visible, loading gone; ▶ ≥ 44 px, on screen; tapping ▶ starts a round | PASS | PASS | PASS | PASS |
| drag_correct | asked piece → its shadow: `pickup` + `placed`, state `placed` | PASS | PASS | PASS | PASS |
| drag_wrong | another piece onto the asked shadow: `wrong`, never placed, flies home (`rest`), misses = 1 | PASS | PASS | PASS | PASS |
| near_miss_then_magnet | asked piece on the board far from its zone → `nearMiss` (not a miss), `magnet` on; the next drop at the same far point snaps | PASS | PASS | PASS | PASS |
| drop_outside_home | drop off the board → `home` only, piece back to `rest` | PASS | PASS | PASS | PASS |
| quick_tap | 90 ms tap on a piece → `tapPiece`, nothing judged, no miss | PASS | PASS | PASS | PASS |
| drop_high | release 60 logical px ABOVE the slot's top edge (≈ 105–120 px above its centre) still snaps | PASS | PASS | PASS | PASS |
| second_finger_ignored | a 2nd finger lands on another tray piece, wiggles and lifts: held piece unchanged, 1 pickup, the 1st finger still places | PASS | PASS | PASS | PASS |
| rotate_mid_drag | `setViewportSize` (portrait ↔ landscape) while holding: drag cancelled (no judge event, nothing `held`), all pieces + slots inside the new screen; a new drag places | PASS | PASS | PASS | PASS |
| language_switch | title chip VI → `<html lang=vi>`, logo "Voi Pom", saved; round bubble + voice in VI; Pause → Home → EN restores, bubble English | PASS | — | PASS | — |
| parent_gate | 120 ms tap, `touchscreen.tap`, 1.2 s hold do NOT open settings; 2.3 s hold opens | PASS | — | PASS | — |
| settings_persist | age 6, VI, name "Mầm", volume 40 % kept across reload (state + UI); `?age=3&lang=en` applies but is never saved, even when other settings are changed under it; reload without flags restores 6 / VI | PASS | — | PASS | — |
| count_topic | balloon bunch round (age 4): placed + `count` events ≥ n, the count run ("One, two … balloons") sent to the voice | PASS | — | PASS | — |
| talk_time_tap | Talk screen with 2–3 choices; tapping the right picture → `talkRight` +1, marked; the game moves on to the next chapter | PASS | — | PASS | — |
| pom_and_bubble_repeat | Pom tap (after the 3 s guard) → `pokePom` + the exact prompt again; bubble tap repeats it and never reaches the canvas | PASS | — | PASS | — |
| pause_resume | ⏸ → pause screen, world time frozen; Resume → plays on and repeats the prompt | PASS | — | PASS | — |
| visibility_pause | `visibilitychange` (hidden) while holding a piece → paused, piece released; visible again → stays paused (the late finger lift is ignored); Resume + new drag places | PASS | — | PASS | — |
| audio_chain_volume | after the first tap: master → compressor (threshold ≤ −12, ratio ≥ 2) → user gain 1.6 (loud makeup) → out; Pause − × 3 → 70 %, saved, user gain 1.12; after reload volume 70 %, slider 70, gain 1.12 | PASS | — | PASS | — |
| release_over_hud | carry a piece onto the ⏸ button and let go → `home`, the game is NOT paused | PASS | — | PASS | — |
| soft_taps_hint_assist | 7 taps on empty board (age 3) → `hint`, then `assist` (asked piece flies in, `placed`), no misses | PASS | — | PASS | — |
| url_age_shown | `?age=2 / 4.5 / 9`: the title shows the age that is really played | **FAIL (B1)** | — | **FAIL (B1)** | — |

### Full bot sessions (`?bot=1&speed=8&autostart=1&mute=1`, run in parallel)
Each must reach the done screen (visible), ≥ 12 rounds, ≥ 24 placed, 4 Talk times; every prompt built must reach the voice
in the session language; `PZ.debug.voiceLog` all in that language (VI: > 80 % of lines with Vietnamese letters, EN: none);
then the done screen's **Play again** (odd ages, a 2nd session starts) or **Home** (even ages, title with the stars) is tapped.

| age | lang | device | topics | rounds | placed | wrong | near | hints | talks | prompts → voice | done buttons | result |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | en | iPhone P | colors / shapes / size / animals | 16 | 32 | 4 | 3 | 1 | 4 | 32 / 32 | Play again ✓ | PASS |
| 4 | vi | iPhone L | colors / shapes / count / animals | 16 | 44 | 8 | 0 | 3 | 4 | 44 / 44 | Home ✓ | PASS |
| 5 | en | iPad P | shapes / count / letters / animals | 16 | 47 | 13 | 2 | 4 | 4 | 47 / 47 | Play again ✓ | PASS |
| 6 | vi | iPad L | lower / initial / add / count | 16 | 52 | 21 | 3 | 6 | 4 | 52 / 52 | Home ✓ | PASS |
| 7 | en | iPhone P | initial / add / sub / oddeven | 16 | 52 | 18 | 5 | 5 | 4 | 46 / 46 | Play again ✓ | PASS |

(40–60 s each at speed 8.)

## Game bugs

### B1 — P3: a session-only `?age=` flag outside 3–7 or not an integer is shown raw on the title
- **Repro:** open `…/game/?age=2` → title says "· Age 2", the settings show no age chip lit, but the game plays age-3 content.
  `?age=4.5` → title "· Age 4.5", plays age 5. (`?age=9` is fine: shows "7+", plays 7.) Only reachable through the URL test
  flag, never through the UI — a parent can't hit it, hence P3.
- **Root cause:** `game/js/main.js:26` keeps the raw flag: `let ageOverride = FLAGS.age || null;` and `curAge()` returns it
  to `PZ.UI.setTitleInfo` (`main.js:168, 659`) and to the settings chips (`ui.js:40`, `+c.dataset.age === Math.min(7, age)`),
  while the world normalises it with `PZ.Content.ageOf` (`content.js:120`: round, clamp 3–7) via `world.setAge` (`world.js:324`).
- **Fix:** normalise the flag once, the same way as the world:
  ```js
  let ageOverride = FLAGS.age ? Math.max(3, Math.min(7, Math.round(FLAGS.age))) : null;   // main.js:26
  ```
  (or `PZ.Content.ageOf(FLAGS.age)`). `tests/e2e/functional.js` `url_age_shown` turns green with it.

## Test bugs found and fixed while writing the suite (not game bugs)
- CDP `touchEnd` always lifts **every** finger, so "lift only the 2nd finger" must be a `touchMove` that leaves it out; the
  first version of `second_finger_ignored` lifted both and looked like a lost piece.
- The VI bubble check was case-sensitive ("Mảnh ghép …" starts with a capital).

## Also checked by hand (exploratory probes, all fine)
- Idle: with nobody touching, 5 idle nudges ("Pom is waiting! Your turn! …" + the prompt) and then the game pauses itself.
- Rotation while a piece snaps, while a wrong piece flies home, during the alive phase and during Talk time: everything ends
  inside the new screen, placed pieces stay on their slots, the Talk buttons fit in landscape iPhone (no scrolling).
- A 2nd finger pressing Pom while a piece is held: no `pokePom`, the held piece still places.
- Holding a piece still for 0.9 s and lifting in the tray: `home` (not a tap, no line) — as designed.
- Odd flags `?age=0`, `?age=abc`, `?lang=fr`, `?level=3`, `?level=9` fall back sensibly; no errors.

## Not covered (needs a real device)
Real iOS speech synthesis / recognition (mic answers in Talk time), the touch-event fallback for old iOS without Pointer
Events, the iOS audio session switch to "playback", and Safari's real safe-area insets.

## Fixes applied (2026-11-09, fixer)
- **B1 fixed** — `game/js/main.js`: the session-only `?age=` flag is normalised like the world (`round`, clamp 3–7) before it is
  used: `let ageOverride = FLAGS.age ? Math.max(3, Math.min(7, Math.round(FLAGS.age))) : null;` and the world is created with
  `curAge()`. `?age=2` → "Age 3", `?age=4.5` → "Age 5", `?age=9` → 7, `?age=0` / `?age=abc` → the saved age.
- Re-run after all QA fixes (game logic changed for the playtest / visual reports too): `SKIP_BOT=1 node tests/e2e/functional.js`
  → **60 / 60 passed** (all four devices, including `url_age_shown` and `soft_taps_hint_assist` with the new assist threshold).
  `node tests/unit/run.js` 41 / 41, `i18n_voice.test.js` 50 568 / 0, `puzzle_art.test.js` OK, `tests/e2e/smoke.js` PASS.
- Not re-run: the 5 parallel full bot sessions (`node tests/e2e/functional.js` without `SKIP_BOT`, ≈ 8 min); the headless sim
  (`hs_playtest.js --n 20`, 1 200 sessions, every model done, exit 0) covers full sessions instead.
