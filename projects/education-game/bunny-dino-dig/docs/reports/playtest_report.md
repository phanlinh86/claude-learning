# Bun's Dino Dig — high-speed playtest report (2026-11-08)

Owner: high-speed playtester (report-only; no game code was changed). Build: `26fb04a` (first integrated build).

## 1. Method

| what | how |
|---|---|
| Headless sessions | **New** `tests/sim/hs_kids.js` (extends `hs_playtest.js`; same loader, same `Finger` → `pointerDown / pointerMove / pointerUp`, 1/30 s frames, 5 viewports iPhone P/L, iPad P/L, iPad Air, EN/VI alternating). Baseline: **6 000 full sessions** = 12 models × ages 3–7 × 100 (`--tag base`, 1 017 s). Re-sims: 14 800 more sessions on the same seeds (so every before/after row is the same children on the same rounds). |
| Child models | `typical` (lib.js profiles per age) · `slow3` (slow 3-year-old, lib.js) · **`slowOnce`** (slow 3-year-old who taps ONCE and waits: think 3–7 s, never taps along) · **`high`** (taps what it sees: 40 % on the top quarter of the peeking thing, 35 % 0–40 px above its tip, 25 % 40–90 px above) · **`sandOnly`** (only ever taps empty sand in the dig site) · **`shelfBun`** (35 % of taps on the shelf, 15 % on Bun) · `tapper` (random) · `spammer` (6 taps/s) · `perfect` · `bot0.5 / bot0.8 / bot1` (`DD.Bot`). |
| Per-step metrics | first tap after an ask (dug the answer / empty sand / other), first dig right, ask → first dig, **tap → judgement** (dig start → `found`/`wrong`, split "alone" vs "tapping along"), hint / assist rounds, stars, chapter & round durations, stuck (> 120 s round or 200 s without a state change). |
| Speech model | `SpeechSim` in `hs_kids.js` re-implements **main.js `onEvent` speech policy line by line** (protected prompt `promptUntil = 6 s + 72 ms/char` until it starts, `found` interrupts, count words queue, wrong ≥ 1.5 s apart, praise ≥ 1.2 s apart, `already` ≥ 3 s, hatch only when quiet, idle ≤ 4, pokeBun repeat > 3 s) and the **voice.js queue** (1 speaking + ≤ 2 waiting, oldest non-priority dropped, non-priority stale after 5 s, interrupt = flush + cancel + 90 ms). Durations: 250 ms start latency + `I18N.speech()` text × 72 ms/char (EN) / 78 ms/char (VI) at rate 0.9. Lines are generated with the real `DD.I18N` (`ask`, `sayFound`, `sayWrong`, `sayCount`…). |
| Real page | **New** `tests/sim/hs_voicelog.js`: Playwright, `?speed=8&bot=1&mute=1`, one full session per age 3–7 × EN/VI (10 sessions), wraps `DD.Voice.say` to record every line with the world clock + options, checks for `undefined / null / NaN / {…} / [object`, English words in VI lines, VI lines without diacritics, Vietnamese in EN. `DD.debug.voiceLog` length checked against it. |
| Sim-only proposals | `--config` (CONFIG keys), `--patch topPad=N` (copy of `World._moundAt` with a thing-box top pad of N px instead of the hard-coded 8), `--patch noRepeat` (wraps `Content.makeRound`: the first find step never repeats the previous round's answer), `--patch countScoops2` (count rounds dig in 2 scoops), `--voice '{…}'` (speech-policy variants). None of these touch `game/`. |

Commands: `node tests/sim/hs_kids.js --n 100 --tag base` · `node tests/sim/hs_kids.js --n 100 --config '{"assistAfter":4}' --patch topPad=40,noRepeat --voice '{"noRepeatWhileSpeaking":1}' --tag final` · `NODE_PATH=$(npm root -g) node tests/sim/hs_voicelog.js` · `node tests/sim/hs_playtest.js --n 60 --config '{"assistAfter":4}' --tag assist4`. Output: `tests/sim/out/kids_<tag>.md` (+ git-ignored JSON).

## 2. Headline

- **0 stuck rounds, 0 stuck states, 0 NaN, 0 failed sessions in 23 220 headless sessions** (20 800 `hs_kids` + 2 420 `hs_playtest`); longest round anywhere 116 s (random tapper, age 6); 0 broken lines among every line the speech model generated with the real `DD.I18N`. All 10 real-page sessions finished with 0 page errors.
- **Pace is on target.** Typical child: chapter 66 s (age 3) / 75 s (age 4) / 78–86 s (5–7), session 4.5–5.8 min (p90 ≤ 6.1). Slow 3-year-old: 88 s (age 3) / 98 s (age 4), session p90 6.5 / 7.2 min. Every model ≤ 8 min p90 at ages 3–4 except the sand-only 4-year-old (8.0).
- **Digging speed is right for a 4-year-old:** tap → judgement 2.07 s with one tap (3 scoops), 1.74 s when tapping along; 1.50 / 1.20 s at age 3 (2 scoops). The spec's "3 scoops ≈ 2 s" holds; a child who taps once and waits (`slowOnce`) is never left without feedback longer than that.
- **Speech never gets out of hand:** 18–19 lines asked / min (15–17 heard) for a typical child, prompt starts 0.14–0.31 s after the ask (p90 ≤ 1.1 s), prompts cut ≤ 3 % for ages 3–4, 90 %+ of "That's a blue egg…" lines are heard at least to the first sentence. Real page EN + VI: **0 broken lines, 0 English in Vietnamese**.
- Main issues: (P1) taps on/just above the peeking egg tip often count as empty sand; (P2) the same answer is asked twice in a row 17–25 % of the time at ages 3–4; (P2) a child who never hits a mound needs 6 empty taps per step → chapters up to 2.5 min (p90 159 s at age 4); (P2) tapping Bun mid-prompt makes Bun restart her own sentence; plus P3 notes.

## 3. Baseline tables (6 000 sessions, `kids_base`)

### 3.1 Pace, help, stars

| model | age | session min (p90) | chapter s mean [p10–p90] | round s (p90 / max) | stuck | stars 3/2/1 % | wrong / round | 1st tap digs the answer % | 1st tap on empty sand / soft % | ask → 1st dig s | tap → judged s (alone / tapping along) | hint rounds % | assist rounds % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 4.5 (4.8) | 65.8 [56.7–77.1] | 12.2 (17.8 / 38.6) | 0 | 70/28/2 | 0.32 | 62.2 | 9.8 | 5.8 | 1.50 / 1.20 | 5.6 | 0.0 |
| typical | 4 | 5.1 (5.4) | 74.8 [59.5–91.9] | 14.5 (21.8 / 44.4) | 0 | 85/14/1 | 0.16 | 75.0 | 6.2 | 5.2 | 2.07 / 1.74 | 2.1 | 0.0 |
| typical | 5 | 5.8 (6.1) | 85.9 [77.7–97.1] | 17.2 (24.7 / 41.9) | 0 | 82/15/3 | 0.22 | 78.5 | 3.2 | 4.7 | 2.07 / 1.74 | 2.9 | 0.0 |
| typical | 6 | 5.7 (6.0) | 84.1 [75.8–95.3] | 16.8 (24.4 / 39.3) | 0 | 87/11/2 | 0.14 | 82.1 | 4.6 | 4.5 | 2.07 / 1.74 | 1.6 | 0.0 |
| typical | 7 | 5.3 (5.5) | 77.9 [69.9–85.7] | 15.2 (19.8 / 33.6) | 0 | 83/15/2 | 0.19 | 82.5 | 4.9 | 4.3 | 2.07 / 1.74 | 1.7 | 0.0 |
| slow3 | 3 | 6.0 (6.5) | 87.6 [74.8–100.4] | 18.2 (28.7 / 53.2) | 0 | 59/36/5 | 0.46 | 48.4 | 15.6 | 9.5 | 1.50 / 1.23 | 11.5 | 0.0 |
| slow3 | 4 | 6.6 (7.2) | 97.6 [82.9–116.9] | 23.1 (38.8 / 80.0) | 0 | 68/23/9 | 0.42 | 49.8 | 14.9 | 9.8 | 2.07 / 1.82 | 14.5 | 0.0 |
| slow3 | 5 | 7.5 (8.3) | 110.6 [90.5–134.4] | 30.7 (50.3 / 103.0) | 0 | 57/20/22 | 0.70 | 47.8 | 15.4 | 9.7 | 2.07 / 1.82 | 26.2 | 0.2 |
| slow3 | 6 | 7.7 (8.5) | 113.3 [92.6–136.8] | 31.5 (52.2 / 104.3) | 0 | 58/19/23 | 0.72 | 44.8 | 15.3 | 9.8 | 2.07 / 1.82 | 25.4 | 0.1 |
| slow3 | 7 | 7.6 (8.3) | 112.7 [91.1–134.3] | 31.5 (49.8 / 83.1) | 0 | 40/32/28 | 0.97 | 43.5 | 17.1 | 9.9 | 2.07 / 1.82 | 30.3 | 0.3 |
| slowOnce | 3 | 6.1 (6.5) | 90.3 [78.1–103.0] | 18.9 (29.4 / 52.3) | 0 | 58/38/4 | 0.46 | 45.1 | 19.6 | 10.1 | 1.50 / — | 12.0 | 0.0 |
| slowOnce | 4 | 6.7 (7.2) | 98.0 [84.2–115.0] | 23.3 (38.3 / 73.2) | 0 | 66/23/11 | 0.46 | 46.2 | 16.4 | 10.0 | 2.07 / — | 15.4 | 0.0 |
| slowOnce | 5 | 7.6 (8.3) | 112.4 [92.5–134.2] | 31.5 (52.2 / 85.7) | 0 | 57/20/23 | 0.70 | 45.0 | 16.9 | 10.1 | 2.07 / — | 24.8 | 0.1 |
| slowOnce | 6 | 7.9 (8.7) | 116.9 [95.6–139.2] | 32.9 (53.7 / 104.3) | 0 | 57/20/23 | 0.72 | 44.1 | 17.9 | 10.4 | 2.07 / — | 26.1 | 0.0 |
| slowOnce | 7 | 7.8 (8.7) | 115.2 [92.7–141.6] | 32.4 (50.2 / 94.2) | 0 | 38/34/29 | 1.00 | 43.7 | 17.0 | 10.2 | 2.07 / — | 31.8 | 0.4 |
| high | 3 | 5.1 (5.5) | 75.2 [61.9–88.0] | 14.7 (22.7 / 53.3) | 0 | 75/24/1 | 0.26 | 31.4 | 52.3 | 7.8 | 1.50 / 1.20 | 40.4 | 3.4 |
| high | 4 | 5.7 (6.1) | 83.5 [65.9–101.7] | 17.2 (28.4 / 61.0) | 0 | 83/15/2 | 0.20 | 36.6 | 48.3 | 7.0 | 2.07 / 1.77 | 40.1 | 3.6 |
| high | 5 | 6.4 (6.8) | 94.8 [83.8–107.7] | 20.3 (30.3 / 59.1) | 0 | 77/18/5 | 0.28 | 41.2 | 43.9 | 5.9 | 2.07 / 1.77 | 46.2 | 6.7 |
| high | 6 | 6.4 (6.8) | 94.6 [83.6–106.5] | 19.9 (29.3 / 47.6) | 0 | 80/17/4 | 0.25 | 40.7 | 44.6 | 5.7 | 2.07 / 1.77 | 45.7 | 6.1 |
| high | 7 | 6.1 (6.4) | 89.2 [80.6–99.5] | 18.3 (25.7 / 52.7) | 0 | 76/20/5 | 0.29 | 41.3 | 46.3 | 5.5 | 2.07 / 1.79 | 48.2 | 9.3 |
| sandOnly | 3 | 6.5 (6.9) | 95.1 [83.1–107.5] | 23.8 (31.9 / 58.5) | 0 | 96/4/0 | 0.04 | 0.4 | 98.8 | 18.0 | 1.50 / 1.20 | 98.7 | 95.5 |
| sandOnly | 4 | 7.4 (8.0) | 109.3 [85.2–159.0] | 29.0 (49.9 / 109.6) | 0 | 95/5/0 | 0.05 | 0.5 | 98.3 | 15.7 | 2.07 / 1.74 | 99.2 | 98.1 |
| sandOnly | 5 | 7.1 (7.5) | 105.0 [89.4–131.7] | 30.0 (43.3 / 83.9) | 0 | 94/6/0 | 0.06 | 0.3 | 98.6 | 11.8 | 2.07 / 1.75 | 99.8 | 99.0 |
| sandOnly | 6 | 6.9 (7.4) | 102.2 [85.6–130.5] | 29.0 (43.1 / 95.3) | 0 | 93/6/0 | 0.07 | 0.4 | 98.1 | 10.9 | 2.07 / 1.75 | 99.9 | 99.4 |
| sandOnly | 7 | 6.4 (6.8) | 93.5 [83.0–106.5] | 25.7 (34.9 / 59.2) | 0 | 90/10/0 | 0.10 | 0.4 | 97.8 | 10.3 | 2.07 / 1.74 | 99.8 | 99.4 |
| shelfBun | 3 | 5.3 (5.9) | 77.8 [64.0–91.5] | 15.4 (24.3 / 68.6) | 0 | 69/29/3 | 0.34 | 29.6 | 7.6 | 8.1 | 1.50 / 1.20 | 5.1 | 0.0 |
| shelfBun | 4 | 5.7 (6.2) | 83.8 [66.2–100.0] | 17.7 (30.4 / 58.1) | 0 | 84/13/2 | 0.18 | 38.1 | 4.8 | 7.3 | 2.07 / 1.74 | 3.7 | 0.0 |
| shelfBun | 5 | 6.5 (6.8) | 95.0 [83.8–107.5] | 20.6 (31.0 / 69.2) | 0 | 83/13/4 | 0.21 | 39.4 | 3.6 | 6.2 | 2.07 / 1.74 | 3.8 | 0.0 |
| shelfBun | 6 | 6.4 (6.8) | 93.7 [82.8–106.8] | 19.9 (29.8 / 59.1) | 0 | 88/11/1 | 0.13 | 40.8 | 3.9 | 6.0 | 2.07 / 1.74 | 1.7 | 0.0 |
| shelfBun | 7 | 6.0 (6.3) | 87.8 [78.7–97.4] | 17.9 (25.5 / 44.5) | 0 | 84/14/2 | 0.18 | 43.5 | 3.6 | 5.7 | 2.07 / 1.75 | 1.9 | 0.0 |
| tapper | 3 | 6.2 (6.5) | 91.5 [82.0–101.9] | 19.6 (24.7 / 51.0) | 0 | 70/28/3 | 0.33 | 5.1 | 80.5 | 12.0 | 1.50 / — | 89.5 | 73.4 |
| tapper | 4 | 6.5 (6.9) | 95.8 [83.2–111.7] | 23.2 (38.0 / 60.2) | 0 | 66/27/7 | 0.42 | 4.9 | 78.1 | 9.8 | 2.07 / 1.78 | 91.0 | 68.9 |
| tapper | 5 | 7.1 (7.6) | 104.3 [90.8–117.2] | 29.5 (41.5 / 94.7) | 0 | 53/29/17 | 0.66 | 3.7 | 73.4 | 9.1 | 2.07 / 1.78 | 94.9 | 82.6 |
| tapper | 6 | 7.1 (7.7) | 105.1 [91.6–120.8] | 29.9 (43.0 / 116.1) | 0 | 53/29/18 | 0.70 | 4.9 | 72.0 | 8.9 | 2.07 / 1.78 | 95.5 | 84.7 |
| tapper | 7 | 7.0 (7.5) | 103.9 [90.9–117.5] | 29.4 (40.7 / 61.1) | 0 | 38/38/25 | 0.92 | 4.3 | 73.4 | 8.8 | 2.07 / 1.79 | 96.7 | 89.9 |
| spammer | 3 | 4.0 (4.2) | 58.5 [52.0–65.9] | 10.4 (12.9 / 21.8) | 0 | 45/46/9 | 0.65 | 34.8 | 20.5 | 3.8 | 1.50 / 1.18 | 32.0 | 0.9 |
| spammer | 4 | 4.7 (5.0) | 69.3 [59.3–78.9] | 13.0 (19.1 / 28.0) | 0 | 48/28/24 | 0.80 | 26.9 | 18.4 | 3.6 | 2.07 / 1.71 | 39.9 | 2.3 |
| spammer | 5 | 5.8 (6.0) | 85.4 [76.5–94.8] | 17.0 (23.7 / 32.3) | 0 | 35/18/47 | 1.33 | 20.2 | 16.6 | 3.6 | 2.07 / 1.74 | 56.7 | 13.0 |
| spammer | 6 | 6.0 (6.3) | 88.1 [77.6–98.9] | 17.8 (25.3 / 35.5) | 0 | 35/14/51 | 1.59 | 18.1 | 18.0 | 3.4 | 2.07 / 1.75 | 61.3 | 19.6 |
| spammer | 7 | 5.9 (6.3) | 87.0 [74.8–98.6] | 17.5 (24.7 / 33.9) | 0 | 13/25/63 | 1.96 | 17.0 | 16.4 | 3.3 | 2.07 / 1.74 | 72.4 | 22.8 |
| perfect | 3 | 3.3 (3.5) | 48.1 [44.5–51.8] | 8.5 (9.1 / 15.1) | 0 | 100/0/0 | 0.00 | 100.0 | 0.0 | 3.6 | 1.50 / 1.18 | 0.0 | 0.0 |
| perfect | 4 | 4.0 (4.2) | 58.0 [50.3–68.2] | 11.0 (15.4 / 18.6) | 0 | 100/0/0 | 0.00 | 100.0 | 0.0 | 3.6 | 2.07 / 1.62 | 0.0 | 0.0 |
| perfect | 5 | 4.7 (4.8) | 69.3 [66.8–74.8] | 13.8 (16.1 / 23.6) | 0 | 100/0/0 | 0.00 | 100.0 | 0.0 | 3.6 | 2.07 / 1.62 | 0.0 | 0.0 |
| perfect | 6 | 4.8 (4.9) | 70.0 [67.2–76.0] | 14.0 (17.6 / 23.4) | 0 | 100/0/0 | 0.00 | 100.0 | 0.0 | 3.6 | 2.07 / 1.62 | 0.0 | 0.0 |
| perfect | 7 | 4.5 (4.6) | 65.9 [58.9–69.2] | 13.0 (15.7 / 16.4) | 0 | 100/0/0 | 0.00 | 100.0 | 0.0 | 3.6 | 2.07 / 1.62 | 0.0 | 0.0 |
| bot0.5 | 3 | 3.3 (3.5) | 47.3 [41.2–53.9] | 8.3 (11.4 / 15.7) | 0 | 50/43/7 | 0.57 | 52.2 | 0.0 | 1.8 | 1.50 / 1.13 | 7.1 | 0.0 |
| bot0.5 | 4 | 4.1 (4.3) | 59.1 [48.5–71.4] | 11.2 (17.0 / 22.0) | 0 | 57/26/17 | 0.60 | 51.7 | 0.0 | 1.8 | 2.07 / 1.52 | 16.1 | 0.0 |
| bot0.5 | 5 | 5.0 (5.2) | 72.5 [63.7–81.5] | 14.5 (20.8 / 30.3) | 0 | 48/20/32 | 0.87 | 53.3 | 0.0 | 1.8 | 2.07 / 1.52 | 25.7 | 0.0 |
| bot0.5 | 6 | 5.1 (5.3) | 74.3 [64.6–83.4] | 15.0 (22.5 / 30.1) | 0 | 47/19/34 | 0.94 | 51.1 | 0.0 | 1.8 | 2.07 / 1.52 | 29.0 | 0.0 |
| bot0.5 | 7 | 4.9 (5.3) | 71.9 [62.3–81.1] | 14.4 (19.9 / 27.4) | 0 | 30/31/39 | 1.20 | 51.2 | 0.0 | 1.8 | 2.07 / 1.52 | 33.7 | 0.0 |
| bot0.8 | 3 | 2.9 (3.1) | 42.2 [37.8–47.2] | 7.0 (9.7 / 14.6) | 0 | 77/22/1 | 0.24 | 78.7 | 0.0 | 1.6 | 1.50 / 1.13 | 1.1 | 0.0 |
| bot0.8 | 4 | 3.6 (3.9) | 52.3 [42.2–67.0] | 9.5 (14.8 / 21.9) | 0 | 83/14/3 | 0.21 | 80.9 | 0.0 | 1.5 | 2.07 / 1.52 | 2.8 | 0.0 |
| bot0.8 | 5 | 4.3 (4.5) | 62.6 [53.7–75.8] | 12.1 (18.2 / 27.6) | 0 | 75/19/7 | 0.33 | 79.1 | 0.0 | 1.5 | 2.07 / 1.52 | 5.4 | 0.0 |
| bot0.8 | 6 | 4.4 (4.5) | 63.4 [53.7–78.6] | 12.3 (19.5 / 26.5) | 0 | 75/19/7 | 0.33 | 79.0 | 0.0 | 1.6 | 2.07 / 1.52 | 5.1 | 0.0 |
| bot0.8 | 7 | 4.1 (4.2) | 59.0 [53.6–65.1] | 11.2 (15.2 / 22.1) | 0 | 67/25/8 | 0.42 | 79.7 | 0.0 | 1.5 | 2.07 / 1.52 | 6.1 | 0.0 |
| bot1 | 3 | 2.7 (2.8) | 38.8 [35.9–41.7] | 6.1 (7.1 / 11.4) | 0 | 100/0/0 | 0.00 | 100.0 | 0.0 | 1.4 | 1.50 / 1.14 | 0.0 | 0.0 |
| bot1 | 4 | 3.4 (3.6) | 48.6 [40.7–64.8] | 8.6 (12.8 / 19.8) | 0 | 100/0/0 | 0.00 | 100.0 | 0.0 | 1.4 | 2.07 / 1.51 | 0.0 | 0.0 |
| bot1 | 5 | 3.9 (4.0) | 56.9 [50.5–73.1] | 10.6 (15.4 / 26.4) | 0 | 100/0/0 | 0.00 | 100.0 | 0.0 | 1.4 | 2.07 / 1.52 | 0.0 | 0.0 |
| bot1 | 6 | 4.0 (4.1) | 57.8 [50.7–75.2] | 10.9 (18.2 / 25.9) | 0 | 100/0/0 | 0.00 | 100.0 | 0.0 | 1.4 | 2.07 / 1.52 | 0.0 | 0.0 |
| bot1 | 7 | 3.6 (3.7) | 52.6 [50.6–55.2] | 9.6 (11.5 / 13.7) | 0 | 100/0/0 | 0.00 | 100.0 | 0.0 | 1.4 | 2.07 / 1.52 | 0.0 | 0.0 |

### 3.2 Speech (modelled pipeline), selected rows

| model | age | lines asked / min | heard / min | Bun talking % of time | prompt cut % | ask → prompt starts s (p90) | words lost % | count words lost % | wrong lines: 1st sentence heard % | top cut-offs (line < cut by) |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 18.2 | 15.4 | 59 | 1.9 | 0.14 (0.57) | 12.5 | 0.0 | 90.6 | wrong<found 2.97/session, surprise<surpriseTap 1.27/session, surprise<found 0.99/session |
| typical | 4 | 18.8 | 16.8 | 57 | 2.9 | 0.24 (0.90) | 9.6 | 1.8 | 90.3 | surprise<surpriseTap 1.46/session, wrong<found 1.23/session, surprise<found 0.95/session |
| typical | 7 | 19.0 | 16.9 | 66 | 4.4 | 0.27 (0.90) | 7.5 | 1.8 | 94.2 | wrong<found 1.51/session, surprise<found 1.16/session, surprise<surpriseTap 0.95/session |
| slow3 | 3 | 14.5 | 12.8 | 51 | 0.0 | 0.14 (0.47) | 8.2 | 0.0 | 98.1 | surprise<surpriseTap 2.25/session, wrong<found 0.85/session, idle<found 0.68/session |
| slow3 | 4 | 14.1 | 12.8 | 48 | 0.4 | 0.24 (0.90) | 7.3 | 0.8 | 99.0 | surprise<surpriseTap 2.35/session, hint<found 0.63/session, wrong<found 0.47/session |
| slow3 | 7 | 13.5 | 12.2 | 52 | 0.2 | 0.20 (0.67) | 6.4 | 0.3 | 99.6 | surprise<surpriseTap 2.17/session, hint<found 1.37/session, idle<found 0.78/session |
| slowOnce | 3 | 14.0 | 12.6 | 50 | 0.1 | 0.14 (0.47) | 7.3 | 0.0 | 99.1 | surprise<surpriseTap 2.29/session, wrong<found 0.60/session, idle<found 0.49/session |
| slowOnce | 4 | 14.0 | 12.9 | 47 | 0.3 | 0.23 (0.87) | 6.7 | 0.3 | 99.5 | surprise<surpriseTap 2.27/session, hint<found 0.60/session, idle<found 0.27/session |
| slowOnce | 7 | 13.2 | 12.1 | 51 | 0.3 | 0.21 (0.63) | 5.7 | 0.3 | 99.8 | surprise<surpriseTap 2.29/session, hint<found 1.07/session, idle<found 0.59/session |
| high | 3 | 17.5 | 14.9 | 58 | 1.7 | 0.14 (0.47) | 11.6 | 0.0 | 91.2 | surprise<surpriseTap 1.66/session, hint<found 1.44/session, wrong<found 1.41/session |
| high | 4 | 18.1 | 16.1 | 56 | 2.7 | 0.23 (0.90) | 9.6 | 0.9 | 95.8 | surprise<surpriseTap 1.71/session, hint<found 0.99/session, wrong<found 0.76/session |
| high | 7 | 18.9 | 16.4 | 66 | 3.6 | 0.24 (0.77) | 8.9 | 0.9 | 96.1 | surprise<surpriseTap 1.21/session, hint<found 1.18/session, wrong<found 1.15/session |
| sandOnly | 3 | 18.3 | 13.9 | 60 | 2.3 | 0.16 (0.63) | 19.6 | 0.0 | 94.3 | assist<found 6.60/session, idle<found 4.00/session, surprise<surpriseTap 2.16/session |
| sandOnly | 4 | 17.9 | 14.9 | 60 | 3.3 | 0.31 (1.03) | 12.7 | 6.6 | 92.2 | assist<found 6.97/session, idle<found 2.12/session, surprise<surpriseTap 1.95/session |
| sandOnly | 7 | 20.6 | 16.6 | 71 | 1.8 | 0.25 (0.80) | 12.3 | 0.8 | 96.0 | assist<found 10.75/session, surprise<surpriseTap 1.88/session, idle<found 1.46/session |
| shelfBun | 3 | 16.6 | 14.3 | 56 | 3.3 | 0.13 (0.47) | 11.1 | 0.0 | 87.6 | wrong<found 1.87/session, surprise<surpriseTap 1.57/session, wrong<prompt 0.90/session |
| shelfBun | 4 | 17.3 | 15.4 | 54 | 3.3 | 0.20 (0.83) | 9.4 | 1.8 | 85.1 | surprise<surpriseTap 1.65/session, wrong<found 0.71/session, surprise<found 0.69/session |
| shelfBun | 7 | 18.1 | 15.7 | 64 | 11.8 | 0.22 (0.67) | 8.4 | 1.7 | 83.4 | prompt<found (2nd half) 2.77/session, surprise<surpriseTap 1.13/session, prompt<prompt (2nd half) 1.11/session |
| tapper | 3 | 20.0 | 15.2 | 64 | 4.0 | 0.29 (1.03) | 19.4 | 0.0 | 89.9 | assist<found 5.23/session, idle<found 2.58/session, hint<found 2.16/session |
| tapper | 4 | 20.5 | 16.7 | 65 | 5.4 | 0.40 (1.30) | 15.3 | 5.4 | 93.2 | assist<found 3.88/session, hint<found 1.37/session, idle<found 1.32/session |
| tapper | 7 | 21.0 | 16.7 | 73 | 6.7 | 0.42 (1.50) | 14.5 | 5.5 | 93.6 | assist<found 6.41/session, hint<found 1.59/session, hint<prompt 1.25/session |
| spammer | 3 | 26.6 | 19.0 | 80 | 19.6 | 1.16 (2.67) | 27.1 | 0.0 | 48.3 | wrong<found 6.61/session, prompt<talkResult (2nd half) 1.21/session, prompt<found (1st half) 1.15/session |
| spammer | 4 | 27.8 | 19.9 | 79 | 16.3 | 1.32 (2.93) | 26.8 | 6.7 | 64.9 | wrong<found 6.52/session, wrong<wrong 3.45/session, prompt<talkResult (2nd half) 1.29/session |
| spammer | 7 | 30.1 | 17.8 | 89 | 26.6 | 1.52 (3.57) | 31.7 | 26.7 | 68.5 | wrong<wrong 11.10/session, wrong<found 8.86/session, prompt<found (2nd half) 2.98/session |
| perfect | 3 | 22.1 | 18.9 | 68 | 21.0 | 0.21 (0.87) | 13.3 | 0.0 | — | prompt<talkResult (1st half) 2.46/session, prompt<talkResult (2nd half) 1.52/session, surprise<found 1.38/session |
| perfect | 4 | 22.8 | 19.9 | 65 | 17.9 | 0.28 (1.03) | 12.3 | 2.6 | — | prompt<talkResult (1st half) 2.40/session, prompt<talkResult (2nd half) 1.35/session, surprise<found 1.09/session |
| perfect | 7 | 21.2 | 18.3 | 71 | 22.8 | 0.29 (1.10) | 10.4 | 1.3 | — | prompt<talkResult (1st half) 2.51/session, prompt<found (2nd half) 2.37/session, prompt<talkResult (2nd half) 1.49/session |
| bot0.8 | 3 | 25.6 | 20.0 | 79 | 41.6 | 0.21 (0.83) | 16.5 | 0.0 | 75.3 | prompt<found (2nd half) 3.83/session, wrong<found 3.13/session, prompt<talkResult (2nd half) 2.21/session |
| bot0.8 | 4 | 25.7 | 21.3 | 73 | 32.6 | 0.28 (1.03) | 14.8 | 1.9 | 82.1 | prompt<found (2nd half) 2.94/session, prompt<talkResult (2nd half) 1.95/session, wrong<found 1.91/session |
| bot0.8 | 7 | 25.2 | 18.2 | 78 | 55.2 | 0.26 (0.83) | 18.8 | 1.7 | 79.4 | prompt<found (2nd half) 9.68/session, wrong<found 3.03/session, prompt<found (1st half) 2.16/session |

`perfect` / `bot*` prompts are mostly cut by their own instant answer (Talk answer while "Talk time! What colour…" plays, or the found line of a dig started 1 s after the ask); `DD.Bot` taps 0.9–2.2 s after an ask, i.e. during the prompt — see P3-4.

### 3.3 Content variety and difficulty curve (typical child)

| age | same answer as the previous step % (by topic) | same set again in one session | target position left / middle / right (3-mound rounds) | ch1 · ch2 · ch3 · ch4 (topic, chapter s, wrong / round, 3★ %) |
|---|---|---|---|---|
| 3 | colours 17.3, shapes 19.5, size 53.3, animals 12.4 (all 24.9) | 0.58 (size 0.36, colours 0.19) | 33 / 32 / 35 | colours 68 s 0.34 69 % · shapes 67 s 0.38 67 % · size 62 s 0.26 74 % · animals 67 s 0.29 72 % |
| 4 | colours 16.7, shapes 11.4, animals 7.8 (all 11.4) | 0.59 (count 0.36, colours 0.20) | 31 / 35 / 35 | colours 64 s 0.19 82 % · shapes 73 s 0.24 78 % · **count 89 s 0.00 100 %** · animals 73 s 0.21 81 % |
| 5 | shapes5 24.9, letters 2.7, animals 6.4 | 0.00 | 37 / 30 / 32 | shapes 83 s 0.27 77 % · **count 93 s 0.00 100 %** · letters 84 s 0.33 72 % · animals 83 s 0.29 77 % |
| 6 | lower 2.2, initial 9.3, add 3.8 | 0.10 | 33 / 31 / 36 | lower 82 s 0.18 84 % · initial 81 s 0.20 82 % · add 81 s 0.19 84 % · **count 93 s 0.00 100 %** |
| 7 | initial 8.3, add 1.7, sub 6.5 | 0.13 | 36 / 29 / 35 | initial 80 s 0.17 84 % · add 79 s 0.20 83 % · sub 80 s 0.20 82 % · oddeven 73 s 0.20 83 % |

No position bias (answers are spread evenly left/middle/right). Difficulty is flat across chapters at 5–7 (wrong / round 0.17–0.33); the counting chapter is the longest of every session it is in and has **0 wrong digs** (every mound holds a bone).

### 3.4 Real page voice log (`hs_voicelog.js`, bot 0.8, speed 8, speech logged not spoken)

| age | session (game min) | lines EN / VI | lines / game min | distinct lines | broken / EN-in-VI | page errors |
|---|---|---|---|---|---|---|
| 3 | 3.06 | 73 / 73 | 23.9 | 61 / 64 | 0 / 0 | 0 |
| 4 | 3.67 / 3.55 | 87 / 88 | 23.7 / 24.8 | 74 / 72 | 0 / 0 | 0 |
| 5 | 4.28 / 4.32 | 105 / 105 | 24.5 / 24.3 | 87 / 87 | 0 / 0 | 0 |
| 6 | 4.32 / 4.29 | 109 / 107 | 25.2 / 24.9 | 87 / 82 | 0 / 0 | 0 |
| 7 | 4.10 / 4.16 | 96 / 99 | 23.4 / 23.8 | 79 / 79 | 0 / 0 | 0 |

The real page asks for 23–25 lines per game minute with the bot, the headless speech model 25.6–25.8 for `bot0.8` → the model's event policy matches main.js. Session lengths match headless `bot0.8` (2.9 / 3.6 / 4.3 / 4.4 / 4.1 min). The only checker hits were the VI count words "Hai!" / "Ba!" (correct Vietnamese that simply has no tone mark). Sample (age 4 VI): "Bé đào quả trứng màu vàng lên nào!" → "Oa, quả trứng vàng! Bên trong có gì nhỉ?" → "Rắc! Khủng long con màu đỏ nè!" → "Ồ, quả trứng màu xanh lá nè! Quả trứng màu xanh dương ở đâu nhỉ?" → "Thêm một nữa nhé! Bé tìm hòn đá hình ngôi sao nào!" → "Mình đếm nhé! Bé tìm 3 khúc xương nào!" → "Hai!" "Ba!" → "Mình tìm được ba khúc xương rồi!". Age 6 EN: "Where is small r? It goes with big R!", "Duck starts with D! Let's look again!", "Yes! 4 + 4 is eight!". All natural, every colour after the noun in VI, no "màu màu".

## 4. Findings

### P1-1 Tapping the peeking thing's tip (or just above it) counts as an empty-sand tap
Evidence (`high` child, base): the **first tap after an ask does nothing in 44–52 % of steps** (typical: 3–10 %), **40–48 % of rounds get a hint** (typical 2–6 %), 3–9 % an assist. Geometry at item 112: hit circle top ≈ 125–131 px above the mound bottom, the egg tip ≈ 112 px; the thing box only reaches 8 px above the tip (`top = m.thingY - m.size - 8`, hard-coded). Children aim at what they see — the egg tip / the star point — and a finger lands 10–40 px above it. A tap there makes a dust puff and counts towards the hint ("taps without progress"), so it feels like "my tap didn't work" and Bun starts pointing.
Fix: make the top pad a CONFIG key and raise it: **`thingTopPad` (new; replaces the literal 8 in `_moundAt`) 8 → 40**. Re-sim (`--patch topPad=…`, same 1 600 sessions):

| model | age | 1st tap on empty sand % base → pad 30 → **pad 40** | hint rounds % base → 30 → **40** | assist rounds % base → **40** | wrong / round base → **40** | chapter s base → **40** |
|---|---|---|---|---|---|---|
| high | 3 | 52.3 → 38.1 → **31.9** | 40.4 → 28.8 → **21.8** | 3.4 → **0.1** | 0.26 → 0.29 | 75.2 → **69.4** |
| high | 4 | 48.3 → 35.8 → **29.0** | 40.1 → 25.7 → **20.1** | 3.6 → **0.3** | 0.20 → 0.20 | 83.5 → **79.9** |
| high | 5 | 43.9 → 32.8 → **26.0** | 46.2 → 29.7 → **21.2** | 6.7 → **0.4** | 0.28 → 0.26 | 94.8 → **90.7** |
| high | 7 | 46.3 → 31.2 → **25.0** | 48.2 → 25.3 → **19.3** | 9.3 → **0.3** | 0.29 → 0.29 | 89.2 → **83.4** |
| typical | 3–7 | unchanged (± 0.1) | unchanged | 0 → 0 | unchanged | unchanged |
| tapper | 3 / 7 | 80.5 → **78.5** / 73.4 → **71.7** | 89.5 → 87.9 / 96.7 → 96.6 | 73 → 69 / 90 → 88 | 0.33 → 0.36 / 0.92 → 0.97 | 91.5 → 90.7 / 103.9 → 102.5 |
| spammer | 3 / 7 | ≈ | 32.0 → 31.2 / 72.4 → 71.8 | ≈ | 0.65 → 0.64 / 1.96 → 1.95 | ≈ |

The remaining misses are the 25 % of `high` taps placed 40–90 px above the tip (by construction). Raising `hitCY` 0.45 → 0.6 or `hitPad` 14 → 24 instead was tried and is weaker (hint rounds 40 → 31–36 %) and the combination `hitCY 0.55 + hitPad 18` drops the 720×960 iPad portrait capacity from 8 to 5 mounds (`computeLayout`), so the targeted thing-box pad is the right knob. Check for the integrator: with pad 40 the top of a back-row tablet (peek 0.62) can come ≈ 20 px under the shelf's bottom edge; a mound wins over the shelf there, which is the wanted behaviour (no layout change needed).

### P2-1 The same answer twice in a row (ages 3–5)
Evidence: the asked value equals the previous step's in **24.9 % of steps at age 3** (colours 17 %, shapes 20 %, size 53 %, animals 12 %), 11.4 % at age 4, shapes5 25 % at age 5. Real log, age 4 EN animals: "Where is the cow?" → (next round) "Can you dig up the cow?"; age 4 shapes: "Find the oval stone!" in rounds 1 and 3; age 6 add: "1 + 1" twice in one chapter. The `prevKey` rule only stops identical *sets*.
Fix (content.js + world.js): pass `prevAns` (the last find step's `nameValue`) like `prevKey` (`World._beginRound`: `prevAns: this._prevAns`; store the last find step's `nameValue` after makeRound) and in `makeRound` re-roll while `steps[0].nameValue === prevAns` (≤ 20 tries; `size`: allow at most 2 in a row; `shapes5` exempt — its grid deliberately repeats a shape). Re-sim (`--patch noRepeat`, 600 sessions):

| model | age | same answer twice % (all) | colours | shapes | size | animals | chapter s |
|---|---|---|---|---|---|---|---|
| typical | 3 | 24.9 → **0.8** | 17.3 → 0.0 | 19.5 → 0.9 | 53.3 → 2.3 | 12.4 → 0.0 | 65.8 → 66.1 |
| typical | 4 | 11.4 → **0.1** | 16.7 → 0.0 | 11.4 → 0.0 | — | 7.8 → 0.2 | 74.8 → 74.7 |
| typical | 5 | 11.3 → **6.0** (shapes5 grid) | — | 24.9 → 17.7 | — | 6.4 → 0.2 | 85.9 → 85.9 |
| bot0.8 | 3 / 4 | 24.8 → 0.5 / 11.4 → 0.3 | 0 | ≈ 0 | 2.3 | ≈ 0 | unchanged |

No validity, timing or difficulty side effects (first-tap right % unchanged ± 1).

### P2-2 A child who never hits a mound needs 6 empty taps per step (counting = 6 per bone)
Evidence (`sandOnly`, base): 95–99 % of rounds end through the assist, but age 4 chapters average **109 s, p90 159 s, max round 110 s** — a 5-bone counting round needs 5 × 6 sand taps because `_noProg` resets after every assisted find. Random tapper age 4: chapter p90 112 s. The `assistAfter` 6 is also slower than the hint ladder suggests (hint at 2).
Fix (CONFIG): **`assistAfter` 6 → 4** (ages ≤ 4 only; `assistAfterOld` 5 stays for 5+). Re-sim (`--config '{"assistAfter":4}'`, 1 000 sessions):

| model | age | chapter s mean [p90] | max round s | assist rounds % | 3★ % | wrong / round | session p90 min |
|---|---|---|---|---|---|---|---|
| sandOnly | 3 | 95.1 [107.5] → **90.5 [99.3]** | 58.5 → 51.4 | 95.5 → 98.0 | 96 → 97 | 0.04 → 0.03 | 6.9 → 6.5 |
| sandOnly | 4 | 109.3 [159.0] → **98.7 [127.6]** | 109.6 → **82.0** | 98.1 → 98.9 | 95 → 97 | 0.05 → 0.03 | 8.0 → **7.1** |
| tapper | 3 | 91.5 [101.9] → **85.0 [95.8]** | 51.0 → 44.2 | 73 → 82 | 70 → 76 | 0.33 → 0.26 | 6.5 → 6.2 |
| tapper | 4 | 95.8 [111.7] → **91.2 [103.3]** | 60.2 → 58.0 | 69 → 78 | 66 → 73 | 0.42 → 0.30 | 6.9 → 6.5 |
| spammer | 3 / 4 | 58.5 / 69.3 → 58.5 / 69.0 | ≈ | 0.9 → 6.6 / 2.3 → 12.3 | ≈ | unchanged | unchanged |
| typical, slow3 | 3 / 4 | **unchanged** (typical never reaches 4 no-progress taps; slow3 assist rounds 0 → 0.2–0.4 %) | | | | | |

Regression with the original sim: `node tests/sim/hs_playtest.js --n 60 --config '{"assistAfter":4}'` → 2 420 sessions (9 models × ages 3–7), **0 stuck rounds, 0 stuck states, 0 NaN, 0 "2 wrong without a hint"**, max round 108.9 s; typical 3 / 4 chapters 66.9 / 75.1 s (p90 78.0 / 91.3), slow 3-year-old 89.1 / 97.5 s, tapper 84.7 / 91.9 s (was 91.4 / 95.8 in MECHANICS §11).
(Optional, code: keep half of `_noProg` after an assisted find in a count step instead of resetting it to 0 — not simulated.)

### P2-3 Tapping Bun while she is still saying the prompt makes her start the sentence again
Evidence: `pokeBun` repeats the prompt (interrupt) once `since > 3 s` and the prompt has *started* — but a VI / age-6 prompt is 3–4.5 s long ("Thêm một nữa nhé! Bé tìm hòn đá hình ngôi sao nào!", "Where is small r? It goes with big R!"). `shelfBun` age 6: **1.15 self-cuts per session** ("Where is small r? It goes wi— Where is small r? …"), age 4: 0.13, typical age 6: 0.07.
Fix (main.js `pokeBun`): do not repeat while the prompt itself is being spoken: `if (DD.Voice && DD.Voice.isSpeaking() && lastSpoken === lastPromptText) { bunMood('idle', 0); break; }`. Re-sim (`--voice '{"noRepeatWhileSpeaking":1}'`): prompt-cuts-prompt **1.15 → 0 per session** (shelfBun 6), 0.13 → 0 (shelfBun 4); prompt cut % shelfBun 6 12.5 → 9.2; nothing else moves (lines / min −0.3).

### P2-4 Counting is not really assessed (every mound holds a bone; the round stops at N by itself)
Evidence: count chapters have **0.00 wrong digs and 100 % 3★ for every model at every age**, also for the random tapper and the spammer; they are also the longest chapter in the session (89–93 s typical vs 64–84 s for the other topics). The child never decides when N is reached, so "count to 5" is "tap 5 bones while Bun counts". Design proposal for the lead (content, not simulated): from age 5 (or from the 3rd count round at age 4) bury 1–2 decoys (a stone / a toy) among the bones (a decoy dig = the kind wrong line "That's a stone! Let's find the bones!"), or end the step with a "How many bones?" Talk-style check. Optional speed-up (content `scoops` for count rounds 3 → 2, `--patch countScoops2`): count chapter 89.1 → 84.3 s (age 4), 93.4 → 85.8 s (5), 93.0 → 84.8 s (6); slow models −1 … −7 s; count words lost 1.0 → 2.5 % at age 6 (faster digs) — keep 3 scoops if the counting rhythm matters more than 5–8 s.

### P3-1 The child's surprise tap cuts Bun's surprise announcement; the hatch line is almost never heard
`surprise<surpriseTap` 1.3–2.4 per session ("Peekaboo! A mole popped—" "Hee hee! The mole giggles!") — the child reacted, so this is fine. `surprise<found` ≈ 1 per session: the mole appears during a dig and its line is cut by the find. The hatch line is spoken 0.01 times / min at real speed (it only plays when the found line has finished, which it never has 0.9 s later); the egg found line already says "it's hatching" and the chirp plays, so nothing is lost — but the speed-8 voice log over-reports it (`Voice` is disabled above speed 1, so every hatch line is logged). No change needed; note for whoever reads voice logs.

### P3-2 Found cuts the second half of a wrong line (by design) — optional tweak for spammers
`wrong<found` 1.2–3.0 per session for a typical child; but the first sentence ("That's a blue egg.") is heard in **90–94 %** (slow children 98–100 %). For a spammer only 48 % (age 3). Optional main.js tweak: a `found` that arrives < 4 s into a wrong line queues (priority) instead of interrupting, and drops the queued hint. Re-sim (`--voice '{"foundAfterWrong":4}'`): wrong line heard typical 3 90.6 → 93.6 %, spammer 3 48.3 → 84.7 %, spammer 4 64.9 → 81.0 %; the found line starts later (prompt delay +0.04 s, found line ≈ +1–2 s). Recommend only if the lead wants the teaching line protected; the default is acceptable.

### P3-3 Repeated sets / small pools at age 3
Same set again within one session: 0.58 at ages 3–4 (age 3 `size`: 0.36 — 2 mounds, one kind, big/small; age 4 `count`: 0.36 — N repeats non-consecutively, "Dig up 3 bones!" twice in a chapter). Not boring in practice (the shelf and the dinos change), but a `count` rule "N differs from every earlier N in the chapter while possible" would remove it.

### P3-4 `DD.Bot` digs during the prompt
`bot0.8` digs 1.5 s after an ask (children: 4.3–5.8 s), so 33–55 % of its prompts are cut and its chapters (42–63 s) are faster than any child's. Only the `?bot=1` demo and the bot pace numbers are affected; suggestion: add `prompt ≈ 2.4 s` to `Bot._delay()` after an `ask` (bot.js) so the demo listens like a child.

### P3-5 Docs
`docs/VOICE.md` §1.2 says the `ask` does `Voice.dropQueued()` then says with interrupt; main.js queues it with `priority` (no drop). The behaviour is good (prompt starts 0.14–0.31 s after the ask, never dropped for typical children) — update the doc, not the code. The project `CLAUDE.md` still describes *Nini's Sea Painting* (copied from turtle-sea-paint) and should be rewritten for Bun's Dino Dig.

### Things checked and fine
- 0 stuck / NaN; the absent child keeps getting nudges (hs_playtest).
- Tap → judgement 2.07 s (4+) / 1.50 s (3) one tap; 1.74 / 1.20 s tapping along: fast enough to feel caused by the tap, slow enough to see the 3 scoops. No change.
- Ask → first dig 5.2 s (typical 4), 9.8 s (slow 3-year-old); prompts start ≤ 0.31 s after the ask on average; count words lost ≤ 1.8 % for a typical child.
- Stars: typical 70–87 % 3★, 1★ ≤ 3 %; only the spammer at 5–7 gets mostly 1★ (it digs wrong mounds on purpose) — fair.
- Shelf / Bun tappers (`shelfBun`) lose nothing: no misses counted, 3★ like typical, rounds +2–4 s.
- First chapter at the default age 4 (colours, ≤ 3 mounds, 1 step): 0.19 wrong / round, 82 % 3★ — trivially easy as required.

## 5. Recommended changes (exact) and the combined re-sim

| # | where | change | priority |
|---|---|---|---|
| 1 | world.js CONFIG + `_moundAt` | new key **`thingTopPad: 40`**; `top = m.thingY - m.size - cfg.thingTopPad` (was the literal 8) | P1 |
| 2 | content.js `makeRound` + world.js `_beginRound` | `prevAns` (last find `nameValue`) passed like `prevKey`; re-roll while `steps[0].nameValue === prevAns` (≤ 20 tries; size ≤ 2 in a row; shapes5 exempt) | P2 |
| 3 | world.js CONFIG | **`assistAfter`: 6 → 4** (ages ≤ 4; `assistAfterOld` 5 unchanged) | P2 |
| 4 | main.js `pokeBun` | no repeat while the prompt itself is being spoken | P2 |
| 5 | content.js count | decoys from age 5 (design decision for the lead); optional `scoops` 2 for count rounds | P2 / optional |
| 6 | main.js `found` | optional: queue (priority) instead of interrupting a wrong line < 4 s old | P3 optional |
| 7 | bot.js | `_delay()` + 2.4 s after an `ask` | P3 |
| 8 | docs | VOICE.md §1.2 ask policy; project CLAUDE.md | P3 |

Combined re-sim of 1 + 2 + 3 + 4 (`--config '{"assistAfter":4}' --patch topPad=40,noRepeat --voice '{"noRepeatWhileSpeaking":1}' --tag final`, 6 000 sessions, the same seeds as the baseline):

| model | age | chapter s mean [p90] | session p90 min | max round s | stuck | 1st tap on empty sand % | hint rounds % | assist rounds % | wrong / round | 3★ % | same answer twice % | lines / min | prompt cut % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 65.8 [77.1] → 66.1 [76.9] | 4.8 → 4.9 | 38.6 → 38.6 | 0 → 0 | 9.8 → 9.6 | 5.6 → 5.3 | 0.0 → 0.0 | 0.32 → 0.32 | 70 → 70 | 24.9 → 0.8 | 18.2 → 18.2 | 1.9 → 1.7 |
| typical | 4 | 74.8 [91.9] → 74.8 [92.4] | 5.4 → 5.5 | 44.4 → 44.4 | 0 → 0 | 6.2 → 5.9 | 2.1 → 2.6 | 0.0 → 0.0 | 0.16 → 0.18 | 85 → 83 | 11.4 → 0.1 | 18.8 → 18.9 | 2.9 → 2.6 |
| typical | 5 | 85.9 [97.1] → 86.0 [97.0] | 6.1 → 6.1 | 41.9 → 42.0 | 0 → 0 | 3.2 → 3.2 | 2.9 → 2.7 | 0.0 → 0.0 | 0.22 → 0.21 | 82 → 82 | 11.3 → 6.0 | 19.3 → 19.2 | 3.6 → 3.3 |
| typical | 7 | 77.9 [85.7] → 77.8 [85.9] | 5.5 → 5.5 | 33.6 → 33.6 | 0 → 0 | 4.9 → 4.7 | 1.7 → 1.6 | 0.0 → 0.0 | 0.19 → 0.19 | 83 → 83 | 5.5 → 0.3 | 19.0 → 19.0 | 4.4 → 4.4 |
| slow3 | 3 | 87.6 [100.4] → 87.6 [99.8] | 6.5 → 6.5 | 53.2 → 70.4 | 0 → 0 | 15.6 → 16.0 | 11.5 → 11.6 | 0.0 → 0.1 | 0.46 → 0.44 | 59 → 60 | 25.1 → 0.6 | 14.5 → 14.5 | 0.0 → 0.1 |
| slow3 | 4 | 97.6 [116.9] → 97.2 [115.5] | 7.2 → 7.1 | 80.0 → 80.0 | 0 → 0 | 14.9 → 15.0 | 14.5 → 14.4 | 0.0 → 0.4 | 0.42 → 0.43 | 68 → 67 | 12.3 → 0.2 | 14.1 → 14.2 | 0.4 → 0.4 |
| slow3 | 5 | 110.6 [134.4] → 111.1 [135.0] | 8.3 → 8.4 | 103.0 → 103.0 | 0 → 0 | 15.4 → 15.2 | 26.2 → 26.4 | 0.2 → 0.3 | 0.70 → 0.71 | 57 → 57 | 11.0 → 6.2 | 13.9 → 13.9 | 0.5 → 0.5 |
| slow3 | 7 | 112.7 [134.3] → 113.5 [135.8] | 8.3 → 8.4 | 83.1 → 93.5 | 0 → 0 | 17.1 → 17.1 | 30.3 → 31.5 | 0.3 → 0.3 | 0.97 → 0.99 | 40 → 39 | 4.7 → 0.3 | 13.5 → 13.5 | 0.2 → 0.2 |
| slowOnce | 3 | 90.3 [103.0] → 90.1 [103.0] | 6.5 → 6.6 | 52.3 → 52.3 | 0 → 0 | 19.6 → 19.1 | 12.0 → 11.2 | 0.0 → 0.1 | 0.46 → 0.45 | 58 → 59 | 24.3 → 0.7 | 14.0 → 14.0 | 0.1 → 0.0 |
| slowOnce | 4 | 98.0 [115.0] → 98.2 [115.0] | 7.2 → 7.2 | 73.2 → 72.2 | 0 → 0 | 16.4 → 15.2 | 15.4 → 14.9 | 0.0 → 0.4 | 0.46 → 0.46 | 66 → 65 | 13.1 → 0.3 | 14.0 → 14.0 | 0.3 → 0.1 |
| slowOnce | 5 | 112.4 [134.2] → 113.0 [134.3] | 8.3 → 8.3 | 85.7 → 85.7 | 0 → 0 | 16.9 → 16.2 | 24.8 → 25.4 | 0.1 → 0.2 | 0.70 → 0.72 | 57 → 56 | 11.1 → 5.8 | 13.6 → 13.6 | 0.5 → 0.5 |
| slowOnce | 7 | 115.2 [141.6] → 115.1 [141.0] | 8.7 → 8.7 | 94.2 → 94.2 | 0 → 0 | 17.0 → 16.5 | 31.8 → 32.2 | 0.4 → 0.4 | 1.00 → 1.02 | 38 → 37 | 5.1 → 0.6 | 13.2 → 13.2 | 0.3 → 0.1 |
| high | 3 | 75.2 [88.0] → 69.3 [81.9] | 5.5 → 5.1 | 53.3 → 46.6 | 0 → 0 | 52.3 → 32.4 | 40.4 → 21.4 | 3.4 → 1.7 | 0.26 → 0.29 | 75 → 72 | 24.8 → 0.9 | 17.5 → 17.9 | 1.7 → 1.5 |
| high | 4 | 83.5 [101.7] → 79.6 [96.6] | 6.1 → 5.8 | 61.0 → 47.6 | 0 → 0 | 48.3 → 27.1 | 40.1 → 18.4 | 3.6 → 2.1 | 0.20 → 0.20 | 83 → 83 | 12.0 → 0.3 | 18.1 → 18.4 | 2.7 → 2.5 |
| high | 5 | 94.8 [107.7] → 90.8 [101.5] | 6.8 → 6.5 | 59.1 → 46.0 | 0 → 0 | 43.9 → 26.0 | 46.2 → 21.5 | 6.7 → 0.4 | 0.28 → 0.27 | 77 → 79 | 11.6 → 5.9 | 18.8 → 18.9 | 3.0 → 2.9 |
| high | 7 | 89.2 [99.5] → 83.4 [93.5] | 6.4 → 6.0 | 52.7 → 38.4 | 0 → 0 | 46.3 → 25.0 | 48.2 → 18.7 | 9.3 → 0.5 | 0.29 → 0.28 | 76 → 76 | 5.5 → 0.1 | 18.9 → 18.8 | 3.6 → 3.7 |
| sandOnly | 3 | 95.1 [107.5] → 90.8 [100.5] | 6.9 → 6.5 | 58.5 → 55.6 | 0 → 0 | 98.8 → 98.2 | 98.7 → 98.7 | 95.5 → 97.0 | 0.04 → 0.04 | 96 → 96 | 25.0 → 0.8 | 18.3 → 18.2 | 2.3 → 1.7 |
| sandOnly | 4 | 109.3 [159.0] → 98.8 [127.9] | 8.0 → 7.2 | 109.6 → 74.7 | 0 → 0 | 98.3 → 99.0 | 99.2 → 99.2 | 98.1 → 98.4 | 0.05 → 0.03 | 95 → 97 | 11.5 → 0.0 | 17.9 → 19.3 | 3.3 → 3.3 |
| sandOnly | 5 | 105.0 [131.7] → 105.3 [131.3] | 7.5 → 7.7 | 83.9 → 89.8 | 0 → 0 | 98.6 → 98.1 | 99.8 → 99.7 | 99.0 → 98.8 | 0.06 → 0.07 | 94 → 93 | 11.1 → 5.7 | 19.6 → 19.5 | 3.1 → 3.1 |
| sandOnly | 7 | 93.5 [106.5] → 94.7 [109.9] | 6.8 → 6.8 | 59.2 → 69.4 | 0 → 0 | 97.8 → 97.7 | 99.8 → 99.8 | 99.4 → 99.6 | 0.10 → 0.13 | 90 → 88 | 5.2 → 0.2 | 20.6 → 20.5 | 1.8 → 1.4 |
| shelfBun | 3 | 77.8 [91.5] → 78.0 [91.8] | 5.9 → 5.7 | 68.6 → 68.6 | 0 → 0 | 7.6 → 7.9 | 5.1 → 4.9 | 0.0 → 0.0 | 0.34 → 0.33 | 69 → 69 | 25.4 → 1.0 | 16.6 → 16.5 | 3.3 → 2.5 |
| shelfBun | 4 | 83.8 [100.0] → 83.9 [101.1] | 6.2 → 6.2 | 58.1 → 58.5 | 0 → 0 | 4.8 → 5.0 | 3.7 → 4.1 | 0.0 → 0.1 | 0.18 → 0.19 | 84 → 84 | 11.4 → 0.3 | 17.3 → 17.3 | 3.3 → 2.8 |
| shelfBun | 5 | 95.0 [107.5] → 94.9 [107.5] | 6.8 → 6.8 | 69.2 → 69.2 | 0 → 0 | 3.6 → 3.5 | 3.8 → 3.9 | 0.0 → 0.0 | 0.21 → 0.21 | 83 → 83 | 11.2 → 5.9 | 18.0 → 18.0 | 4.2 → 3.3 |
| shelfBun | 7 | 87.8 [97.4] → 88.0 [98.5] | 6.3 → 6.4 | 44.5 → 50.5 | 0 → 0 | 3.6 → 3.8 | 1.9 → 1.9 | 0.0 → 0.0 | 0.18 → 0.17 | 84 → 85 | 5.2 → 0.1 | 18.1 → 17.9 | 11.8 → 7.2 |
| tapper | 3 | 91.5 [101.9] → 84.3 [95.6] | 6.5 → 6.1 | 51.0 → 43.2 | 0 → 0 | 80.5 → 79.4 | 89.5 → 88.7 | 73.4 → 80.1 | 0.33 → 0.27 | 70 → 74 | 25.0 → 0.7 | 20.0 → 20.0 | 4.0 → 4.1 |
| tapper | 4 | 95.8 [111.7] → 91.3 [104.1] | 6.9 → 6.6 | 60.2 → 59.9 | 0 → 0 | 78.1 → 75.0 | 91.0 → 88.3 | 68.9 → 75.6 | 0.42 → 0.34 | 66 → 71 | 12.5 → 0.2 | 20.5 → 20.8 | 5.4 → 5.8 |
| tapper | 5 | 104.3 [117.2] → 102.7 [115.6] | 7.6 → 7.5 | 94.7 → 76.2 | 0 → 0 | 73.4 → 68.6 | 94.9 → 93.0 | 82.6 → 79.4 | 0.66 → 0.71 | 53 → 51 | 11.9 → 7.1 | 20.9 → 20.9 | 5.9 → 5.1 |
| tapper | 7 | 103.9 [117.5] → 102.9 [116.8] | 7.5 → 7.4 | 61.1 → 55.4 | 0 → 0 | 73.4 → 71.7 | 96.7 → 96.6 | 89.9 → 87.8 | 0.92 → 0.98 | 38 → 36 | 4.7 → 0.3 | 21.0 → 21.1 | 6.7 → 6.2 |
| spammer | 3 | 58.5 [65.9] → 58.4 [65.4] | 4.2 → 4.3 | 21.8 → 22.1 | 0 → 0 | 20.5 → 19.2 | 32.0 → 32.6 | 0.9 → 6.4 | 0.65 → 0.66 | 45 → 44 | 25.0 → 0.9 | 26.6 → 27.0 | 19.6 → 19.1 |
| spammer | 4 | 69.3 [78.9] → 69.0 [78.4] | 5.0 → 5.0 | 28.0 → 25.2 | 0 → 0 | 18.4 → 18.6 | 39.9 → 39.9 | 2.3 → 10.8 | 0.80 → 0.79 | 48 → 48 | 12.4 → 1.5 | 27.8 → 28.1 | 16.3 → 17.6 |
| spammer | 5 | 85.4 [94.8] → 84.9 [94.9] | 6.0 → 6.1 | 32.3 → 29.1 | 0 → 0 | 16.6 → 16.4 | 56.7 → 55.4 | 13.0 → 12.5 | 1.33 → 1.35 | 35 → 35 | 10.7 → 7.1 | 29.1 → 29.2 | 17.2 → 16.1 |
| spammer | 7 | 87.0 [98.6] → 86.8 [97.6] | 6.3 → 6.2 | 33.9 → 30.7 | 0 → 0 | 16.4 → 14.4 | 72.4 → 72.9 | 22.8 → 20.3 | 1.96 → 1.96 | 13 → 13 | 5.8 → 2.5 | 30.1 → 30.2 | 26.6 → 24.8 |
| bot0.8 | 3 | 42.2 [47.2] → 42.2 [47.1] | 3.1 → 3.1 | 14.6 → 14.4 | 0 → 0 | 0.0 → 0.0 | 1.1 → 1.1 | 0.0 → 0.0 | 0.24 → 0.24 | 77 → 77 | 24.8 → 0.5 | 25.6 → 25.7 | 41.6 → 41.0 |
| bot0.8 | 4 | 52.3 [67.0] → 52.2 [67.0] | 3.9 → 3.9 | 21.9 → 21.9 | 0 → 0 | 0.0 → 0.0 | 2.8 → 3.1 | 0.0 → 0.0 | 0.21 → 0.21 | 83 → 83 | 11.4 → 0.3 | 25.7 → 25.7 | 32.6 → 32.1 |
| bot0.8 | 5 | 62.6 [75.8] → 62.4 [75.7] | 4.5 → 4.5 | 27.6 → 27.6 | 0 → 0 | 0.0 → 0.0 | 5.4 → 4.9 | 0.0 → 0.0 | 0.33 → 0.31 | 75 → 76 | 11.2 → 5.9 | 25.8 → 25.8 | 31.9 → 32.4 |
| bot0.8 | 7 | 59.0 [65.1] → 59.0 [65.3] | 4.2 → 4.3 | 22.1 → 23.7 | 0 → 0 | 0.0 → 0.0 | 6.1 → 5.9 | 0.0 → 0.0 | 0.42 → 0.41 | 67 → 68 | 5.3 → 0.2 | 25.2 → 25.2 | 55.2 → 56.5 |

Totals after the change: **0 stuck rounds / 0 stuck states / 0 NaN / 0 broken lines in 6 000 sessions, longest round 104 s** (base 116 s).
What moved: the "taps high" child loses half of its no-effect first taps (52 → 32 % at age 3) and its hint rounds halve (40–48 → 18–22 %);
the same answer twice in a row drops from 25 / 11 % (ages 3 / 4) to ≤ 1 % (6 % at age 5, the shapes5 grid by design); the sand-only and
random-tapper 3–4-year-olds get 4–10 s shorter chapters (sand-only age 4 p90 159 → 128 s, session p90 8.0 → 7.2 min) and more stars;
typical, slow and shelf/Bun children are unchanged within noise (± 0.5 s per chapter, ± 2 % 3★). The `shelfBun` age-7 prompt cut %
falls 11.8 → 7.2 (no more self-restarts).
