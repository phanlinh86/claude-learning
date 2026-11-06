# Nimbus's Bubble Garden: high-speed playtest

Playtester report, 2026-11-06. Report-only: `game/` was not edited. Every change below was tested in a node vm sandbox by
overriding `NB.World.CONFIG` (plus one small source patch for the portrait fix, applied in the sandbox only).

**Harness** (`tests/sim/`, node, no deps): `lib.js` (sandbox loader, game runner, metrics), `players.js` (player models),
`run.js` (suites `bots | humans | exploits | size`, `--cfg proposal-config.json` for the proposal), `sweep.js`
(`easy | easy2 | normal | normal2 | final`), `patches.json` (source patches used for testing), `proposal-config.json`
(the recommended diff), `results/*.json` (raw numbers). About **16 700 simulated games** (≤10 min each, dt 1/60 s), in
roughly 4 min of CPU. Layouts: **land** = 960×540, **port** = 560×1213 (an iPhone 390×844 portrait screen, scaled).

```
node tests/sim/run.js humans --seeds 40                               # baseline
node tests/sim/run.js humans --seeds 40 --cfg proposal-config.json    # with the proposal
node tests/sim/sweep.js final --seeds 60                              # before/after on 17 players
```

## Player models

| model | how it plays |
|---|---|
| `NB.Bot` 0.3 … 1.0 | the game's own bot (`bot.js`) |
| **kid (4 y)** | decides every 0.8–1.2 s and moves after another 0.4–0.6 s. Aims at the *nearest* bubble where it *was* (no lead), noise N(0, 0.55 u). Drags the finger slowly (3 u/s). Half the time the finger is *on* the bubble, so Nimbus floats 0.7 u above it (the `touchLift`). 15 % of decisions become a 1.5–4 s idle with the finger lifted. Ignores dangling burrs. Notices a falling burr only when it is within 1 u sideways and 1.6 u above, and then only 40 % of the time, pulling away 0.6 s later |
| **casual adult** | reacts in 0.4 s, chases clusters with a 0.4 s lead, noise 0.25 u, fast finger. Notices 85 % of burrs (dangling ones too, 0.6 s before the drop) and steps sideways |
| **keyboard** | arrow keys only (`setMove`, digital axis, 0.15 u dead zone), aims like the casual adult, dodges the burrs it notices with left/right |
| exploits | **puddle camp** (sits on the lawn under the lowest new bubble; with the bot-0.9 dodge, or with no dodge), **bottom sweep** (back and forth along the lawn), **fast circles** (a full-width ellipse at 0.45 Hz, no aiming), **park on puddle 1**, **corner camp**, **stay huge** (bot 0.9 that refuses to pop the gem that would start the shower), **afk** (no input) |

## Key numbers (baseline, the current `world.js`)

### Bots, 30 seeds × 10 min (s/level is p50 at Dawn / Noon / Sunset / Night, loop 0)

| layout · diff | skill | survival p10/p50/p90 s | game over (10 min) | score p50 | s/level | hits/min D/N/S/N | showers/min | escaped |
|---|---|---|---|---|---|---|---|---|
| land easy | 0.3 | 395 / 600 / 600 | 40 % | 19 215 | 70 / 69 / 68 / 68 | 0.84 / 0.95 / 1.00 / 1.34 | 1.49 | 21 % |
| land easy | 0.5 | 600 | 0 % | 24 725 | 60 / 58 / 58 / 58 | 0.20 / 0.38 / 0.47 / 0.40 | 2.04 | 6 % |
| land easy | 0.9 | 600 | 0 % | 27 040 | 57 / 55 / 55 / 53 | 0.06 / 0.01 / 0.03 / 0.07 | 2.29 | 0 % |
| land normal | 0.3 | 64 / 159 / 323 | 100 % (40 % ≤ 2 min) | 3 495 | 80 / 73 / 79 / 75 | 1.20 / 1.38 / 1.25 / 2.87 | 1.18 | 25 % |
| land normal | 0.5 | 492 / 600 / 600 | 20 % | 21 680 | 66 / 65 / 64 / 62 | 0.40 / 0.37 / 0.49 / 0.57 | 1.82 | 11 % |
| land normal | 0.9 | 600 | 0 % | 24 580 | 60 / 59 / 59 / 58 | 0.07 / 0.03 / 0.05 / 0.07 | 2.14 | 2 % |
| land hard | 0.5 | 290 / 566 / 600 | 53 % | 16 520 | 76 / 77 / 77 / 77 | 0.49 / 0.58 / 0.90 / 0.92 | 1.60 | 14 % |
| land hard | 0.9 | 600 | 0 % | 22 230 | 70 / 69 / 68 / 68 | 0.06 / 0.03 / 0.10 / 0.04 | 2.00 | 4 % |
| port easy | 0.3 | 203 / 312 / 572 | 90 % | 10 390 | 61 / 59 / 58 / 58 | 1.19 / 1.11 / 1.98 / 2.23 | 1.63 | 6 % |
| port normal | 0.5 | 600 | 0 % | 24 595 | 61 / 60 / 58 / 58 | 0.06 / 0.09 / 0.03 / 0.15 | 2.03 | 3 % |
| port hard | 0.9 | 600 | 0 % | 23 310 | 69 / 66 / 65 / 64 | 0.02 / 0.03 / 0.02 / 0.03 | 2.07 | 0 % |

Skill 0.7 and 1.0 sit between the rows above (`results/bots-baseline.json`). Time to the first pop is 0.9–2.8 s for every bot.

### Human models, 40 seeds × 10 min

| player · layout · diff | survival p10/p50/p90 | game over 10 min / ≤ 2 min | score p10/p50/p90 | 1st pop | s/level D/N/S/N | hits/min D/N/S/N | showers/min | escaped |
|---|---|---|---|---|---|---|---|---|
| **kid · land · easy** | 422 / 600 / 600 | 20 % / 0 % | 6 743 / 10 880 / 11 952 | 3.4 s | **104 / 111 / 113 / 112** | 0.42 / 0.56 / 0.61 / 0.96 | 0.87 | **50 %** |
| **kid · port · easy** | 209 / 518 / 600 | **70 %** / 0 % | 5 513 / 15 120 / 19 595 | 3.4 s | 78 / 67 / 71 / 70 | **0.91 / 1.16 / 1.30 / 1.34** | 1.17 | 23 % |
| casual · land · easy | 600 | 5 % / 0 % | 26 295 p50 | 1.5 s | 57 / 56 / 55 / 54 | 0.55 / 0.76 / 0.78 / 0.90 | 2.08 | 1 % |
| keyboard · land · easy | 600 | 3 % / 0 % | 23 695 p50 | 1.9 s | 62 / 60 / 60 / 61 | 0.43 / 0.46 / 0.63 / 0.64 | 1.88 | 9 % |
| casual · land · normal | 54 / 356 / 600 | 78 % / **15 %** | 1 163 / 11 990 / 23 576 | 1.5 s | 61 / 59 / 59 / 59 | 1.08 / 1.01 / 0.98 / 1.06 | 1.84 | 3 % |
| keyboard · land · normal | 98 / 366 / 600 | 65 % / 20 % | 10 850 p50 | 1.9 s | 71 / 69 / 68 / 69 | 0.91 / 0.86 / 0.82 / 0.79 | 1.55 | 16 % |
| casual · port · normal | 132 / 292 / 600 | 73 % / 10 % | 9 830 p50 | 1.8 s | 59 / 59 / 58 / 56 | 0.82 / 0.77 / 1.11 / 1.37 | 1.98 | 0 % |
| casual · land · hard | 67 / 243 / 417 | 95 % / 20 % | 6 990 p50 | 1.5 s | 70 / 69 / 69 / 69 | 1.05 / 1.18 / 1.22 / 1.91 | 1.67 | 4 % |
| kid · land · normal | 66 / 150 / 277 | 100 % / 38 % | 1 495 p50 | 3.6 s | 139 / 143 / 164 / – | 1.09 / 1.44 / 1.49 / 3.00 | 0.47 | 59 % |

### Does being big matter? Bumps per *vulnerable* minute by size (land, Easy; share of time in brackets)

| player | size 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| kid | 0.42 (25 %) | 0.72 | 0.69 | 0.75 | 0.81 (15 %) |
| casual adult | 0.20 (21 %) | 0.74 | 1.01 | 1.16 | 1.06 (19 %) |
| bot 0.5 | 0.09 | 0.13 | 0.31 | 0.60 | 0.80 |
| bot 0.9 | 0.00 | 0.00 | 0.00 | 0.06 | 0.17 |

**Yes.** At size 5 the hit rate is 2× (kid) to 9× (bot 0.5) the size-1 rate. The same holds on Normal and Hard (casual adult
0.36 → 1.51 on Normal). The size-1 rate is a little flattered because size 1 includes the 3.5 s level breather and the
post-shower lull. The trade-off is real, and so is the reward (10 × size points per gem). Refusing the shower to stay huge
loses: the "stay huge" bot 0.9 scores **22 300** against 27 040 for plain bot 0.9 on Easy (−18 %), with longer levels. So
staying huge forever is not an exploit.

### Exploits (30 seeds × 10 min; score/min, and the share of hero pops within 0.6 s of a bubble's birth)

| land · easy | game over | score/min | levels/10 min | birth pops | hits/min |
|---|---|---|---|---|---|
| bot 0.7 (reference) | 0 % | 2 662 | 10.0 | 39 % | 0.07–0.17 |
| puddle camp + dodge | 0 % | 2 548 | 9.4 | 66 % | 0.02–0.05 |
| puddle camp, no dodge | 73 % | 2 408 | 6.9 | 66 % | 1.1–1.7 |
| bottom sweep | 90 % | 2 035 | 4.9 | 46 % | 1.2–2.2 |
| fast circles | 0 % | 2 048 | 8.0 | 18 % | 0.23–0.73 |
| park on puddle 1 | 0 % | 645 | 2.8 | 100 % | 0 |
| corner camp | 0 % | 411 | 1.7 | 0 % | 0 |
| stay huge (bot 0.9) | 0 % | 2 240 | 8.4 | 49 % | ≈0.03 |
| afk (no input) | 0 % | 252 | 1.0 | 0 % | 0 |

Portrait Easy: puddle camp 2 708/min (bot 0.7: 2 720), **afk 1 219/min, a level every ≈130 s with zero input**. On Normal,
fast circles (87 % game over within 2 min) and bottom sweep (50 %) die quickly. Puddle camp with a good dodge stays level
with the bot (2 238 vs 2 385/min).

## Findings

### P1: Easy is too slow for the kid in landscape (104–113 s per level, half the bubbles escape)
The kid model needs **111 s p50 / 131 s p90** for the first Dawn level and pops only about half the bubbles. Adults finish the
same level in 57 s, and their time is capped by the spawn rate (48 gems ÷ 0.84 bubbles/s ≈ 57 s). The goal is 45–90 s for both.
Fix: a smaller Easy goal, slower bubbles that stay in reach longer, a more forgiving pop reach, and slightly more bubbles.

### P1: Portrait (iPhone) gets 1.6× the burrs per width. The kid had 70–73 % game over in 10 min and scored below "afk"
`burrEvery` is a time interval, but a portrait field is only 6 u wide, against 9.6 u in landscape. So a burr lands in any given
column 1.6× as often. Good bots dodge thanks to the longer fall (which is why MECHANICS §3 saw *fewer* portrait hits), but
the kid, who does not dodge, takes **1.26 hits/min in portrait against 0.64 in landscape**. In baseline portrait Easy the kid
scored 11 150 p50, *less than a phone lying on the table* (afk 12 225), because the hearts ran out. The fix needs one line of code:
scale the interval by the field width (new CONFIG key `burrRefW`).

### P2: Normal is harsh for a casual adult (13–17 % game over in the first 2 min, 88 % in 10 min, landscape)
The bot at 0.5 hides this (0.33–0.5 hits/min). A distracted adult who misses 15 % of burrs takes ≈1.1 hits/min with 3 hearts.
The bump diagnosis (231 bumps) shows that hits happen 0.6 s into the fall, while she chases bubbles *into* a burr's column.
Burrs are not spawned on top of her (spawn distance is spread uniformly). A longer dangle (`hangTime` 1.35) helped in landscape but was
mixed in portrait. **`normal.burrEvery 1.0 → 1.15`** was the most consistent fix (100 seeds): it brings landscape game over in 10 min from
89 % to 64 % and ≤ 2 min from 17 % to 9 %, with bot 0.9 unchanged. Hard was left as it is: it is meant to be hard (bot 0.9 never dies).

### P3: notes, no change required
- **Puddle camping is viable but not dominant.** With a good dodge it scores 96 % of bot 0.7 and pops 66 % of its gems
  within 0.6 s of birth, partly while the bubble is still in the puddle: Nimbus's lowest point is `groundY − 0.44 u` and her
  reach is about 0.72 u. Without a dodge the lawn is the most dangerous place (73 % game over on Easy), so it is not free. Even
  bot 0.7 makes 39 % of its pops near birth, so good play gathers in the bottom third. An optional cosmetic fix
  (`patches.json → floorGap`, `maxY = groundY − 0.45 u`) cut camper birth pops from 66 % to 51–58 % (landscape) and from 91 % to 70 % (portrait) without changing scores. It needs a code
  change and is not in the diff.
- **Easy forgives mindless play**: fast circles never die on Easy landscape (77 % of the top score), and afk is never hit
  on Easy (`burrClear` 1.3 u means burrs never spawn over a still Nimbus). This is right for 3–6-year-olds and is not an exploit.
  On Normal both die fast.
- **Level time barely depends on skill** (bot 0.5 → 1.0: 60 → 57 s on Easy) because the spawn rate sets the pace. Skill
  shows up in score and survival, as MECHANICS says. Later zones are harder only through burrs and wind, not through pace (≈ equal s/level).
- **Showers**: about 2.0–2.3 per minute for adults and bots (≈2.4 per level with goal 48, ≈2 with 40), 0.9–1.2 per minute for the kid. They come
  often enough to stay a reward and are never rare. **Escapes**: 0–3 % for adults (touch), 8–16 % for keyboard in landscape,
  22–51 % for the kid. They cost nothing, so the only harm is pace (P1).
- **Time to first pop** is 0.9–3.6 s for everyone. No NaN or out-of-box positions appeared in any of the 16 700 games.

## Recommended CONFIG diff (`game/js/world.js`)

```diff
-    goal: { easy: 48, normal: 48, hard: 52 },
+    goal: { easy: 40, normal: 48, hard: 52 },
 ...
-      easy:   { hearts: 5, rise: 0.75, spawn: 1.05, burrEvery: 1.5,  hangTime: 1.6,  burrR: 0.85, popK: 1.25 },
-      normal: { hearts: 3, rise: 1.0,  spawn: 1.0,  burrEvery: 1.0,  hangTime: 1.1,  burrR: 1.0,  popK: 1.0 },
+      easy:   { hearts: 5, rise: 0.6,  spawn: 1.1,  burrEvery: 1.8,  hangTime: 1.6,  burrR: 0.75, popK: 1.45 },
+      normal: { hearts: 3, rise: 1.0,  spawn: 1.0,  burrEvery: 1.15, hangTime: 1.1,  burrR: 1.0,  popK: 1.0 },
 ...
     burrBreather: 3.5,      // s      no burr during the first 3.5 s of a level
+    burrRefW: 9.6,          // unit   burr interval is for a field this wide; narrower (portrait) fields get proportionally fewer burrs
 ...
-  World.prototype.burrInterval = function () { return this.Z.burrEvery * this.D.burrEvery / this._burrK; };
+  World.prototype.burrInterval = function () { return this.Z.burrEvery * this.D.burrEvery / this._burrK * M.max(1, CONFIG.burrRefW / (this.layout.width / this.layout.unit)); };
```

In short: `goal.easy 48 → 40`, `difficulty.easy.rise 0.75 → 0.6`, `difficulty.easy.spawn 1.05 → 1.1`,
`difficulty.easy.burrEvery 1.5 → 1.8`, `difficulty.easy.burrR 0.85 → 0.75`, `difficulty.easy.popK 1.25 → 1.45`,
`difficulty.normal.burrEvery 1.0 → 1.15`, plus the new `burrRefW: 9.6` (landscape is unaffected, because its width is always ≥ 9.6 u).
`easy.burrR` gave the smallest gain of the set (sweep E against D) and can be skipped. At 0.18 u the hit radius sits just inside the solid body
(0.19 u), which is generous for small children. After applying the diff, update the zone comments in CONFIG and the tables in MECHANICS
§1 and §3 (Easy Dawn: 0.51 u/s, 0.88 bubbles/s, a burr every 10.8 s in landscape and 17 s in portrait).

## Before / after (60 seeds × 10 min, `node tests/sim/sweep.js final`)

| player | 1st level s p50 (p90) | s/level D/N/S/N | escaped | hits/min | game over ≤ 2 min | game over 10 min | score p50 |
|---|---|---|---|---|---|---|---|
| **kid · easy · land** before | 111 (131) | 111/109/116/119 | 51 % | 0.64 | 0 % | 25 % | 10 660 |
| **kid · easy · land** after | **79 (90)** | 77/77/80/81 | 43 % | 0.57 | 0 % | **3 %** | 14 865 |
| **kid · easy · port** before | 76 (84) | 75/70/73/74 | 22 % | 1.26 | 3 % | 73 % | 11 150 |
| **kid · easy · port** after | **55 (61)** | 55/54/53/53 | 14 % | **0.59** | 0 % | **0 %** | 25 270 |
| kid · easy · land, first 120 s only, before | 107 (117), 16/60 not done | – | 45 % | 0.53 | 0 % | – | 1 885 |
| kid · easy · land, first 120 s only, after | 79 (90), all done | – | 36 % | 0.46 | 0 % | – | 2 245 |
| casual · easy · land before → after | 58 (60) → **46 (48)** | 60/59/56/55 → 48/47/45/45 | 1 → 0 % | 0.65 → 0.60 | 0 → 0 % | 2 → 0 % | 26 425 → 31 490 |
| bot 0.9 · easy · land before → after | 57 (60) → 46 (47) | 60/58/55/55 → 48/47/45/45 | 0 → 0 % | 0.04 → 0.03 | 0 % | 0 % | 27 105 → 32 090 |
| bot 0.3 · easy · land before → after | 70 (79) → 53 (60) | → 56/53/53/52 | 20 → 15 % | 1.12 → 0.79 | 2 → 0 % | 57 → 3 % | 16 825 → 24 310 |
| casual · normal · land before → after | 61 (63) → 61 (64) | ≈ same | 3 % | 1.07 → 0.91 | 13 → 7 % | 88 → 68 % | 10 195 → 11 960 |
| casual · normal · port before → after | 60 (62) → 60 (63) | ≈ same | 0 % | 0.95 → 0.58 | 3 → 5 % | 72 → 23 % | 13 810 → 24 855 |
| keyboard · normal · land before → after | 69 (74) → 69 (73) | ≈ same | 16 % | 0.87 → 0.75 | 5 → 5 % | 77 → 60 % | 11 775 → 16 815 |
| bot 0.5 · normal · land before → after | 66 (70) → 65 (72) | ≈ same | 11 % | 0.52 → 0.38 | 5 → 0 % | 33 → 13 % | 21 400 → 21 740 |
| bot 0.9 · normal · land before → after | 60 (62) → 60 (62) | ≈ same | 2 % | 0.04 → 0.04 | 0 % | 0 % | 24 725 → 24 885 |
| puddle camp · normal · land | 63 → 63 | ≈ same | 10 → 9 % | 0.05 → 0.06 | 0 % | 0 → 2 % | 22 700 → 22 905 |
| afk · easy · port before → after | 129 → 100 | – | 46 → 41 % | 0 | 0 % | 0 % | 12 225 → 13 650 (kid now scores 1.9× afk, before 0.9×) |
| Hard (casual, bot 0.5, bot 0.9, landscape) | unchanged (no Hard key touched; the portrait fix only affects portrait) | | | | | | |

Every level now falls in the 45–90 s band for every model on Easy: adults 45–48 s, kid 53–81 s, with a p90 of 90 s for the kid's first landscape level.
Normal for adults stays at 57–72 s. The kid's game-over rate in the first 2 minutes stays at 0 %, and over 10 minutes it drops from 25 % / 73 % to
3 % / 0 % (landscape / portrait). Proposal-level suites: `results/humans-proposal.json`, `exploits-proposal.json`, `size-proposal.json`
(the size/risk gradient survives: casual Easy 0.27 at size 1 → 0.72–1.01 at sizes 4–5).

## Caveats
- The human models are hand-built approximations. The kid's 40 % burr-notice rate and 15 % idle chance drive most of its numbers.
  The *relative* before/after gains held across all sweep variants and seeds, but the absolute values for a real child will differ.
- Sweeps use 40–100 seeds. Differences under ≈5 percentage points in game-over rates are within noise (for example, casual normal port ≤ 2 min, 3 → 5 %).
