# Bao's Bubble Sky — high-speed playtest (QA, 2026-11-13)

Report-only: no file under `game/` was changed. New scripts (all under `tests/sim/`, outputs in the git-ignored `tests/sim/out/`):
- `qa_playtest.js` — headless sessions through the real input API (press + lift, 1/30 s frames, 5 viewports, EN/VI alternating)
  plus extra probes: late-tap reliability on moving bubbles, bubble speed, overlaps, whoosh / Talk durations, countPop / countSel
  event correctness, content repeats in a session and over "Play again". `--config '{…}'` passes an override to `new PB.World({config})`.
- `qa_report.js <tags…>` — aggregates the JSON into the tables below. `qa_focus.js` — settle time, freed-thing distraction, autumn
  drift. `qa_browser.js` — the real page in Playwright.

**Volume:** 8 165 headless sessions in the main runs (bots 0.3 / 0.6 / 0.9 × ages 3–7 × 200; typical × 5 ages × 700, 2 000 of them
"Play again" replays; slow 3-year-old ages 3–4 × 300; late-tapper × 5 ages × 150; tapper / spammer × 5 ages × 30; absent × 15),
then 2 880 more sessions for six config overrides. 0 failed sessions, 0 NaN, **0 countPop / countSel errors** (countPop: right.count
= 1…k in order, exactly k rights, asked n = k; countSel: the freed thing's n = the asked n and `count` events 1…n in order), 0
rounds > 120 s, minimum gap between two hints 6.0 s (cooldown holds).

New child models (in addition to `tests/sim/lib.js`): **slow48** = a 3-year-old who waits 4–8 s before every tap (skill 0.65, aim
± 0.8 r); **late0.4** = typical child whose finger lands exactly where the bubble was 0.4 s earlier; **bot0.x** = `PB.Bot` at that skill
(it taps the bubble's CURRENT position, so it is faster than any child).

## 1. Durations, stars, help (all ages × models)
Targets: age-4 chapter 60–100 s, session ≤ 8 min. "first pop" = seconds from the question to the first right pop.

| model | age | sessions | done % | session min mean (p90, max) | chapter s mean [p10–p90] (max) | cut % | round s mean (p90) | rounds > 120 s | first pop after ask s | stars 3/2/1 % | wrong / round | hint rounds % | assist rounds % | whoosh s med (max) | talk s mean (p90) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot0.3 | 3 | 200 | 100.0 | 4.0 (4.2, 4.4) | 56.8 [51.8–62.1] (70.0) | 0.0 | 12.7 (16.1) | 0 | 3.4 | 20.2/17.9/61.9 | 1.81 | 61.9 | 0.0 | 1.6 (1.9) | 3.3 (3.9) |
| bot0.3 | 4 | 200 | 100.0 | 4.3 (4.5, 4.7) | 60.7 [52.7–69.7] (79.9) | 0.0 | 13.7 (18.5) | 0 | 3.2 | 28.0/15.1/56.9 | 1.84 | 56.9 | 0.0 | 1.6 (1.9) | 3.3 (3.9) |
| bot0.3 | 5 | 200 | 100.0 | 4.6 (4.7, 5.0) | 64.7 [58.5–71.6] (83.7) | 0.0 | 14.7 (19.6) | 0 | 3.2 | 26.5/12.8/60.7 | 2.01 | 60.7 | 0.0 | 1.6 (1.9) | 3.3 (3.9) |
| bot0.3 | 6 | 200 | 100.0 | 4.8 (5.0, 5.2) | 67.7 [61.6–74.5] (84.1) | 0.0 | 15.5 (20.1) | 0 | 3.2 | 24.8/12.2/63.1 | 2.15 | 63.1 | 0.0 | 1.6 (1.9) | 3.3 (3.9) |
| bot0.3 | 7 | 200 | 100.0 | 4.7 (4.9, 5.2) | 66.8 [60.5–73.3] (81.8) | 0.0 | 15.2 (20.1) | 0 | 3.4 | 13.1/12.0/74.9 | 2.55 | 74.9 | 0.0 | 1.6 (1.9) | 3.3 (3.9) |
| bot0.6 | 3 | 200 | 100.0 | 3.6 (3.7, 3.8) | 49.7 [46.1–53.7] (59.9) | 0.0 | 11.0 (13.1) | 0 | 2.2 | 48.8/27.8/23.4 | 0.79 | 23.4 | 0.0 | 1.6 (1.8) | 3.3 (3.9) |
| bot0.6 | 4 | 200 | 100.0 | 3.8 (3.9, 4.0) | 53.5 [48.4–59.2] (68.3) | 0.0 | 11.9 (14.6) | 0 | 2.2 | 50.4/24.2/25.4 | 0.82 | 25.4 | 0.0 | 1.6 (1.9) | 3.3 (3.9) |
| bot0.6 | 5 | 200 | 100.0 | 4.0 (4.2, 4.3) | 56.8 [52.7–61.2] (68.5) | 0.0 | 12.7 (15.5) | 0 | 2.2 | 47.8/23.6/28.7 | 0.91 | 28.7 | 0.0 | 1.6 (1.9) | 3.3 (3.8) |
| bot0.6 | 6 | 200 | 100.0 | 4.2 (4.3, 4.5) | 58.8 [54.6–63.8] (70.1) | 0.0 | 13.3 (16.0) | 0 | 2.2 | 47.7/25.0/27.3 | 0.90 | 27.3 | 0.1 | 1.6 (1.9) | 3.3 (3.9) |
| bot0.6 | 7 | 200 | 100.0 | 4.0 (4.2, 4.2) | 56.9 [53.3–60.7] (66.5) | 0.0 | 12.8 (15.3) | 0 | 2.2 | 37.6/29.1/33.3 | 1.08 | 33.3 | 0.0 | 1.6 (1.9) | 3.3 (3.9) |
| bot0.9 | 3 | 200 | 100.0 | 3.3 (3.3, 3.4) | 45.4 [43.2–48.4] (52.7) | 0.0 | 9.9 (11.2) | 0 | 1.5 | 85.1/13.3/1.6 | 0.17 | 1.6 | 0.0 | 1.6 (1.8) | 3.3 (3.9) |
| bot0.9 | 4 | 200 | 100.0 | 3.5 (3.6, 3.6) | 48.9 [45.1–52.7] (56.2) | 0.0 | 10.8 (12.7) | 0 | 1.5 | 85.6/12.7/1.7 | 0.16 | 1.7 | 0.0 | 1.6 (1.9) | 3.3 (3.9) |
| bot0.9 | 5 | 200 | 100.0 | 3.7 (3.8, 3.8) | 51.7 [48.2–55.3] (60.4) | 0.0 | 11.5 (13.5) | 0 | 1.5 | 84.0/13.9/2.1 | 0.18 | 2.1 | 0.0 | 1.6 (1.9) | 3.3 (3.9) |
| bot0.9 | 6 | 200 | 100.0 | 3.8 (3.9, 4.0) | 53.7 [50.0–59.5] (66.2) | 0.0 | 12.0 (13.9) | 0 | 1.5 | 82.5/15.2/2.3 | 0.20 | 2.3 | 0.0 | 1.6 (1.9) | 3.3 (3.9) |
| bot0.9 | 7 | 200 | 100.0 | 3.7 (3.7, 3.8) | 51.3 [49.3–53.5] (59.0) | 0.0 | 11.4 (13.0) | 0 | 1.5 | 80.7/16.6/2.8 | 0.22 | 2.8 | 0.0 | 1.6 (1.9) | 3.3 (3.9) |
| typical | 3 | 700 | 100.0 | 5.4 (5.7, 6.2) | 77.0 [68.6–85.9] (110.7) | 0.4 | 17.1 (22.9) | 0 | 7.4 | 65.5/22.4/12.1 | 0.49 | 12.1 | 0.0 | 1.6 (1.9) | 6.1 (7.3) |
| typical | 4 | 700 | 100.0 | 5.3 (5.6, 6.2) | 76.5 [67.4–86.1] (108.9) | 0.0 | 17.0 (22.7) | 0 | 6.4 | 74.8/18.7/6.5 | 0.33 | 6.6 | 0.0 | 1.6 (1.9) | 6.1 (7.3) |
| typical | 5 | 700 | 100.0 | 5.3 (5.5, 5.9) | 75.4 [68.6–82.9] (98.4) | 0.1 | 16.7 (21.3) | 0 | 5.5 | 78.4/17.0/4.6 | 0.27 | 4.6 | 0.0 | 1.6 (1.9) | 6.1 (7.3) |
| typical | 6 | 700 | 100.0 | 5.3 (5.6, 5.9) | 76.1 [68.7–84.4] (100.4) | 0.4 | 16.9 (21.5) | 0 | 5.4 | 80.2/16.3/3.5 | 0.24 | 3.5 | 0.0 | 1.6 (1.9) | 6.1 (7.3) |
| typical | 7 | 700 | 100.0 | 5.1 (5.4, 6.0) | 73.5 [67.3–81.4] (106.0) | 0.1 | 16.2 (20.3) | 0 | 5.2 | 82.7/14.8/2.6 | 0.20 | 2.6 | 0.0 | 1.6 (1.9) | 6.1 (7.3) |
| slow48 | 3 | 300 | 100.0 | 6.6 (7.1, 7.9) | 95.2 [84.3–109.6] (147.5) | 45.3 | 24.4 (38.2) | 0 | 14.8 | 61.8/22.6/15.6 | 0.63 | 15.9 | 0.2 | 1.6 (1.9) | 6.1 (7.3) |
| slow48 | 4 | 300 | 100.0 | 6.6 (7.0, 8.1) | 95.7 [83.5–110.1] (180.1) | 60.8 | 25.7 (38.7) | 0 | 14.3 | 67.0/20.0/13.0 | 0.54 | 13.5 | 0.2 | 1.6 (1.9) | 6.1 (7.3) |
| late0.4 | 3 | 150 | 100.0 | 5.5 (5.8, 6.2) | 78.2 [69.2–87.6] (109.0) | 0.0 | 17.4 (23.2) | 0 | 7.7 | 62.0/25.7/12.3 | 0.53 | 12.4 | 0.0 | 1.6 (1.8) | 6.2 (7.4) |
| late0.4 | 4 | 150 | 100.0 | 5.4 (5.7, 6.1) | 77.8 [68.9–87.1] (102.0) | 0.2 | 17.3 (23.1) | 0 | 6.6 | 74.9/18.2/6.9 | 0.34 | 6.9 | 0.0 | 1.6 (1.9) | 6.1 (7.4) |
| late0.4 | 5 | 150 | 100.0 | 5.4 (5.6, 6.0) | 77.1 [70.2–84.7] (96.5) | 0.0 | 17.1 (22.2) | 0 | 5.7 | 79.4/16.3/4.3 | 0.26 | 4.3 | 0.0 | 1.6 (1.8) | 6.1 (7.3) |
| late0.4 | 6 | 150 | 100.0 | 5.5 (5.7, 5.9) | 78.3 [70.8–86.7] (95.7) | 0.7 | 17.5 (22.4) | 0 | 5.6 | 80.4/16.6/3.0 | 0.23 | 3.0 | 0.0 | 1.6 (1.9) | 6.1 (7.3) |
| late0.4 | 7 | 150 | 100.0 | 5.2 (5.4, 5.6) | 73.8 [68.3–80.9] (89.8) | 0.0 | 16.3 (20.3) | 0 | 5.4 | 81.4/15.9/2.7 | 0.22 | 2.7 | 0.0 | 1.6 (1.8) | 6.0 (7.2) |
| tapper | 3 | 30 | 100.0 | 6.2 (6.6, 6.7) | 90.1 [81.7–98.2] (107.1) | 6.7 | 20.7 (27.2) | 0 | 10.9 | 25.8/26.3/47.9 | 1.57 | 69.7 | 43.6 | 1.6 (1.9) | 6.0 (7.3) |
| tapper | 4 | 30 | 100.0 | 6.2 (6.5, 6.6) | 89.2 [81.2–98.2] (108.5) | 9.2 | 20.6 (27.9) | 0 | 9.7 | 33.9/20.9/45.2 | 1.55 | 66.5 | 39.4 | 1.6 (1.8) | 6.2 (7.3) |
| tapper | 5 | 30 | 100.0 | 6.3 (6.7, 6.8) | 91.6 [82.6–99.9] (107.7) | 15.8 | 21.6 (29.5) | 0 | 9.8 | 30.6/21.0/48.4 | 1.71 | 69.8 | 48.2 | 1.6 (1.9) | 6.2 (7.4) |
| tapper | 6 | 30 | 100.0 | 6.4 (6.8, 6.9) | 92.1 [83.1–101.7] (111.5) | 25.8 | 22.3 (30.5) | 0 | 9.6 | 27.2/26.9/45.9 | 1.62 | 72.8 | 47.2 | 1.6 (1.9) | 6.0 (7.4) |
| tapper | 7 | 30 | 100.0 | 6.3 (6.7, 6.8) | 91.2 [82.7–99.4] (107.1) | 17.5 | 21.6 (31.1) | 0 | 10.4 | 20.9/20.3/58.8 | 2.19 | 76.0 | 53.8 | 1.6 (1.8) | 6.2 (7.4) |
| spammer | 3 | 30 | 100.0 | 4.7 (4.8, 4.9) | 67.6 [64.7–70.9] (76.5) | 0.0 | 14.8 (16.5) | 0 | 5.8 | 23.5/25.8/50.6 | 1.56 | 55.2 | 7.9 | 1.6 (2.0) | 6.0 (7.3) |
| spammer | 4 | 30 | 100.0 | 4.9 (4.9, 5.1) | 69.4 [65.3–74.7] (78.0) | 0.0 | 15.2 (17.7) | 0 | 5.2 | 28.5/21.3/50.2 | 1.82 | 53.5 | 9.0 | 1.6 (1.9) | 6.1 (7.1) |
| spammer | 5 | 30 | 100.0 | 5.0 (5.2, 5.2) | 71.8 [68.2–75.5] (78.8) | 0.0 | 15.8 (18.1) | 0 | 5.0 | 23.5/17.7/58.8 | 2.28 | 61.3 | 15.4 | 1.6 (1.9) | 6.1 (7.3) |
| spammer | 6 | 30 | 100.0 | 5.1 (5.2, 5.3) | 72.8 [69.0–77.5] (82.6) | 0.0 | 16.1 (18.2) | 0 | 4.9 | 23.8/12.5/63.7 | 2.56 | 67.1 | 17.9 | 1.6 (2.1) | 6.0 (7.3) |
| spammer | 7 | 30 | 100.0 | 4.9 (5.1, 5.1) | 70.4 [67.9–73.3] (75.0) | 0.0 | 15.4 (17.1) | 0 | 4.9 | 9.6/17.3/73.1 | 2.96 | 76.7 | 23.3 | 1.6 (2.0) | 6.2 (7.3) |
| absent | 3 | 3 | – | (never ends: no auto-play) | – | – | – | – | – | – | – | – | – | – | idle nudges at 12, 30, 57, 87, 117, 147, 177 s after the ask |
| absent | 4 | 3 | – | (never ends: no auto-play) | – | – | – | – | – | – | – | – | – | – | idle nudges at 12, 30, 57, 87, 117, 147, 177 s after the ask |
| absent | 5 | 3 | – | (never ends: no auto-play) | – | – | – | – | – | – | – | – | – | – | idle nudges at 12, 30, 57, 87, 117, 147, 177 s after the ask |
| absent | 6 | 3 | – | (never ends: no auto-play) | – | – | – | – | – | – | – | – | – | – | idle nudges at 12, 30, 57, 87, 117, 147, 177 s after the ask |
| absent | 7 | 3 | – | (never ends: no auto-play) | – | – | – | – | – | – | – | – | – | – | idle nudges at 12, 30, 57, 87, 117, 147, 177 s after the ask |

- Target met for every engaged model: typical age-4 chapter **76.5 s** [p10 67 – p90 86], session 5.3 min (p90 5.6, max 6.2).
- **slow48 is the edge case:** chapter 95 s mean, p90 110 s, max 150–180 s; session p90 7.0–7.1 min, **max 8.1–8.2 min** (1 in ≈ 80
  sessions just over 8 min); 45–61 % of its chapters are cut to 3 rounds by the 75 s rule.
- Whoosh 1.6 s median, ≤ 2.1 s everywhere (spammer). Talk time 6.1 s mean (bots 3.3 s). Idle nudges for a child who never taps:
  12, 30, 57, 87, 117 s after the question (then main.js pauses after the 5th) — exactly the 12 s × 1.5 ↑ 30 s rule.
- Hints: 6.6 % of typical age-4 rounds, 12 % at age 3, 57 % for bot0.3; assist only for the random tapper (39–54 % of rounds).

Per topic (ages 3–4):

| model | age | topic | chapters | chapter s mean (p90) | round s | wrong / round | 3★ % | hint rounds % |
| bot0.3 | 4 | colors | 200 | 56.9 (62.1) | 12.8 | 1.83 | 20.0 | 61.8 |
| bot0.3 | 4 | shapes | 200 | 63.9 (70.0) | 14.5 | 2.49 | 13.8 | 72.5 |
| bot0.3 | 4 | count | 200 | 54.4 (57.4) | 12.2 | 0.58 | 64.9 | 22.5 |
| bot0.3 | 4 | animals | 200 | 67.8 (74.0) | 15.5 | 2.48 | 13.4 | 71.0 |
| typical | 3 | colors | 646 | 76.2 (85.4) | 16.9 | 0.54 | 62.3 | 13.2 |
| typical | 3 | shapes | 638 | 76.1 (86.0) | 16.9 | 0.54 | 62.4 | 13.3 |
| typical | 3 | size | 594 | 76.2 (85.6) | 16.9 | 0.55 | 62.2 | 13.9 |
| typical | 3 | animals | 583 | 79.4 (87.9) | 17.7 | 0.52 | 64.2 | 13.0 |
| typical | 3 | count | 339 | 77.6 (85.1) | 17.3 | 0.18 | 85.7 | 3.4 |
| typical | 4 | colors | 653 | 73.6 (83.6) | 16.2 | 0.34 | 73.6 | 6.9 |
| typical | 4 | shapes | 589 | 78.5 (86.7) | 17.5 | 0.43 | 68.2 | 8.9 |
| typical | 4 | count | 615 | 74.3 (82.6) | 16.4 | 0.11 | 91.0 | 1.5 |
| typical | 4 | animals | 601 | 81.4 (89.1) | 18.2 | 0.42 | 68.1 | 8.3 |
| typical | 4 | size | 342 | 74.0 (82.7) | 16.4 | 0.38 | 71.2 | 8.2 |
| slow48 | 3 | colors | 300 | 94.4 (109.1) | 24.1 | 0.63 | 60.7 | 15.4 |
| slow48 | 3 | shapes | 300 | 94.4 (108.2) | 24.4 | 0.65 | 61.0 | 17.4 |
| slow48 | 3 | size | 300 | 96.2 (111.5) | 24.5 | 0.63 | 62.0 | 15.8 |
| slow48 | 3 | animals | 300 | 95.7 (109.2) | 24.7 | 0.59 | 63.5 | 15.0 |
| slow48 | 4 | colors | 300 | 95.4 (109.6) | 24.3 | 0.59 | 63.2 | 14.3 |
| slow48 | 4 | shapes | 300 | 96.3 (110.6) | 25.7 | 0.69 | 60.0 | 18.2 |
| slow48 | 4 | count | 300 | 94.0 (106.4) | 26.5 | 0.19 | 86.9 | 4.9 |
| slow48 | 4 | animals | 300 | 97.0 (113.0) | 26.2 | 0.67 | 59.1 | 16.1 |

Count chapters are the easiest by far (0.10 wrong / round, 92 % 3★ for a typical 4-year-old vs 65–77 % elsewhere): countPop rounds
cannot be answered wrongly (every bubble is a target, extra presses only jiggle).

## 2. Taps on moving bubbles (late-finger probe)
Every 0.25 s of play, for every floating bubble, the world's own hit test (`_bubbleAt`) was asked what a finger placed at the spot the
bubble had 0.2 / 0.3 / 0.4 s earlier would get NOW: the same bubble (hit), a **neighbour (= judged as a wrong answer although the
child aimed right)**, or nothing (a soft sky press). ≈ 47 M probes, all models pooled.

| season | lag s | exact old spot: hit / neighbour / miss % | + aim ± 0.5 r | only bubbles moving > 60 px/s | first 1.5 s of play | after 1.5 s |
|---|---|---|---|---|---|---|
| spring | 0.2 | 100.0 / 0.00 / 0.00 (n 3878126) | 100.0 / 0.01 / 0.04 (n 3878126) | 100.0 / 0.00 / 0.03 (n 403039) | 100.0 / 0.00 / 0.01 (n 824278) | 100.0 / 0.00 / 0.00 (n 3053848) |
| spring | 0.3 | 99.6 / 0.04 / 0.40 (n 3878126) | 99.3 / 0.11 / 0.58 (n 3878126) | 95.8 / 0.43 / 3.81 (n 403039) | 97.9 / 0.21 / 1.86 (n 824278) | 100.0 / 0.00 / 0.00 (n 3053848) |
| spring | 0.4 | 98.1 / 0.34 / 1.55 (n 3878126) | 97.8 / 0.33 / 1.89 (n 3878126) | 81.9 / 3.26 / 14.82 (n 403039) | 91.2 / 1.59 / 7.22 (n 824278) | 100.0 / 0.00 / 0.02 (n 3053848) |
| summer | 0.2 | 100.0 / 0.00 / 0.00 (n 3939579) | 99.9 / 0.01 / 0.05 (n 3939579) | 100.0 / 0.00 / 0.04 (n 403241) | 100.0 / 0.00 / 0.02 (n 862374) | 100.0 / 0.00 / 0.00 (n 3077205) |
| summer | 0.3 | 99.5 / 0.06 / 0.46 (n 3939579) | 99.2 / 0.13 / 0.64 (n 3939579) | 94.9 / 0.55 / 4.54 (n 403241) | 97.6 / 0.25 / 2.12 (n 862374) | 100.0 / 0.00 / 0.00 (n 3077205) |
| summer | 0.4 | 98.0 / 0.37 / 1.58 (n 3939579) | 97.7 / 0.37 / 1.93 (n 3939579) | 81.0 / 3.65 / 15.38 (n 403241) | 91.1 / 1.71 / 7.21 (n 862374) | 100.0 / 0.00 / 0.01 (n 3077205) |
| autumn | 0.2 | 100.0 / 0.00 / 0.00 (n 3760048) | 99.9 / 0.01 / 0.05 (n 3760048) | 100.0 / 0.00 / 0.03 (n 410161) | 100.0 / 0.00 / 0.01 (n 853462) | 100.0 / 0.00 / 0.00 (n 2906586) |
| autumn | 0.3 | 99.5 / 0.06 / 0.49 (n 3760048) | 99.2 / 0.14 / 0.66 (n 3760048) | 95.0 / 0.53 / 4.47 (n 410161) | 97.6 / 0.25 / 2.15 (n 853462) | 100.0 / 0.00 / 0.00 (n 2906586) |
| autumn | 0.4 | 98.0 / 0.41 / 1.60 (n 3760048) | 97.6 / 0.40 / 1.99 (n 3760048) | 81.7 / 3.76 / 14.57 (n 410161) | 91.2 / 1.81 / 7.02 (n 853462) | 100.0 / 0.00 / 0.00 (n 2906586) |
| winter | 0.2 | 100.0 / 0.00 / 0.00 (n 3926494) | 99.9 / 0.01 / 0.05 (n 3926494) | 100.0 / 0.00 / 0.04 (n 400476) | 100.0 / 0.00 / 0.02 (n 855008) | 100.0 / 0.00 / 0.00 (n 3071486) |
| winter | 0.3 | 99.5 / 0.06 / 0.48 (n 3926494) | 99.2 / 0.13 / 0.67 (n 3926494) | 94.8 / 0.54 / 4.70 (n 400476) | 97.5 / 0.25 / 2.20 (n 855008) | 100.0 / 0.00 / 0.00 (n 3071486) |
| winter | 0.4 | 98.0 / 0.37 / 1.67 (n 3926494) | 97.7 / 0.36 / 1.98 (n 3926494) | 80.2 / 3.60 / 16.25 (n 400476) | 90.7 / 1.68 / 7.61 (n 855008) | 100.0 / 0.00 / 0.01 (n 3071486) |

**All late-tap errors happen in the first 1.5 s after the question**: the question is asked 0.4 s (`askAfterBlow`) after the last
bubble detaches, while that bubble is still travelling home at 250–515 px/s (median settle 1.4 s after the question, p90 1.7 s, max
2.5 s). After 1.5 s, hits are 100.0 % at every lag and in every season. **Autumn wind is not a problem:** during gusts the bubbles
drift p50 12 px / p99 31.5 px / max 55 px from home (calm: p50 11, p99 23 px) and a 0.4 s-late tap still hits 100 % (n 2 466).

| bubble speed in play (px/s) | p50 | p90 | p99 | max |
|---|---|---|---|---|
| first 2 s of play (still arriving) | 37 | 163 | 277 | 515 |
| after 2 s (resting, after wrong taps, gusts) | 18 | 26 | 77 | 439 (spammer double impulse) |

Resting motion is floaty (18 px/s median, Lissajous wander ± 10 px). Overlaps during play (35.6 M frames): two films never more than
4.4 px into each other; a bubble pushed into the speech bubble / HUD 0.015 % of frames (max 12.9 px), into Bao's tap box 0.14 % (max
26.9 px; spammer 0.45 %, typical 0.11 %, max 18 px) — always after a wrong-tap impulse (260 px/s) against the soft wall.

## 3. Content variety
129 019 rounds: the same round key twice in one session 0.00 %, the same set of things twice in a session 0.09 %; "Play again" never
repeats the chapter order (0 of 2 000 replays; on average 1.1 of 4 chapter slots keep their topic, chapter 1 always changes).
Counting chapter, ages 3–4 (`content.makeRound`, 400 chapters):
- countPop round 0 always asks **2** (100 %); round 2 asks 3 or 4. 48 % of countPop rounds fill the bubbles with **1-star things**.
- countSel round 1 (3 bubbles): asks 1 (28 %), 3 (25 %), 4 (22 %), 5 (26 %), never 2 (round 0 always asked 2 → `prevRule`).
- **countSel round 3 (4 bubbles, stars 1–5, target ≥ 2 away from every other): only two sets exist — [1,3,4,5] "1 star" (50 %) and
  [1,2,3,5] "5 stars" (50 %).** The answer is always the fewest or the most: no counting needed, and the same two rounds every time.

## 4. Freed things, rewards
- Multi-target rounds (typical age 4, 224 follow-up pops): 22 % of the 2nd/3rd pops happen while the previous freed thing is still
  hopping / flying, but it passes within R + thing/2 of the bubble being pressed only 1.8 % of the time (median gap between pops 1.8 s,
  flight 1.03 s). Not distracting enough to change.
- A typical round is 17 s: 10.5 s play, 6.5 s watching (blow 2.9, flight + paint 1.5, rainbow 1.4, whoosh 1.6, out 0.6).

## 5. In the real page (Playwright Chromium, `?speed=8&bot=1&autostart=1&autorestart=1&mute=1`, age 4)
| viewport | wall s | world s | sessions finished (autorestart) | rounds | console / page errors | event order violations | frame ms p50 / p95 / p99 / max | slow-frame share |
|---|---|---|---|---|---|---|---|---|
| iPhone portrait 393×852 @3 (EN) | 100 | 803 | 3 | 60 | 0 | 0 | 16.7 / 33.4 / 33.4 / 83 | 15 % |
| iPad landscape 1180×820 @2 (VI) | 100 | 794 | 3 | 59 | 0 | 0 (*) | 16.7 / 50 / 100 / 250 | 35 % |
| iPhone portrait, earlier 50 s run | 50 | 402 | 1 | 30 | 0 | 0 | 16.7 / 33.4 / 50 / 167 | 18 % |

(*) 2 flags in the first round only = the event hook was attached mid-round (harness artefact). Order checked: round → ask → right × k
→ roundDone (with exactly k rights) → rainbowDone → whoosh; 4 levels per session; stars never go down. `PB.debug.stats` matched the event
stream (e.g. iPhone: 109 right = 109 paints, 60 rainbows = 60 whooshes, 14 talks / 10 right). Only warnings: the AudioContext autoplay
notice (no user gesture in headless). Frame times are a software-rendered (SwiftShader) container, not a device: the world itself costs
0.13 ms / frame at speed 1 (0.3–0.5 ms at speed 8); render is the cost, and `adapt()` drops `render.quality` to its 0.52 floor within
4 s on both shapes even at speed 1. Worth one look on a real older iPhone (see P3-4).

## 6. Designer's view (a 4-year-old)
Fun: yes — popping is instantly satisfying, every right pop has three rewards (pop + name, the thing hopping, a rainbow piece) and the
rainbow + whoosh closes each round. Pacing is right for 4 (76 s chapters, 5.3 min sessions, a surprise once per chapter); the slow
3-year-old is near the upper edge. Plural targets read well ("Pop the red ones!" → "One more red one!"). The confusing spot is the
counting chapter: it alternates "Pop 2 bubbles!" (pop several) with "Pop the bubble with 3 stars!" (pop ONE) without ever framing the
switch, the countPop bubbles often hold 1 star each, and one countSel variant ("Find 3 stars! Pop that bubble!") literally says "find
3 stars" — the exact cue for popping three 1-star bubbles. The reward after a perfect round is quieter than after a mistake (praise is
said only after a miss or in the chapter's last round — 75 % of a 4-year-old's rounds are perfect).

## 7. Recommended changes (prioritized; numbers re-simulated with `--config` where a CONFIG value can express the change)

### P1 — fix before shipping
1. **Ask only once the bubbles have arrived: `askAfterBlow 0.4 → 1.0`.** A child who taps right after the question, 0.4 s late,
   on the bubble that is still flying in: 91.7 % hit / **2.4 % a neighbour judged WRONG** / 5.9 % sky (autumn 89.2 / 3.4 / 7.3).
   Re-simulated (`--config '{"askAfterBlow":1.0}'`, typical + late0.4 + slow48 + spammer, ages 3–4, 640 sessions each):

   | config | 0.4 s-late tap, first 1.5 s of play: hit / neighbour / miss % | settle after the question (median / p90) | typical age-4 chapter s | session min |
   |---|---|---|---|---|
   | base (0.4) | 91.7 / 2.44 / 5.88 (autumn 89.2 / 3.43 / 7.34) | 1.4 / 1.7 s | 77.0 | 5.4 |
   | 0.7 (*) | 98.7 / 0.52 / 0.83 | 1.1 / 1.4 s | 75.5 → 77.2 | 5.4 |
   | 0.8 (*) | 99.4 / 0.34 / 0.30 | 1.0 / 1.3 s | 75.5 → 78.3 | 5.5 |
   | **1.0** | **99.7 / 0.19 / 0.11 (autumn 99.4 / 0.29 / 0.34)** | 0.8 / 1.1 s | 77.0 → 78.3 | 5.5 |

   (*) `qa_focus.js`, 24 sessions each, against its own base of 75.5 s. Cost +0.6 s per round; all targets still met (slow48 session p90 7.1 min, as before).
   `detachV [300, 400]` + `floatVMax 420` does NOT help (neighbour 3.7 %); `homeZeta 0.75` halves it only (2.9 / 1.4 %).
2. **countSel round 3 at ages ≤ 4 has only two possible rounds** ([1,3,4,5] "1 star", [1,2,3,5] "5 stars", 50 / 50) — always the
   fewest or the most. In `content.js sizeFor`: `return { n: short || age <= 4 ? 3 : (ri % 4 === 1 ? 3 : 4), k: 1, mode: 'countSel' }`
   (3 bubbles allow any target 1–5 with the ≥ 2 gap; round 1 with 3 bubbles already gives 1 / 3 / 4 / 5 at 28 / 25 / 22 / 26 %).
   Content-only, not expressible as CONFIG; re-run `tests/sim/content_stats.js` after it.
3. **Frame the count switch and remove the "find N stars" cue** (voice & input engineer + content):
   - The long `.first` question is only used in a chapter's round 0, which is always countPop, so `p.countSel.first` ("Count the stars!
     Pop the bubble with {n} stars!") is never heard. Send `first: true` with the chapter's FIRST countSel ask (round 1) as well
     (`world.js _ask` line ≈ 639: emit `first: (!!first && this.round === 0) || (cur.mode === 'countSel' && this.round === 1)`,
     keep `chapterFirst` as is; AND main.js `case 'ask'`, which today forces
     `first: !!e.first && e.round === 0` — make it `!!e.first`).
   - Replace the 2nd countSel variant EN `'Find {n} {starWord}! Pop that bubble!'` → `'Which bubble has {n} {starWord} inside? Pop it!'`,
     VI `'Bé tìm {n} {starWord} rồi chọc nhé!'` → `'Bé tìm bong bóng có {n} {starWord} rồi chọc nhé!'`.
   - countPop bubbles: toys only (today 48 % of countPop rounds are 1-star bubbles, so "stars" means two different tasks in one chapter).
     `content.js` countPop thing: drop the `stars n 1` option, and in `validate` (line ≈ 564) accept only `kind === 'toy'`.

### P2 — worth doing
4. **Slow 3-year-old session cap.** slow48 session max 8.1–8.2 min (p90 7.0–7.1), chapter max 150–180 s. Tested:

   | config | slow48 age 3: session p90 / max min, chapter mean (p90, max) s, cut % | slow48 age 4 | typical age 4: chapter s, short rounds % |
   |---|---|---|---|
   | base | 7.0 / 8.2, 95.2 (107.7, 152.2), 40 % | 7.1 / 7.4, 94.8 (107.7, 150.0), 58 % | 77.0, 5.3 % |
   | `chapterTimeLimit 70` | 7.0 / 8.2, 92.8 (106.0, 152.2), 54 % | 6.7 / 7.4, 90.4 (104.2), 77 % | 76.9, — |
   | `chapterTimeLimit 65` | 6.6 / 8.2, 87.8 (105.4), 78 % | 6.6 / 7.2, 86.9 (100.3), 93 % | 76.5 (3.4 % cut) |
   | **`shortBudget [1e9, 22, 38, 52]`** | **6.9 / 7.3, 93.3 (105.2, 127.5), 32 %** | 7.2 / 7.7, 94.3 (106.9, 146.3), 51 % | 74.9, 16.7 % |

   Lowering the time limit only cuts round 4 and does not move the max. `shortBudget [1e9, 22, 38, 52]` brings every slow session under
   8 min AND lets more slow chapters finish all 4 rounds (32 % cut instead of 40 %), at the price of 1 in 6 typical rounds becoming a
   short (4 bubbles, 1 target) round. Recommended if the 8-min cap is a hard rule; otherwise leave as is.
5. **Praise a perfect round sometimes.** VOICE rule today: a `rainbowDone` praise only after a miss or in the chapter's last round →
   for a typical 4-year-old (75 % perfect rounds) rounds 1–3 of a clean chapter end with no praise word. Add the chapter's round 1 (2nd
   round) to the condition in main.js `rainbowDone` (`lr.missed || lastRoundOfChapter() || world.round === 1`), still droppable.

### P3 — polish
6. **Wrong-tap push into Bao / under the speech bubble**: `wrongImpulse 260 → 200`, `wallK 120 → 200` → Bao-box intrusion max
   24.2 → 15.0 px, speech bubble / HUD max 12.6 → 6.7 px, top speed after taps 455 → 338 px/s; durations / stars unchanged (480 sessions).
   The share of frames with any intrusion stays ≈ 0.15 %, and a bubble always wins the hit test over Bao, so it is cosmetic only.
7. countPop round 0 always asks 2 at ages ≤ 4 (`countPopChoices`): `[2, 3]` would add variety (then countSel round 1 can also ask 2).
8. Autumn wind, bubble overlap, whoosh length, freed-thing flights, idle / hint timing, Talk time: **no change** — all measured inside
   their targets (§2–§4).
9. Real device check: in headless Chromium `adapt()` pins `render.quality` at 0.52 within 4 s on iPhone and iPad shapes. On a real
   older iPhone, read `PB.debug.render().quality` after a minute of play; if it also sits at the floor, the threshold
   (`raw > 0.022`, `slowAcc > 1.5`) is too eager for 30 fps-capped Low Power Mode.

## Reproduce
```
node tests/sim/qa_playtest.js --n 200 --models bot0.3,bot0.6,bot0.9 --tag bots     # also typical (--again 3), slow48, late0.4, tapper, spammer, absent
node tests/sim/qa_playtest.js --n 80 --ages 3,4 --models typical,late0.4,slow48,spammer --seed 11 --config '{"askAfterBlow":1.0}' --tag ask10
node tests/sim/qa_report.js bots typical …          # tables
node tests/sim/qa_focus.js --n 24 --config '{"askAfterBlow":0.8}'
node tests/sim/qa_browser.js --secs 100 --vp iphone-portrait,ipad-landscape
```
