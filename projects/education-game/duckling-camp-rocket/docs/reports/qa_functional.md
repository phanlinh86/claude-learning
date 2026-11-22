# Functional QA report: Mimi's Splash Rocket (2026-11-22)

**Tester:** functional QA agent. This is a report only: no `game/` file was changed.
**New probe suite:** `tests/qa/qa_functional.js`. Run it with `node tests/qa/qa_functional.js`, or `PROBES=pause_in_pump,… node tests/qa/qa_functional.js` for a subset. It has 37 device probes plus 4 monitored bot sessions. The contexts are Playwright `isMobile/hasTouch` at iPhone 393×852 @3, 852×393 @3, iPad 820×1180 @2 and 1180×820 @2. Every finger is a real CDP `Input.dispatchTouchEvent` touch, so it goes through pointer events, then `DK.Input`, then `World`. Results are saved to `tests/out/qa/results.json`.

## Summary

| suite | result |
|---|---|
| `node tests/unit/run.js` | **33/33 pass** (82 s) |
| `node tests/unit/i18n_voice.test.js` / `mat_art.test.js` | 90 347 pass / 15 110 pass |
| `node tests/e2e/smoke.js` | **PASS** on both devices: iPhone portrait age 4 (15 rounds, 30 launches) and iPhone landscape age 3 (16 rounds, 32 launches) |
| `tests/qa/qa_functional.js` | **39/41 pass.** 2 real findings (P2-1, P3-1). Probe races and CPU-load flakes were re-run one at a time, and they pass. |
| `node tests/e2e/functional.js` (full) | **86/86 pass** (901 s). An earlier run had `auto_pump` fail (see P3-5, flaky) before the browser was killed by an unrelated shell timeout. |

**No P1 found.** Every edge case below was harmless, except P2-1. That covers: taps during unfold, aim, flight, collect, camp and wipe; spamming the pump 10 times; tapping the pump before choosing a mat; a long press; two-finger taps; taps at the screen edges and the notch; rotating during the pump, the camp and Talk time; a hidden page mid-flight; and the bot sessions at ages 3/5/6/7. In these there were no console errors, no NaN, no stuck state, stars never went down, and nothing was judged by mistake.

---

## P1: broken, stuck or wrong for a child
None.

## P2: noticeable

### P2-1: After Resume in the pump phase, Mimi pumps by herself almost at once
- **Repro:** start a round, tap the right mat, wait about 2–3 s in the pump phase without stomping, tap ⏸ Pause, wait any time, tap ▶ Resume. Probe: `PROBES=pause_in_pump`.
- **Observed:** the pump phase started at t = 5.27 and was paused 2.74 s later. On resume, Mimi's first **auto** stomp ("I'll help! / Let me pump! One!") came **0.11 s after Resume**. Resume also says "Tap, tap, tap to pump!" at the same moment. On top of that, canvas input is blocked for 250 ms after Resume (`blockInput`). So the child is told to pump but never gets a chance. The same happens after a `visibilitychange` pause (switching apps, then Resume).
- **Good:** nothing fires *while* paused (5 s paused: 0 pump events), because the world is not updated in mode `paused`.
- **Expected:** a returning child gets the full 3 s pump window again (DESIGN: "Mimi pumps by herself after 3 s *without a kid press*").
- **Suspect:** `World.resetNudges()` (`game/js/world.js` ~l.1243) resets the idle and Talk timers but not the pump timer. `_stepPump` measures `t − max(S.start, S.kid)`. Fix idea: in `resetNudges`, `if (this._pumpS) this._pumpS.kid = this.time;` (main.js `resume()` already calls `resetNudges`).

## P3: polish

### P3-1: "2 misses → hint" is skipped when the 2nd miss lands in the 1 s gap between the end of a hint's glow and the end of its cooldown
- **Repro (deterministic, in-page):** `w._autoHint(true)` (as the 2nd idle nudge does at +30 s). After 3.9 s, tap wrong mat A. After 1.3 s more, tap wrong mat A again. Now t − lastHint ≈ 5.2–5.65 s: the glow (5 s) is over and the cooldown (6 s) is still on.
- **Observed:** `misses` = 2, no `hint` event, and nothing glows afterwards (checked 0.5 s later). The 2-miss hint is never retried. Only a 3rd miss or the next idle nudge brings it.
- **Expected:** after 2 misses the right mat glows (skill rule, MECHANICS §4 help).
- **Suspect:** `World._autoHint` (`hintCooldown 6` > `hintTime 5`). Fix idea: let a *miss*-triggered hint ignore the cooldown, or set `hintCooldown ≤ hintTime`.
- The window is narrow (≈ 1 s after each hint), so a typical child rarely hits it. The sims' "0 × 2 misses without a hint" holds only because the bot never times its taps into this window.

### P3-2: Random or edge taps quickly let the assist answer for the child (by design; noting it)
- **Repro:** `PROBES=edge_taps`. Ten taps around the screen edges (corners, the notch row, side midpoints).
- **Observed (all 4 devices):** soft ×3 → `hint`, soft ×5 → `assistArmed`. The next tap on the meadow, e.g. (30, 426) at the left edge on iPhone, becomes `assist` + `right`, and the rocket launches. None of the 10 edge taps paused the game, hit the pump, or caused an error. On iPhone, (197, 30) lands on the HUD stars pill; on iPad landscape, (590, 30) lands on the bubble (repeats the question).
- **Note:** this follows the help rules, and the round is capped at 2★ (`assisted_round` passes on both devices). But a child smacking at random gets a launch about every 6 taps. If that is too generous, consider counting no-progress soft taps at most once per ~0.9 s, the way repeated wrong taps already are (`repeatNoProgress`).

### P3-3: Tapping the same wrong mat over and over gives fewer misses than "one per second"
- **Repro:** `PROBES=same_wrong_repeat`. 8 taps on one wrong mat, about 0.25 s apart.
- **Observed:** over 5.1 s of game time: 1 wrong + 7 squish, misses 1 (iPad landscape: 6.5 s → 2). `m._lastWrongT` is refreshed on every repeat (`World._wrong`), so the 1 s window *slides*: steady drumming counts one miss in total. No-progress still counts once per 0.9 s, which led to hint + assistArmed.
- This is kinder than the spec and not harmful. Change it only if "one miss per second" is meant literally: don't update `_lastWrongT` in the squish branch.

### P3-4: A finger resting on the grass stops the idle nudges
- **Repro:** `PROBES=long_press`. Hold one finger still on open grass for about 18 s of game time.
- **Observed:** only a `soft` event, and no `idle` nudge at 12 s. `_stepRound` advances `_idleT` only when `!this._g`. A child resting a palm on the iPad hears nothing. Low priority, because a lifted finger restarts the schedule.

### P3-5: Flaky e2e check `auto_pump` (a test bug, not a game bug)
- `tests/e2e/functional.js` `T.auto_pump` checks `/help/i`, but `i18n.js` `pumpAuto` has 3 EN variants: 'I'll help!', 'Mimi will help! Stomp!', **'Let me pump!'**. About 1 run in 3 fails ("Let me pump! One! | Two! | Three! Blast off!" was the observed failure). Fix the regex to `/help|let me pump/i` (VI: `/giúp|để mimi bơm/i`).

---

## Edge-case probes that passed (observed values)

| probe | devices | result |
|---|---|---|
| taps during **unfold** (first launch and the 2nd launch's unfold) | iPhone P, iPad L | 0 right/wrong, misses unchanged; mats squish `early` |
| taps during **aim / flight / collect / camp / wipe** (every mat + the pump) | iPhone P, L | 0 wrong / 0 extra stomp. Phases hit: aim, flight, collect, unfold, camp, roundDone/camp, roundDone/wipe. (Two FAILs on the first run were probe races: the next launch's mats become live during collect. Re-run with a phase check before every tap: pass.) |
| **pump spam** 10 taps fast | iPhone P, iPad P | exactly 3 stomps `1,2,3` (none auto), 1 launch, the rest `merged`; lands on the mat |
| **pump before choosing a mat** (2 taps on the pump) | iPhone P | `soft, soft`; no stomp, launch or miss |
| **long press** on the right mat 2.5 s (held into the pump phase) | iPhone P | one `right`; a stomp right after lifting counts |
| **hint after 2 misses** (two different wrong taps, 1.3 s apart) | iPhone P, L | `hint` on the right mat, its `_glowT` > 0, the hint hand on it, no other mat glows; tapping it → right |
| **two fingers at once** (wrong + right mats) outside the pump | iPhone P, iPad P | exactly one judgement (the primary finger: wrong); the second finger is ignored |
| **rotate during the pump** (after stomp 1) | iPhone P, iPad L | stays in pump; stomps 2, 3 count; lands on the re-laid mat, err ≤ 2 px; no NaN |
| **rotate during camp, then during Talk time** | iPhone P, iPad P | nothing off screen, no NaN, pennants on the pole; Talk stays open, every choice inside the viewport, answer by tap works |
| **visibilitychange during flight** | iPhone P, iPad L | paused at once, world time and rocket frozen for 1.5 s, still paused when visible; Resume → lands on the mat (err ≤ 2 px) |
| **pause / resume**, then tap 400 ms later | iPhone L | counted (the 250 ms block is short enough) |
| **language switch** on the title, then Play | iPhone P | welcome line in VI; every voiceLog line `lang vi` with VI diacritics; `dk:settings.lang = vi` |
| **parent gate** | iPhone P, iPad L | a short tap, 5 quick taps, a 1.3 s hold, and a hold that slides off the gear do NOT open; a 2.3 s hold opens (while still held). One FAIL on the first run was CPU load under 3 parallel workers (touchEnd arrived late); a solo re-run passes on both devices |
| **settings persistence** (age 6, music off, name "Bông") across reload | iPad P | kept. With `?lang=vi&age=3` the title shows VI / age 3; a volume change in the pause menu saves volume 0.9 but **not** vi / 3 |
| `?age=6` session-only | iPhone P | `world.age = 6` |
| **idle nudges back off** | iPhone P | +12, +30, +57, +87, +117 s after the ask (exactly MECHANICS); hints from the 2nd; auto-pause after the 5th |
| **Talk time re-ask** (no answer) | iPhone P | re-asks at +12, +24, +36 s; the glow first appears at +24.7 s (after the 2nd); Mimi answers by herself at +38.0 s (`auto`, not counted as right); then only the kind line "It is green! Good try!", silent after the 3rd |
| Talk: 4× wrong choice then the right one | iPhone L | one `talkResult` only (wrong), no star |
| **assisted round** (5 soft taps → assist → finish by taps) | iPhone P, iPad L | `roundDone {assisted: true, stars: 2}`, total stars + 2 |
| **bot sessions to sessionDone** (speed 10, NaN scan + star monitor every 250 ms) | age 3 EN iPhone P · 5 VI iPhone L · 6 EN iPad P · 7 VI iPad L | 16 / 14 / 13 / 15 rounds; stars 45 / 35 / 38 / 41 = Σ round stars + Talk; stars never went down; 0 NaN; 0 stuck; 0 console errors; every voice line in the session language, no raw keys |

## Full `tests/e2e/functional.js`
86/86 passed in 901 s: 4 devices × the CORE + EXTRA tests, plus 10 bot sessions (ages 3–7 × EN/VI). The only failure seen across two runs was `auto_pump` on iPhone portrait in run 1. It is the regex flake in P3-5.
