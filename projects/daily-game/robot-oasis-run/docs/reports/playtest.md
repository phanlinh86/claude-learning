# Pebble's Oasis Run: high-speed playtest report

*Playtester: headless simulation, 2026-11-07. Report only: no `game/` file was changed. Every number below comes from `tests/sim/`.*

## TL;DR

- **12,600 headless rounds** were played, up to 8 simulated minutes each: 3 configurations × 4,200 rounds. Each configuration covers 14 player models × 3 difficulties × 100 seeds. A further 120 rounds per candidate were run for 14 CONFIG candidates. One full configuration takes about 2.3 min of wall time on 2 cores.
- **The game is fair.** No hit was unavoidable. An input-search oracle (beam search over move/jump every 0.1 s) checked **51 + 29** hits by the skill-1 bot and **164** hits by human models. Every one of them could have been dodged. All skill-1 bot hits are weaknesses of the bot, not of the track (§5).
- **No exploits.** Spamming jumps, zig-zagging or both makes the game harder, not easier: you die in 10–45 s. Doing nothing lasts **37 s on Easy** (first hit at about 8 s) and **15–18 s on Normal/Hard**. That is short, but it is not instant.
- **Chapter length is on target:** 61–74 s per chapter on every difficulty (ch1 72–74 s, ch4 61–62 s, loop-2 ch5 72–73 s). It barely depends on skill, because chapters are measured in distance.
- **Main problem: Easy chapter 1 is not yet "very gentle" for a 5–6-year-old.** The kid model takes **2.34 hits in ch1** (out of 5 hearts), and **61 % of those are Fizz's pillows**. It still reaches ch2 92 % of the time (target ≥ 60 % ✓), but only 38 % reach ch3. With a 30 s rhythm, Fizz visits twice in every chapter. He is on screen 22–26 % of the time, and his first visit comes before a kid has learned the pots.
- **Proposal (3 CONFIG values):** `bossEvery 30 → 40`, `difficulty.easy.pillows 3 → 2`, `difficulty.easy.aimRandom 0.5 → 0.7`. Kid on Easy: **ch1 hits 2.34 → 1.44**, pillow hits in ch1 **1.42 → 0.40**, **reach ch2 92 → 98 %**, **reach ch3 38 → 67 %**, median survival **128 → 174 s**. Normal and Hard keep their bite: skill-0.5 bot and casual adult numbers move by less than ±15 %. The skill-1 bot stays at about 0 hits. Fizz is on screen 13–18 % of the time instead of 22–26 %.

## 1. Method

| piece | file | what it does |
|---|---|---|
| player models | `tests/sim/players.js` | drive the world **only** through `move()` / `jump()` and act after a reaction delay on what they can "see" |
| runner | `tests/sim/playtest.js` | runs all rounds in 2 worker processes, aggregates the results, writes `results/<name>.json`; `--patch file.json` deep-merges a patch into a **copy** of `PO.World.CONFIG` (each `load()` gets its own vm) |
| oracle | `tests/sim/oracle.js` | replays a run up to 2.5 s before a hit (never before the previous hit), clones the world, and tries {none, ←, →, jump, ←+jump, →+jump} every 0.1 s (beam 250, de-duplicated by hero state + pillow targets). If no sequence survives to hit + 1.5 s, the hit is **unavoidable**. Checked against a synthetic 3-lane pot wall (correctly flagged unavoidable) and a 2-lane wall (correctly found the gap). |
| A/B | `tests/sim/explore.js` | quick comparison of candidate patches on the groups that matter |
| tables | `tests/sim/report.js` | prints the tables in this report |

The runs use dt = 1/60 s (the world sub-steps at 1/120 s), a cap of 480 s and seeds 1–100. "Survival" means time until game over, capped at 480 s.

**Player models**

| model | what it is |
|---|---|
| `bot0.3 … bot1` | `PO.Bot` with skill 0.3 / 0.5 / 0.7 / 0.9 / 1.0 |
| `kid` (5–6 y) | reaction **0.6–0.9 s**; sees only the **nearest row** of obstacles, up to 2.2 s ahead; misses 8 % of obstacles until they are within 0.45 s; spots a pillow **in flight** only half the time (otherwise only once it has landed); **12 % wrong-way swipes** (it notices and corrects after another reaction delay); jumps by eye at about 0.33 s before contact, **+0.08 s late on average, σ 0.14 s**; **0.12 random jumps/s**; drifts back to the **middle lane** (0.5/s when nothing is close); chases a shell row in a neighbouring lane 35 % of the time; does not predict where a tumbleweed will roll |
| `adult` (casual) | reaction **0.30–0.40 s**; looks **2 s** ahead in all lanes; predicts tumbleweeds; misses 3 % of obstacles; 1 % wrong-way swipes; jump timing +0.02 ± 0.06 s; waits instead of switching into a lane that is about to be blocked; no two-lane switch through a blocked middle lane |
| `jumpSpam` | presses jump every frame in the middle lane |
| `zigzag` / `zigJump` | changes lane every 0.25 s (and jumps every frame) |
| `idleMid` / `idleSide` | never touches anything (middle lane / left lane) |
| `botAlwaysJump` | skill-0.9 bot for lanes, plus jump pressed every frame |
| `botNeverJump` | skill-0.9 bot with jumping removed |

## 2. Baseline: current CONFIG

### 2.1 Survival, score, progress

Survival is capped at 480 s. "reach chN" is the share of runs that entered chapter N.


| group | survival p10 / p50 / p90 (s) | score p10 / p50 / p90 | reach ch2 / ch3 / ch5 | 1st shell p50 | 1st hit p10 / p50 | pillow dodge | perfect visits |
|---|---|---|---|---|---|---|---|
| easy · bot0.3 | 155 / 225 / 336 | 2508 / 4060 / 7255 | 99 / 90 / 24 % | 3.0 s | 14 / 37 s | 88 % | 66 % |
| easy · bot0.5 | 480 / 480 / 480 | 12120 / 13000 / 13533 | 100 / 100 / 100 % | 3.0 s | 35 / 154 s (4 % never) | 97 % | 89 % |
| easy · bot0.7 | 480 / 480 / 480 | 12407 / 12900 / 13436 | 100 / 100 / 100 % | 3.0 s | 74 / 336 s (86 % never) | 100 % | 99 % |
| easy · bot0.9 | 480 / 480 / 480 | 11967 / 12395 / 12905 | 100 / 100 / 100 % | 3.0 s | 145 / 208 s (92 % never) | 100 % | 100 % |
| easy · bot1 | 480 / 480 / 480 | 11722 / 12140 / 12600 | 100 / 100 / 100 % | 3.0 s | 96 / 177 s (89 % never) | 100 % | 99 % |
| easy · kid | 96 / 128 / 186 | 776 / 1355 / 2265 | 92 / 38 / 0 % | 3.6 s | 14 / 35 s | 75 % | 41 % |
| easy · adult | 480 / 480 / 480 | 9079 / 9580 / 10291 | 100 / 100 / 100 % | 3.0 s | 39 / 148 s (6 % never) | 98 % | 94 % |
| easy · jumpSpam | 28 / 45 / 62 | 50 / 220 / 431 | 3 / 0 / 0 % | 4.0 s | 3 / 8 s | 76 % | 31 % |
| easy · zigzag | 19 / 29 / 42 | 99 / 295 / 530 | 0 / 0 / 0 % | 3.2 s | 3 / 6 s | 45 % | 6 % |
| easy · zigJump | 19 / 29 / 46 | 59 / 160 / 351 | 0 / 0 / 0 % | 3.2 s | 3 / 6 s | 94 % | 43 % |
| easy · idleMid | 28 / 37 / 57 | 70 / 285 / 574 | 1 / 0 / 0 % | 4.0 s | 3 / 8 s | 45 % | 5 % |
| easy · idleSide | 30 / 37 / 64 | 50 / 230 / 450 | 2 / 0 / 0 % | 4.8 s | 3 / 10 s | 43 % | 4 % |
| easy · botAlwaysJump | 170 / 238 / 480 | 2315 / 3580 / 9136 | 100 / 94 / 33 % | 3.2 s | 37 / 79 s | 96 % | 85 % |
| easy · botNeverJump | 100 / 122 / 153 | 1528 / 1955 / 2542 | 100 / 20 / 0 % | 3.0 s | 34 / 67 s | 90 % | 70 % |
| normal · bot0.3 | 54 / 97 / 155 | 959 / 1995 / 3336 | 75 / 11 / 0 % | 2.4 s | 11 / 35 s | 86 % | 51 % |
| normal · bot0.5 | 302 / 480 / 480 | 7578 / 13885 / 14665 | 100 / 99 / 91 % | 2.4 s | 35 / 96 s | 95 % | 79 % |
| normal · bot0.7 | 480 / 480 / 480 | 13369 / 13970 / 14483 | 100 / 100 / 100 % | 2.4 s | 78 / 335 s (75 % never) | 100 % | 99 % |
| normal · bot0.9 | 480 / 480 / 480 | 12841 / 13320 / 13891 | 100 / 100 / 100 % | 2.4 s | 95 / 247 s (86 % never) | 100 % | 99 % |
| normal · bot1 | 480 / 480 / 480 | 12490 / 12925 / 13550 | 100 / 100 / 100 % | 2.4 s | 53 / 251 s (86 % never) | 100 % | 99 % |
| normal · kid | 34 / 49 / 67 | 279 / 515 / 853 | 7 / 0 / 0 % | 2.9 s | 6 / 25 s | 62 % | 11 % |
| normal · adult | 174 / 480 / 480 | 2649 / 9810 / 10741 | 97 / 92 / 71 % | 2.4 s | 25 / 82 s | 98 % | 89 % |
| normal · jumpSpam | 11 / 18 / 31 | 10 / 80 / 210 | 0 / 0 / 0 % | 3.9 s | 2 / 6 s | 60 % | 0 % |
| normal · zigzag | 9 / 13 / 19 | 30 / 125 / 281 | 0 / 0 / 0 % | 2.7 s | 2 / 4 s | – % | – % |
| normal · zigJump | 9 / 13 / 19 | 20 / 60 / 151 | 0 / 0 / 0 % | 2.7 s | 2 / 4 s | – % | – % |
| normal · idleMid | 11 / 18 / 31 | 30 / 135 / 362 | 0 / 0 / 0 % | 3.7 s | 2 / 6 s | 20 % | 0 % |
| normal · idleSide | 10 / 18 / 34 | 0 / 110 / 293 | 0 / 0 / 0 % | 3.3 s | 2 / 6 s | 22 % | 0 % |
| normal · botAlwaysJump | 96 / 134 / 198 | 1038 / 1675 / 2808 | 98 / 36 / 0 % | 2.5 s | 35 / 70 s | 95 % | 77 % |
| normal · botNeverJump | 80 / 91 / 109 | 1337 / 1665 / 1993 | 91 / 0 / 0 % | 2.4 s | 34 / 64 s | 87 % | 52 % |
| hard · bot0.3 | 40 / 92 / 111 | 872 / 2155 / 2882 | 65 / 1 / 0 % | 2.1 s | 10 / 35 s | 85 % | 39 % |
| hard · bot0.5 | 139 / 308 / 480 | 3676 / 8760 / 14680 | 97 / 88 / 54 % | 2.1 s | 33 / 68 s | 94 % | 71 % |
| hard · bot0.7 | 480 / 480 / 480 | 14639 / 15315 / 15961 | 100 / 100 / 100 % | 2.1 s | 125 / 246 s (51 % never) | 100 % | 99 % |
| hard · bot0.9 | 480 / 480 / 480 | 14169 / 14695 / 15346 | 100 / 100 / 100 % | 2.1 s | 155 / 307 s (74 % never) | 100 % | 99 % |
| hard · bot1 | 480 / 480 / 480 | 13870 / 14380 / 14992 | 100 / 100 / 100 % | 2.1 s | 98 / 238 s (78 % never) | 100 % | 99 % |
| hard · kid | 27 / 35 / 58 | 229 / 445 / 790 | 0 / 0 / 0 % | 2.4 s | 5 / 19 s | 52 % | 0 % |
| hard · adult | 127 / 434 / 480 | 2103 / 9525 / 11221 | 97 / 87 / 66 % | 2.1 s | 14 / 82 s | 97 % | 86 % |
| hard · jumpSpam | 10 / 16 / 25 | 0 / 70 / 191 | 0 / 0 / 0 % | 3.2 s | 2 / 5 s | 77 % | 0 % |
| hard · zigzag | 6 / 10 / 20 | 20 / 110 / 310 | 0 / 0 / 0 % | 2.1 s | 2 / 4 s | – % | – % |
| hard · zigJump | 6 / 10 / 20 | 10 / 60 / 160 | 0 / 0 / 0 % | 2.7 s | 2 / 4 s | – % | – % |
| hard · idleMid | 10 / 16 / 25 | 30 / 150 / 351 | 0 / 0 / 0 % | 3.1 s | 2 / 5 s | 20 % | 0 % |
| hard · idleSide | 8 / 15 / 26 | 0 / 110 / 294 | 0 / 0 / 0 % | 2.8 s | 2 / 5 s | 20 % | 0 % |
| hard · botAlwaysJump | 95 / 124 / 184 | 1190 / 1620 / 2821 | 100 / 29 / 1 % | 2.1 s | 36 / 67 s | 94 % | 65 % |
| hard · botNeverJump | 65 / 85 / 101 | 1220 / 1780 / 2182 | 79 / 0 / 0 % | 2.1 s | 33 / 36 s | 82 % | 32 % |


**Reading the table**

- **Easy kid:** first hit after a median of 35 s (p10 14 s); dies after a median of 128 s. 92 % reach ch2, 38 % reach ch3 and none reach ch5.
- **Kid on Normal/Hard:** dead within 35–49 s. Normal and Hard are not modes for a 5-year-old, and Easy is.
- **Casual adult:** on Easy, survives the whole 8 minutes in every run. On Normal and Hard, median survival is 480 / 434 s, and 71 % / 66 % reach ch5. That is a good adult curve.
- **Bots:** skill ≥ 0.7 is about invincible everywhere. Skill 0.5 is the "casual" bot: Normal 91 % reach ch5, Hard 54 %. Skill 0.3 is a struggling player: Normal 75 % reach ch2, Hard 65 %.
- **First shell:** collected in 2–4 s for every model, including a player who does nothing (lure shells lie in the free lane). The reward comes right away ✓.

### 2.2 Chapter durations: p50 (p10–p90), and Fizz visits per completed chapter


| group | ch1 | ch2 | ch3 | ch4 | ch5 (loop 2) |
|---|---|---|---|---|---|
| easy · bot0.5 | 72.0 s (72.0–72.2), 2.0 visits | 67.7 s (67.7–68.0), 2.0 visits | 64.0 s (64.0–64.3), 2.0 visits | 60.8 s (60.8–61.1), 2.0 visits | 71.7 s (71.7–72.0), 3.0 visits |
| easy · bot0.9 | 72.0 s (72.0–72.0), 2.0 visits | 67.7 s (67.7–67.7), 2.0 visits | 64.0 s (64.0–64.0), 2.0 visits | 60.8 s (60.8–60.8), 2.0 visits | 71.7 s (71.7–71.7), 3.0 visits |
| easy · adult | 72.0 s (72.0–72.2), 2.0 visits | 67.7 s (67.7–68.0), 2.0 visits | 64.0 s (64.0–64.6), 2.0 visits | 60.8 s (60.8–61.1), 2.0 visits | 71.7 s (71.7–72.0), 3.0 visits |
| easy · kid | 72.5 s (72.2–73.0), 2.0 visits | 68.2 s (67.7–68.8), 2.0 visits | 64.7 s (64.5–65.0), 2.0 visits | – | – |
| normal · bot0.5 | 73.1 s (73.1–73.3), 2.0 visits | 68.8 s (68.8–69.3), 2.0 visits | 65.3 s (65.0–65.6), 2.0 visits | 62.0 s (61.8–62.3), 2.0 visits | 73.1 s (72.8–73.3), 3.0 visits |
| normal · bot0.9 | 73.1 s (73.1–73.1), 2.0 visits | 68.8 s (68.8–68.8), 2.0 visits | 65.0 s (65.0–65.0), 2.0 visits | 61.8 s (61.8–61.8), 2.0 visits | 72.8 s (72.8–72.8), 3.0 visits |
| normal · adult | 73.1 s (73.1–73.3), 2.0 visits | 69.0 s (68.8–69.3), 2.0 visits | 65.3 s (65.0–65.3), 2.0 visits | 61.8 s (61.8–62.0), 2.0 visits | 72.8 s (72.8–73.3), 3.0 visits |
| normal · kid | 73.6 s (73.2–73.6), 2.0 visits | – | – | – | – |
| hard · bot0.5 | 73.5 s (73.5–73.9), 2.0 visits | 69.4 s (69.2–69.7), 2.0 visits | 65.8 s (65.5–66.0), 2.0 visits | 62.4 s (62.1–62.7), 3.0 visits | 73.5 s (73.3–73.8), 2.0 visits |
| hard · bot0.9 | 73.5 s (73.5–73.5), 2.0 visits | 69.2 s (69.2–69.2), 2.0 visits | 65.5 s (65.5–65.5), 2.0 visits | 62.1 s (62.1–62.1), 3.0 visits | 73.3 s (73.3–73.3), 2.0 visits |
| hard · adult | 73.5 s (73.5–74.1), 2.0 visits | 69.4 s (69.2–69.7), 2.0 visits | 65.8 s (65.5–65.8), 2.0 visits | 62.4 s (62.1–62.7), 3.0 visits | 73.5 s (73.3–73.8), 2.0 visits |
| hard · kid | – | – | – | – | – |


**Chapter length:** on target (60–80 s) everywhere. Chapters are a fixed distance, so a stumble barely moves them (±0.5 s). They shorten gently, from 72 s to 61 s across a loop, because of the +6 %/zone speed. Then they jump back to 72 s at loop 2 (goal +10 %).

### 2.3 Hits per chapter by cause

Each cell is the mean per run that entered the chapter: total = pots / log / tumble / pillow. The last column is the share of runs that entered a chapter and died in it.


| group | ch1 pots/log/tumble/pillow | ch2 | ch3 | ch4 | deaths in ch1 / ch2 / ch3 |
|---|---|---|---|---|---|
| easy · bot0.3 | 1.39 = 0.50 / 0.00 / 0.00 / 0.89 (n 100) | 1.77 = 0.23 / 1.01 / 0.00 / 0.53 (n 99) | 2.50 = 0.24 / 1.40 / 0.14 / 0.71 (n 90) | 2.53 = 0.24 / 1.84 / 0.04 / 0.42 (n 55) | 1 / 9 / 39 % |
| easy · bot0.5 | 0.36 = 0.17 / 0.00 / 0.00 / 0.19 (n 100) | 0.23 = 0.04 / 0.00 / 0.00 / 0.19 (n 100) | 0.44 = 0.05 / 0.08 / 0.03 / 0.28 (n 100) | 0.23 = 0.04 / 0.05 / 0.03 / 0.11 (n 100) | 0 / 0 / 0 % |
| easy · bot0.9 | 0.00 = 0.00 / 0.00 / 0.00 / 0.00 (n 100) | 0.01 = 0.00 / 0.00 / 0.00 / 0.01 (n 100) | 0.03 = 0.00 / 0.00 / 0.00 / 0.03 (n 100) | 0.01 = 0.00 / 0.00 / 0.01 / 0.00 (n 100) | 0 / 0 / 0 % |
| easy · adult | 0.23 = 0.12 / 0.00 / 0.00 / 0.11 (n 100) | 0.33 = 0.11 / 0.13 / 0.00 / 0.09 (n 100) | 0.56 = 0.09 / 0.25 / 0.07 / 0.15 (n 100) | 0.45 = 0.14 / 0.18 / 0.05 / 0.08 (n 100) | 0 / 0 / 0 % |
| easy · kid | 2.34 = 0.92 / 0.00 / 0.00 / 1.42 (n 100) | 2.97 = 0.45 / 1.26 / 0.00 / 1.26 (n 92) | 2.79 = 0.47 / 0.76 / 0.45 / 1.10 (n 38) | 2.17 = 0.00 / 1.17 / 0.33 / 0.67 (n 6) | 8 / 59 / 84 % |
| normal · bot0.3 | 1.69 = 0.63 / 0.00 / 0.00 / 1.06 (n 100) | 2.36 = 0.20 / 1.60 / 0.00 / 0.56 (n 75) | 2.09 = 0.09 / 1.64 / 0.00 / 0.36 (n 11) | 2.00 = 0.00 / 2.00 / 0.00 / 0.00 (n 1) | 25 / 85 / 91 % |
| normal · bot0.5 | 0.41 = 0.07 / 0.00 / 0.00 / 0.34 (n 100) | 0.62 = 0.03 / 0.21 / 0.00 / 0.38 (n 100) | 0.70 = 0.08 / 0.21 / 0.02 / 0.38 (n 99) | 0.75 = 0.07 / 0.15 / 0.05 / 0.48 (n 96) | 0 / 1 / 3 % |
| normal · bot0.9 | 0.00 = 0.00 / 0.00 / 0.00 / 0.00 (n 100) | 0.04 = 0.00 / 0.01 / 0.00 / 0.03 (n 100) | 0.02 = 0.00 / 0.01 / 0.00 / 0.01 (n 100) | 0.03 = 0.00 / 0.00 / 0.01 / 0.02 (n 100) | 0 / 0 / 0 % |
| normal · adult | 0.59 = 0.35 / 0.00 / 0.00 / 0.24 (n 100) | 0.88 = 0.20 / 0.47 / 0.00 / 0.21 (n 97) | 0.76 = 0.13 / 0.32 / 0.12 / 0.20 (n 92) | 0.81 = 0.23 / 0.35 / 0.02 / 0.20 (n 83) | 3 / 5 / 10 % |
| normal · kid | 2.89 = 1.26 / 0.00 / 0.00 / 1.63 (n 100) | 2.43 = 0.86 / 1.00 / 0.00 / 0.57 (n 7) | – | – | 93 / 100 / – % |
| hard · bot0.3 | 1.90 = 0.63 / 0.00 / 0.00 / 1.27 (n 100) | 2.55 = 0.25 / 1.77 / 0.00 / 0.54 (n 65) | 2.00 = 0.00 / 1.00 / 0.00 / 1.00 (n 1) | – | 35 / 99 / 100 % |
| hard · bot0.5 | 0.67 = 0.12 / 0.00 / 0.00 / 0.55 (n 100) | 0.94 = 0.14 / 0.28 / 0.00 / 0.52 (n 97) | 1.25 = 0.22 / 0.26 / 0.16 / 0.61 (n 88) | 1.40 = 0.10 / 0.46 / 0.26 / 0.58 (n 72) | 3 / 9 / 18 % |
| hard · bot0.9 | 0.00 = 0.00 / 0.00 / 0.00 / 0.00 (n 100) | 0.03 = 0.00 / 0.01 / 0.00 / 0.02 (n 100) | 0.01 = 0.00 / 0.00 / 0.00 / 0.01 (n 100) | 0.09 = 0.00 / 0.05 / 0.00 / 0.04 (n 100) | 0 / 0 / 0 % |
| hard · adult | 0.67 = 0.39 / 0.00 / 0.00 / 0.28 (n 100) | 0.98 = 0.28 / 0.37 / 0.00 / 0.33 (n 97) | 1.00 = 0.28 / 0.31 / 0.14 / 0.28 (n 87) | 0.86 = 0.27 / 0.25 / 0.03 / 0.31 (n 71) | 3 / 10 / 18 % |
| hard · kid | 3.00 = 1.50 / 0.00 / 0.00 / 1.50 (n 100) | – | – | – | 100 / – / – % |


**Where it hurts**

- **Easy kid, ch1:** pillows cause **1.42 of 2.34** hits. With the 30 s rhythm, a 72 s chapter 1 gets **two** Fizz visits (at 30 s and 60 s) with 3 pillows each, and 2 of the 3 are aimed at the kid's lane (`aimRandom 0.5` → 0.5 + 0.5/3 = 67 %).
  - A breakdown of 100 runs shows why: **129 of the kid's 142** ch1 pillow hits are **mistimed jumps** (the jump was planned, but too early or too late). Pillows have a longer collision depth than logs (d 0.30 against 0.18). At 5.5 u/s, that leaves only a **0.30 s** take-off window, against 0.36 s for a log.
  - 12 were never noticed, and 1 had no jump planned.
  - Pots hits (0.92 per chapter) come mostly from attention lapses and wrong-way swipes. That is realistic, and the 5 hearts absorb it.
- **Easy kid, ch2:** logs arrive (1.26 hits per chapter) and pillows stay (1.26), so 59 % of the kids who enter ch2 die there.
- **Adults and bots:** pillows are the main cause of hits for the skill-0.5 bot (about 60–80 %). For the casual adult, hits are spread evenly over pots, logs and pillows.

### 2.4 Fizz: dodge rates, perfect visits, rhythm

| | kid | casual adult | bot 0.5 | bot 0.9 |
|---|---|---|---|---|
| pillow dodge rate, Easy / Normal / Hard | 75 / 62 / 52 % | 98 / 98 / 97 % | 97 / 95 / 94 % | 100 / 100 / 100 % |
| perfect-visit rate, Easy / Normal / Hard | 41 / 11 / 0 % | 94 / 89 / 86 % | 89 / 79 / 71 % | 100 / 99 / 99 % |
| share of play time with Fizz on screen | 22 % (Easy) | 24–26 % | 24–26 % | 25 % |

**Rhythm verdict**

- With `bossEvery 30`, every chapter gets exactly **2.0 visits** (3 in some ch4/ch5), and Fizz is on screen about a quarter of the time.
- For adults this is lively but it overlaps a lot: a Fizz visit is never more than about 22 s away.
- For the kid it is **too frequent**. The first visit, at 30 s, comes after only about 12 pot rows, and the twist stops being a twist when it happens every half chapter.
- A 40 s rhythm gives **1 visit in ch1**, at 40 s, and then 1–2 per chapter. The chapter-1 → 2 arch (at 72–74 s) no longer coincides with a visit, because the 2nd visit starts at 80 s. With 36 s it would start exactly on the arch, at 72 s.

## 3. Exploits and degenerate play

| strategy | Easy | Normal | Hard | verdict |
|---|---|---|---|---|
| do nothing, middle lane | dies at 37 s (p10 28, p90 57); 1st hit 8 s | 18 s | 16 s | short, not instant ✓ |
| do nothing, side lane | 37 s | 18 s | 15 s | same; no "safe lane" |
| jump spam | 45 s | 18 s | 16 s | pots are not jumpable → no exploit ✓ |
| zig-zag every 0.25 s | 29 s | 13 s | 10 s | worse than doing nothing (it runs into pots) ✓ |
| zig-zag + jump spam | 29 s | 13 s | 10 s | ✓ |
| smart lanes + jump every frame (`botAlwaysJump`) | median 238 s, 33 % reach ch5 (bot 0.9: 480 s, 100 %) | 134 s | 124 s | **worse**: a jump buffered on landing leaves about 20 % of each cycle below log height → logs hit. No exploit ✓ |
| smart lanes, never jump (`botNeverJump`) | 122 s, 100 % reach ch2, 20 % reach ch3 | 91 s | 85 s | ch1 can be finished without jumping (by design: pots and shells only, and pillows can be side-stepped). From ch2 on you must jump ✓ |

**Nothing trivialises the game.** One harmless quirk: a player who doesn't move still collects shells after about 4 s (lure shells in the free lane), so score is never 0. That is good for kids.

## 4. Proposal: exact CONFIG changes

| key | old | new | why |
|---|---|---|---|
| `bossEvery` | `30` | **`40`** | 1 Fizz visit in chapter 1 instead of 2, and the first one comes at 40 s, after the kid has met about 16 pot rows. 1–2 visits per later chapter instead of 2. The ch1 → ch2 arch and a visit never coincide. Fizz on screen 13–18 % instead of 22–26 % (still a regular twist). `bossMinAway 12` stays. |
| `difficulty.easy.pillows` | `3` | **`2`** | shorter Easy visits (≈ 7 s instead of ≈ 8.5 s); the kid's perfect-visit rate goes from 41 % to 59 %, so "Fizz goes hmph" becomes something a kid actually sees |
| `difficulty.easy.aimRandom` | `0.5` | **`0.7`** | the share of Easy pillows that land in Pebble's lane drops from 67 % to 53 %. Fizz still visibly aims at you half the time. |

Patch file: `tests/sim/patches/proposal-boss40.json` = `{ "bossEvery": 40, "difficulty": { "easy": { "pillows": 2, "aimRandom": 0.7 } } }`

### 4.1 Before → after

Both sides: 4,200 rounds, the same seeds and the same player models. Baseline = `results/baseline.json`; after = `results/proposal-boss40.json`.


| group | survival p50 | reach ch2 | reach ch3 | ch1 hits (pillow) | ch2 hits | pillow dodge | perfect | boss on screen |
|---|---|---|---|---|---|---|---|---|
| easy · kid | 128 s → **174 s** | 92 % → **98 %** | 38 % → **67 %** | 2.34 (1.42) → **1.44 (0.40)** | 2.97 → **2.84** | 74.5 % → **78.6 %** | 41 % → **59 %** | 22 % → **13 %** |
| normal · kid | 49 s → **47 s** | 7 % → **24 %** | 0 % → **0 %** | 2.89 (1.63) → **2.68 (1.19)** | 2.43 → **2.25** | 61.8 % → **58.4 %** | 11 % → **11 %** | 16 % → **12 %** |
| easy · adult | 480 s → **480 s** | 100 % → **100 %** | 100 % → **100 %** | 0.23 (0.11) → **0.21 (0.03)** | 0.33 → **0.38** | 98.2 % → **98.5 %** | 94 % → **96 %** | 26 % → **15 %** |
| normal · adult | 480 s → **480 s** | 97 % → **100 %** | 92 % → **94 %** | 0.59 (0.24) → **0.38 (0.06)** | 0.88 → **0.78** | 97.5 % → **98.3 %** | 89 % → **92 %** | 24 % → **18 %** |
| hard · adult | 434 s → **461 s** | 97 % → **95 %** | 87 % → **86 %** | 0.67 (0.28) → **0.63 (0.12)** | 0.98 → **0.88** | 97.0 % → **97.3 %** | 86 % → **86 %** | 24 % → **18 %** |
| easy · bot0.3 | 225 s → **236 s** | 99 % → **100 %** | 90 % → **93 %** | 1.39 (0.89) → **0.93 (0.31)** | 1.77 → **1.77** | 87.9 % → **88.7 %** | 66 % → **77 %** | 24 % → **14 %** |
| easy · bot0.5 | 480 s → **480 s** | 100 % → **100 %** | 100 % → **100 %** | 0.36 (0.19) → **0.22 (0.05)** | 0.23 → **0.20** | 96.6 % → **97.0 %** | 89 % → **93 %** | 26 % → **15 %** |
| normal · bot0.5 | 480 s → **480 s** | 100 % → **100 %** | 99 % → **99 %** | 0.41 (0.34) → **0.33 (0.19)** | 0.62 → **0.50** | 94.9 % → **95.3 %** | 79 % → **81 %** | 25 % → **18 %** |
| hard · bot0.5 | 308 s → **405 s** | 97 % → **100 %** | 88 % → **85 %** | 0.67 (0.55) → **0.48 (0.30)** | 0.94 → **1.09** | 93.8 % → **94.2 %** | 71 % → **72 %** | 24 % → **18 %** |
| normal · bot1 | 480 s → **480 s** | 100 % → **100 %** | 100 % → **100 %** | 0.02 (0.02) → **0.01 (0.01)** | 0.03 → **0.00** | 99.8 % → **99.9 %** | 99 % → **100 %** | 25 % → **18 %** |
| hard · bot1 | 480 s → **480 s** | 100 % → **100 %** | 100 % → **100 %** | 0.00 (0.00) → **0.00 (0.00)** | 0.05 → **0.04** | 99.8 % → **99.8 %** | 99 % → **99 %** | 25 % → **18 %** |
| easy · idleMid | 37 s → **44 s** | 1 % → **4 %** | 0 % → **0 %** | 4.98 (1.25) → **4.94 (0.44)** | 3.00 → **2.50** | 44.9 % → **56.5 %** | 5 % → **29 %** | 14 % → **7 %** |
| easy · jumpSpam | 45 s → **46 s** | 3 % → **5 %** | 0 % → **0 %** | 4.95 (0.62) → **4.93 (0.24)** | 2.67 → **2.40** | 76.4 % → **78.1 %** | 31 % → **44 %** | 14 % → **7 %** |


**Effect of the proposal**

- **Kid on Easy:** chapter 1 becomes gentle: 1.44 hits out of 5 hearts, almost all of them pots. 98 % reach ch2 and 67 % reach ch3.
- **Normal and Hard:** essentially unchanged.
  - The casual adult reaches ch3 in 94 / 86 % of runs (was 92 / 87 %).
  - The skill-0.5 bot on Hard survives longer (median 405 s), but it reaches ch3 in 85 % of runs (was 88 %).
  - The skill-1 bot still takes about 0 hits.
- **Score:** median score drops by about 5–7 % for strong players, because there are fewer perfect-visit bonuses. For the kid it rises by 38 % (1,355 → 1,870) because the kid lives longer.

**After: chapter durations and visits**


| group | ch1 | ch2 | ch3 | ch4 | ch5 (loop 2) |
|---|---|---|---|---|---|
| easy · bot0.5 | 72.0 s (72.0–72.2), 1.0 visits | 67.7 s (67.7–68.0), 2.0 visits | 64.0 s (64.0–64.3), 2.0 visits | 60.8 s (60.8–61.1), 1.0 visits | 71.7 s (71.7–72.0), 2.0 visits |
| easy · adult | 72.0 s (72.0–72.2), 1.0 visits | 67.7 s (67.7–68.0), 2.0 visits | 64.0 s (64.0–64.3), 2.0 visits | 60.8 s (60.8–61.1), 1.0 visits | 71.7 s (71.7–72.0), 2.0 visits |
| easy · kid | 72.2 s (72.0–72.8), 1.0 visits | 68.2 s (68.0–68.8), 2.0 visits | 64.6 s (64.3–64.9), 2.0 visits | 61.3 s (61.1–61.8), 1.0 visits | 72.1 s (72.0–72.2), 2.0 visits |
| normal · bot0.5 | 73.1 s (73.1–73.3), 1.0 visits | 68.8 s (68.8–69.0), 2.0 visits | 65.0 s (65.0–65.4), 2.0 visits | 61.8 s (61.8–62.0), 1.0 visits | 73.0 s (72.8–73.3), 2.0 visits |
| normal · adult | 73.1 s (73.1–73.3), 1.0 visits | 69.0 s (68.8–69.3), 2.0 visits | 65.3 s (65.0–65.6), 2.0 visits | 61.8 s (61.8–62.3), 1.0 visits | 72.8 s (72.8–73.1), 2.0 visits |
| normal · kid | 73.6 s (73.3–73.6), 1.0 visits | – | – | – | – |
| hard · bot0.5 | 73.5 s (73.5–73.8), 1.0 visits | 69.4 s (69.2–69.7), 2.0 visits | 65.8 s (65.5–66.0), 2.0 visits | 62.4 s (62.1–62.7), 1.0 visits | 73.5 s (73.3–73.8), 2.0 visits |
| hard · adult | 73.5 s (73.5–74.0), 1.0 visits | 69.4 s (69.2–69.7), 2.0 visits | 65.8 s (65.5–66.0), 2.0 visits | 62.4 s (62.1–62.5), 1.0 visits | 73.4 s (73.3–73.5), 2.0 visits |
| hard · kid | 74.1 s (74.1–74.1), 1.0 visits | – | – | – | – |


**After: hits per chapter by cause**

| group | ch1 pots/log/tumble/pillow | ch2 | ch3 | ch4 | deaths in ch1 / ch2 / ch3 |
|---|---|---|---|---|---|
| easy · bot0.5 | 0.22 = 0.17 / 0.00 / 0.00 / 0.05 (n 100) | 0.20 = 0.09 / 0.03 / 0.00 / 0.08 (n 100) | 0.12 = 0.02 / 0.05 / 0.02 / 0.03 (n 100) | 0.27 = 0.09 / 0.06 / 0.03 / 0.09 (n 100) | 0 / 0 / 0 % |
| easy · adult | 0.21 = 0.18 / 0.00 / 0.00 / 0.03 (n 100) | 0.38 = 0.08 / 0.19 / 0.00 / 0.11 (n 100) | 0.30 = 0.08 / 0.12 / 0.07 / 0.03 (n 100) | 0.56 = 0.14 / 0.34 / 0.03 / 0.05 (n 100) | 0 / 0 / 0 % |
| easy · kid | 1.44 = 1.04 / 0.00 / 0.00 / 0.40 (n 100) | 2.84 = 0.65 / 1.39 / 0.00 / 0.80 (n 98) | 2.91 = 0.40 / 1.04 / 0.98 / 0.48 (n 67) | 2.26 = 0.26 / 1.26 / 0.32 / 0.42 (n 19) | 2 / 32 / 72 % |
| normal · bot0.5 | 0.33 = 0.14 / 0.00 / 0.00 / 0.19 (n 100) | 0.50 = 0.06 / 0.13 / 0.00 / 0.31 (n 100) | 0.56 = 0.07 / 0.14 / 0.04 / 0.31 (n 99) | 0.51 = 0.09 / 0.24 / 0.02 / 0.15 (n 97) | 0 / 1 / 2 % |
| normal · adult | 0.38 = 0.32 / 0.00 / 0.00 / 0.06 (n 100) | 0.78 = 0.20 / 0.48 / 0.00 / 0.10 (n 100) | 0.92 = 0.18 / 0.34 / 0.24 / 0.15 (n 94) | 0.73 = 0.24 / 0.34 / 0.09 / 0.07 (n 89) | 0 / 6 / 5 % |
| normal · kid | 2.68 = 1.49 / 0.00 / 0.00 / 1.19 (n 100) | 2.25 = 0.29 / 0.67 / 0.00 / 1.29 (n 24) | – | – | 76 / 100 / – % |
| hard · bot0.5 | 0.48 = 0.18 / 0.00 / 0.00 / 0.30 (n 100) | 1.09 = 0.13 / 0.45 / 0.00 / 0.51 (n 100) | 1.20 = 0.17 / 0.31 / 0.20 / 0.53 (n 85) | 0.93 = 0.12 / 0.30 / 0.24 / 0.27 (n 67) | 0 / 15 / 21 % |
| hard · adult | 0.63 = 0.51 / 0.00 / 0.00 / 0.12 (n 100) | 0.88 = 0.30 / 0.36 / 0.00 / 0.22 (n 95) | 1.07 = 0.34 / 0.29 / 0.19 / 0.26 (n 86) | 0.82 = 0.32 / 0.24 / 0.11 / 0.15 (n 72) | 5 / 10 / 16 % |
| hard · kid | 2.94 = 1.91 / 0.00 / 0.00 / 1.03 (n 100) | 2.00 = 0.00 / 0.17 / 0.00 / 1.83 (n 6) | – | – | 94 / 100 / – % |

### 4.2 Alternatives tried

Each candidate was run on 100 seeds, with a 260 s cap for the kid and 300 s for the others. Raw output: `results/explore-candidates.txt`.

| candidate | kid Easy: ch1 hits / reach ch2 / reach ch3 | adult Normal ch1 hits | bot 0.5 Normal: total hits in 300 s | verdict |
|---|---|---|---|---|
| baseline | 2.34 / 92 / 38 % | 0.59 | 274 | – |
| `easy.pillows 2` | 1.83 / 99 / 56 % | 0.59 | 274 | good, Easy-only |
| `easy.aimRandom 0.75` | 2.11 / 95 / 50 % | 0.59 | 274 | small gain |
| `easy.zLand 8.5, flightT 1.45` (more warning) | 2.20 / 98 / 44 % | 0.59 | 274 | small gain: the kid's problem is jump timing, not warning time |
| `bossEvery 36` | 1.48 / 100 / 55 % | 0.48 | 241 | good, but on Easy and Normal the 2nd visit lands right on the ch1 → ch2 arch (72 s) |
| `bossEvery 40` | 1.56 / 100 / 51 % | 0.38 | 214 | good; arch stays clean |
| `bossEvery 36` + `easy.pillows 2` + `easy.aimRandom 0.7` | 1.30 / 100 / 70 % | 0.48 | 241 | about as good as the final pick |
| `hitZPad 0.25 → 0.18` | 2.26 / 93 / 47 % | 0.59 | **197** (−28 %) | eases **every** difficulty; optional, see below |
| `zones[0].gapK 1.35 → 1.5` | 2.32 / 93 / 44 % | 0.55 | 272 | no real gain |
| `easy.hearts 6` | 2.35 / 99 / 54 % | 0.59 | 274 | hides the problem; ch1 still costs 2.3 hearts |
| `jumpV 6.6` / `g 17` | 2.35 / 94 / 37 % · 2.33 / 94 / 40 % | 0.66 | 272 · 274 | changes the jump feel for little gain; not recommended |

**Optional, for the designer to decide:** `hitZPad 0.25 → 0.18` (0.07 u less forgiveness padding along z on every object). It widens the jump window for logs and pillows (0.30 → 0.33 s for a pillow at 5.5 u/s). It also removes some "I didn't touch it!" pot bumps. However, it cuts the skill-0.5 bot's hits on Normal by about 30 %, so Normal and Hard would get easier too. It is not part of the main proposal.

**Still open for the kid: logs in chapter 2.** 1.4 log hits per chapter, and 30 % of the kids who enter ch2 die there. No Easy-only CONFIG key addresses it: `zones[1]` is shared by all difficulties. If needed, `_pickPattern` could get a small Easy-only rule, as it already has for `log3`/`pots2`. For example, halve the `log1` weight on Easy in zone 1, or skip `shellArc` there for the first 20 % of the chapter. That is a code change for the mechanics engineer, not a CONFIG change.

## 5. Fairness: unavoidable-hit hunt

| set checked | hits | unavoidable |
|---|---|---|
| skill-1 bot, baseline: all its hits in 300 runs (100 seeds × 3 difficulties × 480 s) | 51 | **0** |
| skill-1 bot, proposal-boss40: all its hits in 300 runs | 29 | **0** |
| skill-1 bot, proposal with `bossEvery 36` | 35 | **0** |
| casual adult, Easy / Normal / Hard: every hit in seeds 1–40 (up to 40 per difficulty) | 41 + 41 + 41 | **0** |
| kid, Easy: every hit in seeds 1–12 | 41 | **0** |

**No unfair situations were found.** Pebble is never trapped:

- there is always a free lane;
- pillows never land on a pot stack, or within one jump length of another low thing;
- the oracle always found an escape within 2.5 s.

(One early run of the oracle flagged adult/easy seed 8 at t = 132.85 s. The search window had started 0.05 s before a *different*, earlier hit, at 130.40 s. The oracle now starts after the previous hit, and re-checking that hit shows it is avoidable.)

**The skill-1 bot is not perfect, and the cause is the bot, not the track.** It takes about 0.17 hits per 8 minutes. Of its 51 baseline hits, 40 are **pillows**, 9 **tumbleweeds** and 2 **logs**. Two patterns cover them:

1. **Mid-lane-change into a pillow or tumbleweed** (hero x = ±0.5 or ±0.7 at the hit; 21 hits). The bot starts a switch while a pillow is landing in the target lane, or while a tumbleweed rolls across.
2. **Standing in the lane and mistiming the jump over a resting pillow** (25 hits). The jump reach (`speed·0.28 + 0.6`) is tuned for logs (d 0.18). For a pillow (d 0.30) it is borderline.

Repro seeds (difficulty, seed, t, cause, hero x), all `PO.Bot` skill 1, `bot seed = seed·7 + 1`, dt 1/60:

- `normal 43 t=34.93 pillow x=0.52`
- `normal 53 t=35.05 pillow x=0.52` (both in chapter 1, first visit)
- `hard 91 t=94.42 pillow x=0`
- `hard 68 t=93.37 pillow x=0`
- `easy 61 t=95.90 pillow x=−1`
- `easy 30 t=177.25 tumble x=−0.7`
- `normal 27 t=168.25 tumble x=−0.49`
- `hard 93 t=230.83 tumble x=1`
- `hard 15 t=454.75 log x=−1` (during a visit)

The full list is in `results/baseline.oracle.json`. This matters only for the title demo and these sims. Suggested bot changes (for the mechanics engineer):

- treat a pillow's landing spot as blocked for lane changes from 0.3 s before it lands;
- use `reach = speed·0.28 + 0.6 + (o.d − 0.18)` for jumps.

## 6. Notes for the team

- **Unit tests to update if the proposal is accepted:**
  - `tests/unit/run.js` test *"boss: first visit at ~30 s, every 30 s"* hard-codes 30 / 60 / 90 s. It should use `C.bossEvery`.
  - The Easy aim test expects an aimed share between 0.5 and 0.85. With `aimRandom 0.7` the expected value is 0.53, too close to the 0.5 bound with only 12 seeds. Widen the bounds to about 0.35–0.75, or use more seeds.
- **Docs to update** (by their owners): the `bossEvery 30 s` comment in `world.js`, MECHANICS.md §4 and §5, and the DESIGN.md §5.1 "first visit after 30 s" sentence.
- **Re-running:**
  - `node tests/sim/playtest.js --seeds 100 --maxT 480 --out baseline` (≈ 2.3 min)
  - add `--patch tests/sim/patches/proposal-boss40.json --out proposal-boss40` for the proposal
  - `node tests/sim/oracle.js tests/sim/results/<name>.json` checks the skill-1 hits
  - `node tests/sim/oracle.js --sample kid easy 12 40` checks a model's hits
  - `node tests/sim/report.js baseline proposal-boss40` prints these tables
- **Results files** in `tests/sim/results/`:
  - `baseline.json`, `proposal.json` (`bossEvery 36` variant), `proposal-boss40.json` (final)
  - `*.oracle.json` and `oracle-sample-*.json`
  - `explore-candidates.txt`
