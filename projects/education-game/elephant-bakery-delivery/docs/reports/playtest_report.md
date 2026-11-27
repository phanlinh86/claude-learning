# Tupi's Bakery Delivery — high-speed playtest report (2026-11-27)

Playtester (report-only: no game code was changed). New test tools, both in `tests/sim/`:
- **`hs_feel.js`** — headless "driving feel" sim on top of `lib.js`: new child models **lifter** (lifts the finger halfway on every
  drag and presses again where the finger was), **housetap** (only taps houses), **wobbly** (± 30 px wobble, a still pause mid-drag,
  a 70 px swing into the wrong branch at every fork, 80 px overshoot past the door), **straight** (= offroad, drags straight at the
  house) + every existing model. Measures grabs per delivery, stop-short after a lift, turn-rounds while held, fork dither, finger→cart
  road lag, *unmeant* wrong houses (the child meant the right one), dead time, help, stars, Talk time. `--config '{…}'` and
  `--patch releasehouse,commit,aim,graboff` (proposed code changes applied to the world instance only, to measure them first).
- **`hs_touch.js`** — the real page in Playwright with **real CDP touch events** and a scripted child (wobble ± 30 CSS px, pauses,
  fork swing, overshoot, 25 % lift-and-re-press, 15 % wrong picks, Talk answered by tapping the picture button). Records every frame,
  every voice line, every event. `--fakevoice` = real time with a fake `speechSynthesis` (72 ms per character + 250 ms) → which lines
  are cut, when the question ends vs when the cart can be driven.

Runs: `hs_playtest.js --n 10` (535 sessions, **exit 0**) + `hs_feel.js` base (520 sessions) + 17 config / patch variants (≈ 3 000
sessions) + real page: 2 × speed 4, 2 × speed 8, 4 × real-time with voice (iPhone 393×852 portrait, iPad 1180×820 landscape).
Note: the machine was shared with other agents' browsers; frame pacing in the page (p99 120–350 ms) reflects that load, not the game.

## Verdict
**Fun and clear for a 4-year-old — yes.** A typical 4-year-old plays **6.3–6.4 min sessions (p90 6.6–6.8)**, **91–93 s chapters**,
**0 stuck rounds / stuck states / NaN / cart off the road** for every model and age, 74–82 % of rounds with 3★, hints in 5–6 % of
rounds, Talk time 82–90 % right. Dragging feels good: the cart follows the finger with a **26–31 px mean road lag at real time (p90
≈ 60 px)**, never stalls (≤ 0.15 s per session with the finger ahead and the cart still), and a tap-only child (housetap) plays a
complete, slightly faster game. The problems are in **voice pacing at the round end / Talk time**, the **slow 3-year-old's session
length**, and small **driving-feel** rough edges.

## Key numbers (base, `hs_feel` 10 per cell / `hs_playtest` 10 per cell)
| model (age 4) | session min (p90) | chapter s | stars 3/2/1 % | hint % (assist) | wrong / delivery (unmeant) | grabs / delivery (≥ 3 %) | stop-short / delivery |
|---|---|---|---|---|---|---|---|
| typical | 6.4 (6.8) | 92.9 | 74 / 20 / 6 | 6.2 (1.4) | 0.23 (0) | 1.26 (5.5) | 0.03 |
| slow3 (age 3 / 4) | 7.4 / 7.4 (**8.1 / 8.2**, max **9.1**) | 106–111 | 55–62 / 20–23 / 15–23 | 18–30 (6–8) | 0.45–0.49 | 1.6 (23) | 0.01 |
| lifter | 6.3 (6.6) | 90.9 | 77 / 16 / 7 | 7.8 (0) | 0.21 (0) | 2.47 (22) | 0.13 |
| wobbly | 6.3 (6.9) | 91.0 | 75 / 20 / 5 | 6.0 (1.5) | 0.23 (0) | 1.43 (9) | 0.03 |
| straight (drags at the house) | 6.6 (7.3) | 95.5 | 68 / 15 / 17 | 17.6 (6.9) | 0.40 (**0.16**) | **2.04 (27)** | **0.46** |
| housetap | 6.2 (6.7) | 89.5 | 79 / 17 / 5 | 4.9 (0.7) | 0.18 (0) | 0.07 | 0 |
| tapper / spammer | 6.2–6.5 | 90–94 | 28–39 / 24–26 / 37–47 | 58 (39–42) | 0.85–1.08 | 0.5–0.8 | ≤ 0.1 |
| botT0.8 / bot1 | 6.2 / 5.0 | 90 / 71 | 71 / 21 / 8 · 100 / 0 / 0 | 8 / 0 | 0.25 / 0 | 1.06 / 0.86 | 0.15 |

- Every age 3–7: typical session 6.2–6.6 min, chapter 90–95 s, 0 stuck; Talk time 65–98 % right (age 3 lowest), 0 auto-answers for any
  engaged model; absent child: idle nudges at 17, 35, 62, 92, 122, 152 s (as designed).
- **Dead time** (nothing interactive, inside rounds): p90 8–10 s, max 10–15 s — always the round end: right 2.1 s + party 2.4 s + wipe
  → build 1.6 s + load 0.9 s. Build → drivable 2.5–3.4 s; right → next order drivable 4.2–4.8 s. Screen taps still answer (poke / crumbs).
- **Unmeant wrong houses** happen only for the straight-at-the-house model (0.10–0.24 per delivery); 85 % of them while the finger
  itself was nearer the wrong house (its straight line sweeps over a nearer house) — the child really did drive there; hints catch it.
- **Real page (touch)**: 0 console errors in 8 sessions; grabs per delivery 1.14–1.47; the cart turns round at the scripted fork swings
  (expected); on **iPhone portrait 17–22 of 19–25 drags flip Tupi's facing ≥ 2 times** (iPad landscape 2 of 20 at speed 8) — see P3a.
- **Voice (real time, fake TTS)**: 90–102 lines per session, **14–16.5 lines / min, Tupi talks 59–69 % of the session**. The question
  starts 0.6–0.9 s after `ask`, ends 3.7–4.1 s after it (max 7.5 s); the cart is drivable at once (0.02 s), the scripted child acted
  before the question ended in 4–7 of 21–25 asks, and a right answer never cuts the question (it waits) ✓. Lines cut: see P1b / P2.

## Problems and exact changes (prioritised; before → after re-simulated where a config / patch can show it)

**P1a — the slow 3-year-old's session goes past 8 min.** `slow3` p90 8.1–8.2 min, max 9.1 min (skill rule: ≤ 8 min). Its chapters are
already cut after 3 rounds (93–98 %) but its rounds take 30 s.
→ `CONFIG.chapterMinRounds: 3 → 2` (world.js line 27). Re-sim (`hs_feel --n 24 --ages 3,4`): slow3 **p90 7.98 / 7.99 → 7.30 / 7.17 min,
max 9.14 / 8.67 → 7.63 / 7.33**, chapter 108 → 97–100 s; typical 6.45 / 6.35 → 6.37 / 6.33 min, botT0.8 unchanged (6.0 / 6.2) — a
typical child never reaches 75 s after 2 rounds. (`chapterTimeLimit 70` and `shortBudget [∞, 26, 44, 58]` did nothing for slow3.)

**P1b — Talk-time question delayed and cut; "all delivered" said twice per round.** The last right line ends with `right.all` ("Every
treat is delivered!", "All done! Toot toot!"), then the `party` line says "Hooray, all delivered!" ~2 s later; that party line runs into
Talk time, so the Talk question (queued behind it) starts 0.4–3.7 s (mean ≈ 1.8 s) after the Talk screen opens and was **cut in 3 of 8
Talk times** by the child's answer (3–5.5 s in); in rounds it bleeds into the next build.
→ (1) i18n.js `tailLine()` (line 1388): `if (left === 0) return '';` (keep "One more!" / "More to deliver!"); the
party line is the one celebration. (2) main.js `openTalk()`: before `speakPrompt(...)` add `if (BD.Voice.dropTagged) BD.Voice.dropTagged(['party', 'right', 'thanks']);`
and pass `interrupt: BD.Voice.currentTag && BD.Voice.currentTag() === 'party'`. (3) main.js `case 'round'`: `BD.Voice.dropTagged(['party', 'thanks'])`.
Expected (from the logged timings): the Talk question starts ≤ 0.5 s after Talk opens and ends by ≈ 3 s → 0 / 8 cut; ≈ 1.3 s less speech
per round (≈ 17 s per session, talk share ≈ 64 → 59 %). Code change → re-check with `hs_touch.js --fakevoice`.

**P2a — the first-ask teaching line comes too late.** "Put your finger on the cart and drive!" is queued after the 4.8 s first question,
so it starts at 10.0–10.1 s — after the child already grabbed (9.4–9.9 s) in 2 of 2 sessions, and was cut once by the wrong line.
→ main.js `case 'grab'`: add `if (BD.Voice && BD.Voice.dropTagged) BD.Voice.dropTagged('drag');` (the first idle nudge already says the
`drag` line when nothing was grabbed). Expected: 0 late teaching lines; nothing lost for a child who has not grabbed.

**P2b — the long weather line is cut by the chapter's first question** (2 of 8 chapters on iPhone): "Chapter 2. Shape Cookies" (2.0 s)
+ "Sunny summer! Warm sunbeams in the bakery!" (2.9 s) = 5.2 s > the 5.0 s from `level` to the first `ask`.
→ i18n.js `weather.0–3` (EN lines 257–260, VI 472–475): keep only the short variant ("Sunny summer!" / "Mùa hè nắng đẹp!"). Expected:
2.0 + ≤ 1.8 s = 3.8 s < 5.0 s → 0 cut.

**P2c — a lift short of the house after dragging off the road** ("straight" model): 0.46 stop-shorts and 2.04 grabs per delivery, 27 %
of deliveries need ≥ 3 grabs. → world.js `P._release`, right after `if (tap) {…}`: if the finger is on a house (`this._houseAt(finger)`),
`this._autoDrive(thatHouse, 'auto'); return;` (the child pointed at that house). Re-sim `--patch releasehouse` (age 4): **stop-short 0.48 →
0.06, grabs 2.10 → 1.64, ≥ 3 grabs 29 → 16 %, 1★ rounds 16 → 12 %, hint rounds 17.0 → 12.7 %**; typical / wobbly / spammer unchanged
except a few new unmeant wrongs (typical 0 → 0.013, lifter 0 → 0.024 per delivery: a lift halfway over another house's +30 / +60 hit
pad) — use the house art box without the pad for this test.

**P3a — Tupi flips left/right on near-vertical portrait roads.** Facing follows `sign(dir.x)` once |dir.x| > 0.3, so a climbing road
with a small wiggle flips her (with the 8 px hop). → `CONFIG.faceMinX: 0.3 → 0.5`. Re-sim: facing flips on iPhone portrait **bot1 50
→ 26 (−48 %), typical 147 → 115** per 145 / 201 drags; other shapes unchanged; `hs_playtest` with it: exit 0.

**P3b — the cart follows a finger that swings into the wrong branch at a fork and back** (wobbly: fork dither A→B→A in 14.5 % of drags).
→ `CONFIG.grabHyst: 18 → 48`. Re-sim: **dither wobbly 14.5 → 1.7 %, typical 1.7 → 0.5 %; drags with a turn-round typical 50 → 39 %**; cost:
straight unmeant wrongs 0.17 → 0.20 per delivery. Worth it with P2c.

**P3c — round-end dead time 9 s.** → `partyTime 2.4 → 2.0, sprayEnd 2.0 → 1.6, wipeTime 1.3 → 1.1, buildTime 1.6 → 1.3`. Re-sim: dead p90
typical-4 **9.2 → 8.7 s**, lifter 8.6 → 8.2 s, build → drivable 2.8 → 2.5 s; session length unchanged (6.34 → 6.33 min). Optional polish.

Tested and **not** recommended: `projectR 140 → 260` (no measurable effect), "aim at the nearest house when off the road" patch (unmeant
wrongs 0.17 → 0.35), relative grab offset (turn-rounds at the grab 26 → 14 % but first move backwards 7 → 16 %), "knock only when the finger
is at the house" patch (0.17 → 0.15, too small), `chapterTimeLimit 70`, `shortBudget [∞, 26, 44, 58]`.

## Reproduce
```
node tests/sim/hs_playtest.js --n 10 --tag pt_report
node tests/sim/hs_feel.js --n 10 --tag base
node tests/sim/hs_feel.js --n 24 --ages 3,4 --models typical,slow3,botT0.8 --config '{"chapterMinRounds":2}' --tag t_min2
node tests/sim/hs_feel.js --n 16 --ages 3,4,5 --models straight,typical,wobbly,lifter,spammer --patch releasehouse --tag st_rel
node tests/sim/hs_feel.js --n 16 --ages 3,4,5 --models straight,typical,wobbly,lifter --config '{"grabHyst":48}' --tag st_h48
NODE_PATH=$(npm root -g) node tests/sim/hs_touch.js --speed 4          # real touch drags, iPhone portrait + iPad landscape
NODE_PATH=$(npm root -g) node tests/sim/hs_touch.js --fakevoice         # real time, voice pacing (≈ 7 min)
```
Outputs: `tests/sim/out/feel_*.md/.json`, `hs_pt_*.md`, `touch_*.json` (+ `_raw.json` with every voice line and event).
