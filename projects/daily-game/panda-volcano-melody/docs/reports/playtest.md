# Tofu's Volcano Melody — high-speed playtest report (2026-11-14)

Playtester: headless simulation. `game/` was not changed. Every number below comes from the real
`game/js/{rng,world,bot}.js`, loaded in a Node `vm` with a fake `window` and driven only through
`setTarget` / `clearTarget`, which is how a finger drives the game.

- Runner: `tests/sim/run.js` (`node tests/sim/run.js --tuning all --n 100 --nx 30`). It runs in parallel on worker threads.
- Player models: `tests/sim/players.js`.
- Quick A/B sweeps: `tests/sim/sweep.js` (log in `tests/sim/results/sweep.txt`).
- Raw results: `tests/sim/results/{before,after,afterProto}.json` (every round and every season) and the matching `.md` tables.
  - `after-v1-combo3.2.*` is the intermediate run before the Easy combo-window change.
  - `hard-goal-fix/` is the Hard re-run after the final goal edit.
- Volume: about 18,000 rounds, about 500 simulated hours (plus the sweeps). One round is one year (4 seasons) or play until game over.
  Exploit rounds are capped at 300 s.

## 1. Player models

| model | what it does |
|---|---|
| `bot0`, `bot0.4`, `bot0.8`, `bot1` | the shipped `PVM.Bot` at that skill level |
| `kid4` (a 4-year-old) | Looks at the screen every 0.8 s (±30 %) and aims with ±40 px error. Ignores crabs on 50 % of looks. Taps the note *sprite* rather than its shadow 70 % of the time. Goes for a random note 30 % of the time. Holds the screen for 3–8 s, then lets go for 1–4 s. On 12 % of looks it walks off to a random spot for 2–5 s. Waits 1.5 s after "go" before starting. Mildly attracted to the mango. When no note is on the field it stands still. |
| `adult` (casual adult) | Looks every 0.3 s, ±12 px aim. Reads the shadow 90 % of the time. Avoids crabs (105 px, weight 1.5) on 90 % of looks. Brief lapses (lets go for 0.3–1 s every 10–25 s). Goes for the mango. Moves to the open spot farthest from the crabs when no note is on the field. |
| `idle` | never touches the screen |
| `corner` | finger held in the bottom-left corner |
| `crater` | finger held on the crater mouth (480,196): Tofu parks behind the volcano |
| `hugRock` | stands tight behind the first prop |
| `circleTight` / `circleWide` | circles the volcano forever, 112 px or 190 px around it |
| `spam` | taps a random spot 3 times per second |
| `zigzag` | sweeps the meadow row by row without ever looking at notes or crabs |

## 2. Findings on the shipped tuning ("before")

1. **Seasons are far too short.** For every competent player, a season lasts 11–20 s. The adult on Normal takes 16 / 16 / 19 / 20 s and finishes a whole year in about 75 s of play. The 4-year-old on Easy spring takes 39 s (p10–p90: 25–55 s). That is a little slower than the mechanics engineer's 28 s, because my kid lets go of the screen and wanders more. It is still below the 45–90 s target, and only the kid comes close.
2. **The 4-year-old loses on Easy.** Spring clears 90 % of the time, which only just meets the bar. After that she clears summer 54 %, autumn 31 % and winter 13 %, and only **2 % clear the year**. She is pinched **3.7 times a minute**. The cause is not the crab chasing her. In the pinch breakdown, **more than half of the pinches happen while Tofu is walking into a crab that is only *wandering***. A crab-blind child walking at 230 px/s simply sweeps into it. That rate depends on Tofu's speed, the size of the hitbox and the number of crabs. Crab speed has little effect on it.
3. **Coco plays the game.** For competent players she comes once per season and collects **40–53 % of all notes**. For the kid she almost never comes: 0.2 times per season, 10 % share. A 3.2 s combo window is too short for a 4-year-old to chain 5 notes.
4. **The mango is almost useless.** Competent players eat 0–0.1 mangoes per run. The kid sees 2.4 mangoes per run but eats only 19 % of them, because the 9 s life is too short for her. Turning mangoes off changes the adult's Normal year clear rate only from 85 % to 82 %.
5. **Normal and Hard are close to a sprint test.** The adult clears the Normal year 85 % of the time and the Hard year 43 %. Both bot0.8 and bot1 clear Hard about 100 % of the time. Hard is not hard for a skilled player, because a season is over before the crabs matter.
6. **Exploits:** no safe exploit exists. Every non-playing strategy ends in game over on every difficulty. The best is `zigzag` on Easy: it clears spring 77 % of the time, then naps. `circleWide` on Easy clears spring 37 %. Scores are tiny, at most 258 points per minute against about 1,500 for a real Easy year. The crater spot and the tight circle are actively bad, at 7–13 pinches per minute.
7. **Time to the first note** is fine: about 2 s for adults and bots, 4.4 s for the kid (who starts late).

## 3. Before → after (recommended config-only tuning)

### Headline numbers

| metric | target | before | **after** | after + Easy prototype¹ |
|---|---|---|---|---|
| kid4 · Easy · spring clear | ≥ 90 % | 90 % | **98 %** | 100 % |
| kid4 · Easy · summer / autumn / winter clear (of those reaching it) | "winnable" | 54 / 31 / 13 % | **90 / 83 / 48 %** | 100 / 95 / 85 % |
| kid4 · Easy · year cleared | — | 2 % | **35 %** | 81 % |
| kid4 · Easy · season length median (sp/su/au/wi) | 45–90 s | 39 / 39 / 34 / 49 | **46 / 54 / 58 / 59** | 48 / 51 / 54 / 63 |
| kid4 · Easy · pinches per min | — | 3.71 | **2.02** | 1.27 |
| kid4 · Easy · Coco per season / share | — | 0.20 / 10 % | **0.63 / 19 %** | 0.76 / 21 % |
| adult · Normal · season length median | 45–90 s | 16 / 16 / 19 / 20 | **45 / 46 / 50 / 51** | = |
| adult · Normal · spring / year cleared | fair | 100 / 85 % | **100 / 88 %** | = |
| bot0.4 · Normal · year cleared | — | 74 % | **57 %** | = |
| adult · Hard · spring / year cleared | hard | 100 / 43 % | **87 / 13 %** | = |
| bot0.8 / bot1 · Hard · year cleared | not unfair | 98 / 100 % | **81 / 96 %** | = |
| Coco share of notes (adult Normal) | helper, not player | 48 % | **25 %** | = |
| mangoes eaten per run (adult Normal) | useful | 0.12 | **2.54** | = |
| adult Normal year clear with mangoes switched off | — | 82 % | 44 % (mangoes now matter) | = |
| best exploit on Normal/Hard | none | none (all lose) | **none (all lose)** | = |

¹ The prototype is a small world.js change, so it is not config-only. On Easy only, a *wandering* crab bumps Tofu and does not pinch. Only a chasing crab can pinch. See §5.

### Players × difficulty — before
| player | diff | spring | summer | autumn | winter | year | s/season med | pinch/min | Coco/season | Coco share | score p10/med/p90 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bot0 | easy | 100 % | 100 % | 100 % | 95 % | 95 % | 12/13/15/16 | 1.93 | 0.97 | 40 % | 1316/1482/1600 |
| bot0 | normal | 99 % | 91 % | 68 % | 48 % | 29 % | 16/17/20/20 | 2.82 | 0.80 | 44 % | 694/1376/1898 |
| bot0 | hard | 86 % | 47 % | 35 % | 50 % | 7 % | 18/19/20/22 | 4.85 | 0.63 | 39 % | 120/524/1406 |
| bot0.4 | normal | 100 % | 98 % | 87 % | 87 % | 74 % | 16/16/18/19 | 1.32 | 0.94 | 48 % | 794/1908/2046 |
| bot0.4 | hard | 97 % | 79 % | 68 % | 67 % | 35 % | 16/18/20/19 | 2.75 | 0.81 | 44 % | 402/1356/2078 |
| bot0.8 | hard | 100 % | 100 % | 99 % | 99 % | 98 % | 16/17/20/19 | 0.69 | 1.00 | 48 % | 1904/2090/2218 |
| bot1 | hard | 100 % | 100 % | 100 % | 100 % | 100 % | 16/17/19/19 | 0.31 | 0.99 | 47 % | 1924/2096/2208 |
| kid4 | easy | 90 % | 54 % | 31 % | 13 % | 2 % | 39/39/34/49 | 3.71 | 0.20 | 10 % | 186/396/772 |
| kid4 | normal | 21 % | 5 % | 0 % | – | 0 % | 32/23/–/– | 5.49 | 0.11 | 9 % | 38/90/318 |
| adult | easy | 100 % | 100 % | 100 % | 100 % | 100 % | 11/13/15/16 | 0.59 | 1.00 | 44 % | 1458/1600/1600 |
| adult | normal | 100 % | 99 % | 94 % | 91 % | 85 % | 16/16/19/20 | 0.98 | 0.96 | 48 % | 1296/1898/2026 |
| adult | hard | 100 % | 81 % | 62 % | 86 % | 43 % | 17/19/20/20 | 2.36 | 0.84 | 45 % | 446/1266/2124 |

### Players × difficulty — after (config-only)
| player | diff | spring | summer | autumn | winter | year | s/season med | pinch/min | Coco/season | Coco share | score p10/med/p90 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bot0 | easy | 100 % | 100 % | 100 % | 100 % | 100 % | 23/27/30/32 | 1.08 | 1.03 | 23 % | 1538/1678/1762 |
| bot0 | normal | 91 % | 71 % | 54 % | 43 % | 15 % | 45/47/51/52 | 2.45 | 1.36 | 23 % | 434/1054/1956 |
| bot0 | hard | 42 % | 24 % | 0 % | – | 0 % | 45/45/–/– | 4.72 | 0.74 | 16 % | 104/318/824 |
| bot0.4 | normal | 100 % | 98 % | 77 % | 76 % | 57 % | 44/46/50/50 | 1.50 | 1.80 | 24 % | 1126/1924/2110 |
| bot0.4 | hard | 73 % | 55 % | 23 % | 44 % | 4 % | 44/45/48/46 | 3.12 | 1.10 | 20 % | 148/676/1274 |
| bot0.8 | hard | 99 % | 100 % | 91 % | 90 % | 81 % | 45/45/51/47 | 0.97 | 1.53 | 21 % | 1542/1982/2094 |
| bot1 | hard | 100 % | 100 % | 100 % | 96 % | 96 % | 46/45/50/48 | 0.63 | 1.45 | 20 % | 1920/2028/2138 |
| kid4 | easy | 98 % | 90 % | 83 % | 48 % | 35 % | 46/54/58/59 | 2.02 | 0.63 | 19 % | 492/1042/1424 |
| kid4 | normal | 9 % | 0 % | – | – | 0 % | 79/–/–/– | 3.76 | 0.13 | 4 % | 50/116/296 |
| adult | easy | 100 % | 100 % | 100 % | 100 % | 100 % | 23/25/29/32 | 0.29 | 1.01 | 23 % | 1712/1840/1840 |
| adult | normal | 100 % | 99 % | 94 % | 95 % | 88 % | 45/46/50/51 | 1.00 | 1.90 | 25 % | 1690/2022/2160 |
| adult | hard | 87 % | 67 % | 40 % | 57 % | 13 % | 45/46/51/47 | 2.48 | 1.06 | 18 % | 310/994/1904 |

Season-clear percentages are of the rounds that reached that season. The full tables, including Easy and Normal for
every bot, are in `tests/sim/results/*.md`.

### Season length spread (cleared seasons, p10–median–p90 seconds of play)
| player | diff | before spring | before winter | after spring | after summer | after autumn | after winter |
|---|---|---|---|---|---|---|---|
| kid4 | easy | 25–39–55 | 32–49–49 | **28–46–69** | 37–54–73 | 41–58–84 | 43–59–74 |
| adult | normal | 14–16–17 | 18–20–22 | **41–45–50** | 42–46–52 | 46–50–54 | 45–51–55 |
| adult | hard | 15–17–19 | 18–20–22 | **41–45–50** | 43–46–49 | 44–51–56 | 44–47–54 |
| adult | easy | 10–11–12 | 14–16–17 | 19–23–26 | 22–25–29 | 27–29–34 | 28–32–35 |

Easy stays shorter for adults (23–32 s) on purpose. On Easy the child sets the pace, and an adult on Easy is
not the audience. The 20-note songs in `audio.js` loop, so a 24–30-note Normal season plays the melody about 1.3–1.5 times.
Every goal stays ≤ 30, so the song meter still draws its tick marks (`render.js` draws them only for goal ≤ 30).

### Mango usefulness (same seeds, mangoes off)
| player | diff | before: eaten/run · year with→without | after: eaten/run · year with→without | after: game over with→without |
|---|---|---|---|---|
| kid4 | easy | 0.46 · 2 → 0 % | **2.34 · 35 → 9 %** | 65 → 91 % |
| adult | normal | 0.12 · 85 → 82 % | **2.54 · 88 → 44 %** | 12 → 56 % |
| adult | hard | 0.00 · 43 → 43 % | **1.65 · 13 → 0 %** | 87 → 100 % |
| bot0.4 | normal | 0.05 · 74 → 71 % | **2.55 · 57 → 10 %** | 43 → 90 % |

The mango is now a real comeback mechanic rather than a decoration. On Normal it is the difference between a fair
game and a punishing one. A side effect: perfect-season bonuses are rarer, because a mango refills a heart but does not undo `_lostHeart`.

### Exploits after the change (300 s cap, n = 30 each)
| strategy | easy: spring clear · survival med · score/min | normal | hard |
|---|---|---|---|
| idle | 0 % · 149 s · 3 | 0 % · 33 s · 3 | 0 % · 19 s · 1 |
| corner | 0 % · 299 s (17 % game over) · 0 | 0 % · 60 s · 0 | 0 % · 31 s · 0 |
| crater spot | 0 % · 78 s · 7 | 0 % · 24 s · 3 | 0 % · 16 s · 2 |
| hugRock | 0 % · 234 s · 0 | 0 % · 59 s · 0 | 0 % · 29 s · 0 |
| circleTight | 0 % · 43 s · 6 | 0 % · 21 s · 2 | 0 % · 16 s · 0 |
| circleWide | 50 % · 89 s · 124 | 0 % · 49 s · 76 | 0 % · 26 s · 52 |
| spam | 20 % · 79 s · 96 | 0 % · 31 s · 27 | 0 % · 18 s · 17 |
| zigzag | 83 % · 119 s · 268 | 0 % · 41 s · 88 | 0 % · 26 s · 40 |

No strategy is both safe and high-scoring. On Normal and Hard every non-playing strategy loses quickly, and none
clears a season. On Easy, camping in a corner or behind a rock is now *survivable*, because the crab is slow and
rarely chases, but it scores 0. That is the right outcome for a toddler who puts the iPad down. A mindless zigzag
sweep clears Easy spring, which is fine for ages 3–5: running around the meadow is how they play.
With the §5 prototype, the Easy-only "toddler wins by running around" effect grows: `zigzag` clears all 4 Easy seasons in most runs
(median 4 seasons, 17 % game over) and `circleWide` survives 73 % of the time. That is acceptable for the 3–5 audience, but it is a deliberate choice, so it is flagged here.

## 4. Recommended changes (config only, copy-paste)

File: `game/js/world.js`

```
// CONFIG
popDelay: 3.6,            // was 1.3   (the meadow refills slowly: a season lasts a song, not a sprint)
eruptCount: [2, 4],       // was [3, 5]
helperTime: 7,            // was 10    (Coco helps; she no longer collects half the notes)
cocoSeekR: 200,           // was 260
invulnTime: 2.5,          // was 2.0
hitForgive: 10,           // was 4     (a pinch needs centres < 24 px instead of < 30 px: kinder hitbox)
mangoLife: 14,            // was 9     (a slow child can actually reach the mango)

// DIFFICULTY.easy
goal: [12, 14, 16, 18],          // was [10, 12, 14, 16]
crabSpeed: [36, 40, 44, 48],     // was [45, 52, 58, 64]
crabs: [1, 1, 1, 2],             // was [1, 1, 2, 2]
erupt: [10, 9, 9, 8],            // was [9, 8, 8, 7]
chaseFrac: 0.2,                  // was 0.4
comboWindow: 6,                  // was 3.2   (a 4-year-old can chain 5 notes, so she gets to meet Coco)
mangoEvery: [8, 12],             // was [14, 22]
// unchanged: hearts 5, speed 230, notesOnField 3, noteLife 14

// DIFFICULTY.normal
goal: [24, 26, 28, 30],          // was [14, 16, 18, 20]
crabSpeed: [50, 56, 62, 68],     // was [60, 68, 76, 84]
crabs: [1, 1, 2, 2],             // was [1, 2, 2, 3]
erupt: [10, 9, 9, 8],            // was [8, 7, 7, 6]
chaseFrac: 0.45,                 // was 0.6
mangoEvery: [16, 24],            // was [18, 28]
// unchanged: hearts 3, speed 230, notesOnField 2, noteLife 12, comboWindow 2.4

// DIFFICULTY.hard
goal: [25, 27, 29, 30],          // was [16, 18, 20, 22]
crabSpeed: [66, 74, 82, 90],     // was [78, 88, 96, 104]
crabs: [2, 2, 3, 3],             // was [2, 3, 3, 4]
erupt: [9, 8, 8, 7],             // was [7, 6, 6, 5]
chaseFrac: 0.6,                  // was 0.75
mangoEvery: [20, 30],            // was [24, 36]
// unchanged: hearts 3, speed 235, notesOnField 2, noteLife 10, comboWindow 2.0
```

Unit tests affected (`tests/unit/run.js`):
- Line 414 hard-codes `e.crabSpeed === 45` and `e.goal === 10`. These become 36 and 12.
- I checked the other invariants against the new values:
  - "goal / crabSpeed grow and crabs don't shrink each season" still holds. That is why Hard uses 25/27/29/30 and not 26/28/30/30.
  - The pacing test still passes: 0 of 8 kids lost Easy spring, kid median 33 s, perfect bot 23 s.
  - The Hard mood-mix test still passes (chase 2751 > wander 1180 × 0.8).
- The `MECHANICS.md` tuning table and its "Measured" paragraph should be updated with the numbers above.

## 5. Optional code change (prototyped in the sim, not config)

**On Easy, only a *chasing* crab can pinch.** A wandering crab that Tofu bumps into is nudged aside, as the
shipped code already does for dizzy or scared crabs. Suggested shape:
- add `DIFFICULTY.<d>.wanderPinch` (easy `false`, normal and hard `true`);
- in `World._pinches`, use `var harmful = k.state === 'chase' || (k.state === 'wander' && this.diff.wanderPinch);`.

The sim prototype (`protoPinches` in `tests/sim/run.js`, tuning `afterProto`) raises the 4-year-old's Easy year
clear rate from 35 % to 81 %. Winter goes from 48 % to 85 %, and pinches per minute drop from 2.02 to 1.27. Spring stays
at 98–100 % and nothing else changes. The cost: mindless sweeping survives Easy (see the exploit note above).
The renderer may want to give the bump a small "boop" or puff, so a child sees that walking into a calm crab is harmless.

## 6. Smaller notes for the team
- Kid first note is at 3.3 s (adult 1.9 s). This is fine, but the 1.5 s banner wait is part of it.
- On Easy, adults now finish a year in about 2 min. That is fine for the kid mode, and Normal is the default for grown-ups.
- Season-clear perfect bonuses become rarer on Normal and Hard because seasons are longer. Score medians still go up,
  for example adult Normal from 1,898 to 2,022, because the songs have more notes.
