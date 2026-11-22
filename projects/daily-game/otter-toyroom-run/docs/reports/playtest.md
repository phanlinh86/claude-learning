# Otto's Playroom Dash — high-speed playtest (2026-11-22)

Report-only pass: nothing in `game/js` was changed. Every number below comes from the headless sim (`tests/sim/`, node + vm with a fake
`window`, the real `world.js` / `bot.js`). Config changes were tested on a **patched copy** of `OD.World.CONFIG`
(`tests/sim/patches/playtest-2026-11-22.json`, deep-merged per vm).

About **18 000 headless rounds** in total: 2 × 2 700 full playtests (60 seeds × 3 difficulties × 15 player groups, up to 480 s each),
about 11 500 A/B rounds over 22 candidate patches (`explore.js`), about 1 000 forensic rounds (`kidprobe.js`), about 2 000 gravity-probe rounds
(`gravity.js`), 3 700 isolated jump-timing trials (`windows.js`), and about 90 oracle searches (the oracle runs a beam search over every input
sequence to check whether a hit could have been avoided).

## TL;DR
- **The kid's tower hits in biome 1 come from `tower2` (two-tower rows).** On Easy, `tower2` is only 1 in 6 tower rows (its weight is
  halved), but it causes 59 % of the kid's biome-1 hits. The kid model usually sees it late (57 % of all biome-1 hits are
  lapses, where the obstacle is noticed less than 0.45 s ahead and a 0.6–0.9 s reaction cannot beat that), or needs two swipes (25 %, the free lane is 2 lanes away), or swipes
  the wrong way (13 %). A 4-seed run gave the reported 1.25 hits. At 60 seeds the baseline is 1.07 (kid) and 1.60 (kid5).
  **Fix: `zones[0].patterns.tower2: 2 → 0`.** Kid Easy biome-1 hits **1.07 → 0.37**, kid5 **1.60 → 0.80**, kid Normal **1.63 → 0.55**.
- **Moon balls could not be passed in your own lane in 7 of 13 bounce phases** (Easy/Normal). The first moon hop (1.56 u) is too low to run
  under (Otto is 0.7 u tall) and too high to jump over (the jump apex is 1.25 u). The hint says "Moon jumps! Float over everything!" but in
  those phases a jump hits the ball in mid-air. **Fix: `ballV 3.4 → 2.8, ballKick 1.6 → 1.2, ballRest 0.78 → 0.6`.** Every moon phase is then
  jumpable with a window of 375 ms or more. The Crayon ball window also gets wider (Easy minimum 50 → 130 ms). Adult moon-ball hits drop from 32 to 3 over 40 seeds × 2 groups.
- **The Crayon Jungle (gk 1.25) is the hardest biome.** It now has **`zones[2].gapK 1.08 → 1.2`**. Adults reach biome 5 more often
  (Normal 77 → 95 %, Hard 70 → 90 %). The kid models still take about 3.3 hits in Crayon. That comes from the models themselves (no ball prediction,
  late jumps against a 310 ms block window), and a config value cannot fix it. See the open issues.
- **No unavoidable hits.** The oracle cleared every checked hit (61 kid, 3 skill-1 bot, 10 easing-window, 10 long-landing, 13 moon-ball and 20 crayon-ball
  hits, before and after the patch). A perfect bot (skill 1) takes 0–0.02 hits per biome.
- **No exploit.** Jumping all the time (bot lanes plus a jump every frame) takes **1.5–2.4 hits/min on the moon**, while the normal bot takes 0. Pure
  jump spam, zig-zag and idle players lose every heart in biome 1–2.
- **Pacing is on target.** Biomes last 72 / 68 / 64 / 61 s (Easy) up to 74 / 69 / 66 / 62 s (Hard), loop 2 about 72 s, inside the 45–90 s aim. The first acorn
  comes after 2.1–4.0 s (p50).

## The CONFIG diff (proposed for `game/js/world.js`)

```
zones[0].patterns.tower2 : 2    → 0      // biome 1 = single towers only; tower2 starts in biome 2 (weight 2 there, unchanged)
ballV                    : 3.4  → 2.8    // steady hop 0.30→0.21 u (gk 1), 0.61→0.41 u (moon), 0.24→0.17 u (crayon)
ballKick                 : 1.6  → 1.2    // first hop after waking: moon 1.56→0.59 u, crayon 0.62→0.24 u
ballRest                 : 0.78 → 0.6    // settles to the steady hop after one bounce
zones[2].gapK            : 1.08 → 1.2    // Crayon Jungle: about 10 % more room between obstacle rows
```
Still true with this patch: hop height ∝ 1/gk, so the moon ball still hops 2.5× higher than the crayon ball and the twist stays readable. The tallest ball top is
0.41 + 0.62 = 1.03 u, below the moon jump apex of 1.25 u. Biome durations do not change, because the goal is a distance.
**Unit tests on the patched copy** (`node tests/sim/unit-patched.js tests/sim/patches/playtest-2026-11-22.json`): 25/26 pass. The one failure is
by design: `ball: a hit needs real vertical overlap…` asserts that "on the moon some bounce phases let Otto run under" (0/24 with the
patch). That run-under phase is the trap found above. Replace the assertion with "every moon phase is passable in-lane by a jump", as
`windows.js` measures. The vertical-overlap rule itself stays (the first half of that test still passes).

## Before / after (60 seeds per row, maxT 480 s; baseline → **patched**)

| group | survival p50 | reach biome 3 | reach biome 5 | biome 1 hits | biome 2 hits | biome 3 hits | biome 4 hits |
|---|---|---|---|---|---|---|---|
| easy · kid | 207 s → **227 s** | 97 % → **100 %** | 27 % → **37 %** | 1.07 → **0.37** | 1.32 → **1.30** | 3.26 → **3.27** | 1.83 → **1.73** |
| easy · kid5 | 172 s → **183 s** | 83 % → **90 %** | 10 % → **7 %** | 1.60 → **0.80** | 1.95 → **2.29** ¹ | 3.26 → **3.28** | 2.08 → **2.07** |
| normal · kid | 128 s → **160 s** | 38 % → **55 %** | 2 % → **0 %** | 1.63 → **0.55** | 1.84 → **2.03** ¹ | 2.35 → **2.39** | 2.00 → **2.50** |
| easy · adult | 480 s → **480 s** | 100 % → **100 %** | 98 % → **100 %** | 0.18 → **0.15** | 0.23 → **0.20** | 1.22 → **0.75** | 0.77 → **0.32** |
| normal · adult | 480 s → **480 s** | 98 % → **98 %** | 77 % → **95 %** | 0.37 → **0.30** | 0.39 → **0.42** | 1.25 → **0.64** | 0.91 → **0.49** |
| hard · adult | 471 s → **480 s** | 100 % → **100 %** | 70 % → **90 %** | 0.40 → **0.35** | 0.48 → **0.42** | 1.22 → **0.92** | 0.94 → **0.60** |
| easy · bot0.3 | 480 s → **480 s** | 100 % → **100 %** | 82 % → **93 %** | 0.47 → **0.37** | 0.67 → **0.92** | 1.53 → **1.35** | 1.67 → **1.61** |
| normal · bot0.5 | 480 s → **480 s** | 100 % → **98 %** | 97 % → **97 %** | 0.08 → **0.00** | 0.20 → **0.20** | 0.53 → **0.56** | 0.21 → **0.19** |
| hard · bot0.5 | 480 s → **480 s** | 100 % → **100 %** | 95 % → **97 %** | 0.12 → **0.03** | 0.33 → **0.28** | 0.67 → **0.60** | 0.41 → **0.36** |
| normal · bot1 / hard · bot1 | 480 s | 100 % | 100 % | 0 → 0 | 0 → 0 | 0.02 → 0.02 / 0 → 0 | 0 → 0 |
| easy · idleMid | 47 s → **59 s** | 0 % → 0 % | 0 % | 4.75 → 4.37 | 2.88 → 2.65 | – | – |

¹ Survivorship and a first meeting: with fewer biome-1 hits, more kids live longer in biome 2 (kid5 deaths in biome 2: 14 % → 9 %), and
biome 2 is now where they meet `tower2` for the first time. A 100-seed A/B gave the same direction (+0.28). Watch it. A gentler option is
`zones[1].patterns.tower2: 2 → 1`, which was not needed for the targets here.

Hits per biome are counted per player who entered the biome (a partial biome counts as well). Seed-to-seed noise on these means is about ±0.15.

## Player models
`tests/sim/players.js`. A model drives the game only through `world.move` / `world.jump`. It may read the world state, but it only uses what it
can perceive.
| model | what it is |
|---|---|
| `bot0.3…bot1` | `OD.Bot` (DESIGN §5.3) at skill 0.3 / 0.5 / 0.7 / 0.9 / 1 |
| `kid` | 5–6-year-old: reaction 0.6–0.9 s, sees only the nearest row (2.2 s ahead), 8 % lapses, 12 % wrong-way swipes, jumps 80 ms late on average (σ 140 ms), random jumps, drifts to the middle, chases acorns |
| **`kid5`** (new) | harsher 5-year-old: reaction 0.65–0.95 s, look 2.0 s, **10 % of swipes not recognised**, 10 % wrong way, jumps 120 ms late on average (σ 160 ms), **in floaty / moon gravity 30 % of jumps go 0.25–0.55 s too early** |
| `adult` | casual adult: reaction 0.3–0.4 s, sees all lanes 2 s ahead, predicts rolling balls, timing σ 60 ms |
| `jumpSpam`, `zigzag`, `zigJump`, `idleMid`, `idleSide` | exploit / do-nothing inputs (jump every frame, lane-wiggle every 0.25 s, both, nothing) |
| `botAlwaysJump`, `botNeverJump` | bot 0.9 lanes + jump every frame / never jump |

## Baseline: survival, score, first point (60 seeds, 480 s cap)

| group | survival p10 / p50 / p90 (s) | score p10 / p50 / p90 | reach biome 2 / 3 / 5 | 1st acorn p50 | 1st hit p50 |
|---|---|---|---|---|---|
| easy · kid | 160 / 207 / 446 | 1196 / 1795 / 4430 | 100 / 97 / 27 % | 4.0 s | 44 s |
| easy · kid5 | 123 / 172 / 261 | 1063 / 1405 / 2399 | 97 / 83 / 10 % | 3.8 s | 32 s |
| easy · adult | 480 / 480 / 480 | 5270 / 5880 / 6284 | 100 / 100 / 98 % | 3.0 s | 152 s |
| easy · bot0.3 / 0.5 / 1 | 250 / 480 / 480 · 480 · 480 | p50 7375 / 8565 / 7810 | 100 / 100 / 82–100 % | 3.0 s | 95 / 169 s / never (98 %) |
| normal · kid / kid5 | 128 / 69 (p50) | p50 1215 / 685 | 73 / 38 / 2 % · 48 / 8 / 0 % | 3.0 s | 28 / 19 s |
| normal · adult | 202 / 480 / 480 | 2166 / 6265 / 6906 | 98 / 98 / 77 % | 2.4 s | 124 s |
| normal · bot0.3 / 0.5 / 1 | 197 / 480 / 480 (p50) | p50 2995 / 9375 / 8275 | 65 / 100 / 100 % reach biome 3 | 2.4 s | 66 / 182 s / never |
| hard · adult | 186 / 471 / 480 | 2286 / 5985 / 6952 | 100 / 100 / 70 % | 2.8 s | 117 s |
| hard · kid / kid5 | 68 / 56 (p50) | p50 785 / 580 | 48 / 13 / 0 % · 28 / 2 / 0 % | 2.4–2.5 s | 17 / 15 s |
| hard · bot0.3 / 0.5 / 1 | 142 / 480 / 480 (p50) | p50 2455 / 9915 / 8990 | 47 / 100 / 100 % reach biome 3 | 2.1 s | 69 / 153 s / never |

Patched, the same table moves as shown in "Before / after". Patched survival p50 is easy·kid 227 s, easy·kid5 183 s, normal·kid 160 s,
hard·adult 480 s, and all bots at skill 0.5 and up reach 480 s.

## Per-biome pacing (time spent per biome, p50 (p10–p90))
| group | Felt Meadow (gk 1) | Pillow Mountains (0.7) | Crayon Jungle (1.25) | Glow-Star Galaxy (0.5) | Meadow, loop 2 |
|---|---|---|---|---|---|
| easy · kid | 72.2 s (72.0–72.5) | 68.0 s | 64.7 s | 61.1 s | 72.0 s |
| easy · adult | 72.0 s | 67.7 s | 64.3 s | 61.1 s | 71.7 s |
| normal · adult | 73.1 s | 68.8 s | 65.3 s | 62.0 s | 72.8 s |
| hard · adult | 73.5 s | 69.2 s | 65.8 s | 62.4 s | 73.3 s |

All biomes are inside 45–90 s and the spread is under 1 s, because the goal is a distance and stumbles only slow Otto briefly. Jumps per biome (adult): 0 / 4–9 /
8–12 / 8–11. Acorns per biome: 67–96 (meadow) down to 43–61 (crayon). The patch leaves durations unchanged to within 0.3 s.

## Hits per biome by obstacle kind (baseline; total = tower / blocks / ball)
| group | Meadow | Pillows | Crayon | Stars | deaths in biome 1/2/3/4 |
|---|---|---|---|---|---|
| easy · kid | 1.07 = 1.07 / 0 / 0 | 1.32 = 0.65 / 0.67 / 0 | **3.26 = 0.38 / 1.40 / 1.48** | 1.83 = 0.70 / 0.47 / 0.67 | 0 / 3 / 48 / 47 % |
| easy · kid5 | 1.60 = 1.60 / 0 / 0 | 1.95 = 0.84 / 1.10 / 0 | **3.26 = 0.40 / 1.66 / 1.20** | 2.08 = 0.42 / 1.17 / 0.50 | 3 / 14 / 76 / 50 % |
| easy · adult | 0.18 = 0.18 / 0 / 0 | 0.23 = 0.10 / 0.13 / 0 | 1.22 = 0.15 / 0.22 / **0.85** | 0.77 = 0.10 / 0.10 / **0.57** | 0 / 0 / 0 / 2 % |
| normal · adult | 0.37 | 0.39 | 1.25 = 0.24 / 0.32 / **0.69** | 0.91 = 0.13 / 0.17 / **0.60** | 2 / 0 / 10 / 13 % |
| hard · adult | 0.40 | 0.48 | 1.22 = 0.20 / 0.23 / **0.78** | 0.94 = 0.28 / 0.26 / **0.40** | 0 / 0 / 22 / 11 % |
| normal · bot0.5 | 0.08 | 0.20 | 0.53 = 0.03 / 0.45 / 0.05 | 0.21 | 0 / 0 / 3 / 0 % |
| normal · bot0.3 | 0.73 | 1.58 | 1.51 | 1.57 | 2 / 34 / 28 / 39 % |
| bot 0.9 / 1 (all) | 0 | 0 | 0–0.02 | 0 | 0 % |

Patched: adult ball hits fall to Crayon 0.32–0.38 and Stars 0.03–0.09. Kid Meadow tower hits 0.37 (Easy).

## Why the kid bumps towers in biome 1 (`node tests/sim/kidprobe.js kid easy 300 1`)
Over 300 Easy runs, kid: 253 biome-1 hits (0.84 per run). kid5: 429 (1.43).
| cause | kid | kid5 |
|---|---|---|
| lapse: noticed less than 0.45 s ahead, so the 0.6–0.9 s reaction cannot make it | 57 % | 40 % |
| free lane 2 lanes away (a `tower2` with the kid on the far side) | 25 % | 10 % |
| wrong-way swipe | 13 % | 19 % |
| swipe not recognised (kid5 only) | – | 29 % |
| slow reaction / other | 5 % | 1 % |
| **by pattern: `tower2` / `tower1`** | **148 / 105** | 193 / 236 |

On Easy, `tower2` makes up about 1 in 6 tower rows (weight 2 × 0.5 = 1 against `tower1` 5), but it causes 59 % of the kid's hits. It blocks 2 of 3 lanes, so
a lapse there is twice as likely to land in the kid's lane, and the free lane is sometimes 2 swipes away. Those two causes are what config can
change. Lapses and missed swipes on single towers are the model's own limit.
Other levers tried (150 seeds, kid / kid5 biome-1 hits; base 0.84 / 1.56). Only `tower2` weight moves it:
`tower2 0` **0.38 / 0.83** · `tower2 1` 0.69 / 1.19 · `gapK 1.6` 0.93 / 1.45 · more acorn rows 0.83 / 1.41 · Easy `react 1.3`
1.03 / 1.21 · narrower tower (w 0.3, heroHalfW 0.25) 0.84 / 1.53 · `hitZPad 0.2` 0.84 / 1.53 · Easy speed 5.0 0.45 / 0.80 (with tower2 0).
`tower2 0` also affects Normal and Hard (biome-1 is the same for all difficulties). Adult biome-1 hits there go 0.37 → 0.30 and 0.40 → 0.35, so
biome 1 is still not empty for adults. To keep `tower2` on Normal/Hard, `_pickPattern` would need an Easy-only zone-0 rule (a code change, not config).

## Gravity fairness
**Jump timing windows** (`NV=13 node tests/sim/windows.js [patch]`). Each case is an isolated world at the biome's gravity with one obstacle
in Otto's lane. It is the longest run of take-off times (5 ms grid) that clears the obstacle. Ball: 13 roll speeds = 13 bounce phases.
| biome | blocks (Easy / Normal / Hard) | ball, baseline: min / median, in-lane impossible | ball, patched: min / median, in-lane impossible |
|---|---|---|---|
| Meadow 1.0 | 375 / 410 / 440 ms | (no balls in meadow) | – |
| Pillows 0.7 | 565 / 600 / 615 ms | (no balls) | – |
| Crayon 1.25 | 310 / 340 / 360 ms | Easy 50 / 75 ms, 0/13 | **Easy 130 / 140, Normal 175 / 175, Hard 180 / 190 ms**, 0/13 |
| Stars 0.5 | 775 / 790 / 810 ms | **0 / 0 ms, 7/13 phases (Easy, Normal), 4/13 (Hard)** | **375 / 385 – 415 / 420 ms, 0/13** |

On the moon, in those 7 phases neither running under nor jumping works. The only way past is a sideways dodge of a moving ball, and the
"float over everything" hint says the opposite. The sweep (ballV 2.6–4.2, kick 1.2–1.6, rest 0.6–0.78) showed that making balls higher
(ballV 4.0) breaks Crayon instead (5/7 phases impossible). Lower, quickly settling hops fix both biomes.

**Mid-jump gravity ease** (`gravity.js` §1). 48 jumps taken at 0–1.1 s into every biome's ease: apex and airtime match
`jumpProfile(take-off gk)` exactly (|Δ| = 0.0000). A jump never changes in flight. Balls do follow the easing `world.g`, which is fine.

**Biome start / easing window** (first `gravEase + 1.5` = 2.7 s of a new biome; 80 seeds, patched). The adult is hit about 2.2× more often
there (Normal 0.94 vs 0.41 hits/min, Hard 1.19 vs 0.50). The bots are not (0.25 vs 0.22). All 20 oracle-checked easing hits were avoidable. They come from a timing
re-learn: the adult plans with the old airtime. `gravEase` 0.8 or 1.6 does not change it (1.08 / 0.94 per min). The two skill-1 bot hits in loop 2
(Easy, seeds 2/11/49, t ≈ 266 s) are blocks right at the **moon → meadow** change (Δgk +0.5, the biggest step). The oracle says they are avoidable,
so this is a bot limitation.

**Landing into a row after a long moon / floaty jump.** Adults and bots: **0 hits** less than 0.35 s after a landing, in any biome. Kids: 15–28 per 80
runs. Those are their own too-early jumps (`kid5.lowGEarly`), mostly in Pillows. All 20 oracle-checked were avoidable. The generator's
`airGap` spacing works.

**Balls that cannot be passed.** None in the full-track oracle checks (13 moon, 20 crayon ball hits, before and after). The in-lane trap
above was always escapable sideways, which is why the oracle never flagged it, but a human only escapes by dodging.

## Exploits
| strategy | result |
|---|---|
| jump every frame + bot lanes (`botAlwaysJump`), hits/min Meadow · Pillows · Crayon · Stars | Easy 0.02 · 1.26 · 2.67 · **1.58**, Normal 0 · 2.09 · 2.02 · **1.94**, Hard 0 · 1.72 · 2.82 · **2.28** (the normal bot: 0–0.02 everywhere). Patched: Stars 1.52–1.99. **Permanent moon jumping does not avoid everything**: Otto lands on blocks and in ball paths, and the 0.15 s jump buffer does not chain jumps perfectly. |
| `jumpSpam` (only jump) | dies in biome 1–2: survival p50 47 / 23 / 19 s (towers cannot be jumped). Patched 59 / 31 / 26 s |
| `zigzag` / `zigJump` lane-wiggle | p50 32 / 14 / 14 s, 0 % reach biome 2 |
| `idleMid` / `idleSide` | p50 47 / 23 / 19 s. Patched Easy: 38 % of idle runs get through biome 1 (5 hearts, single towers only hit the middle a third of the time), then die in biome 2 |
| `botNeverJump` | clears biome 1 (nothing to jump), dies in biome 2–3: every biome after 1 needs jumps |

## Open issues (for the mechanics engineer, not config)
1. **The Crayon Jungle is where kids die** (kid Easy: 3.3 hits, 45–48 % of deaths, unchanged by any config value tried). The causes are no jump / late jump
   on blocks (56 %), because the heavy-gravity window is 310 ms against the kid's σ 140 ms + 80 ms late, and balls the kid does not predict (`predictBall: false`).
   Slower balls made it worse (they stay in a lane longer: 3.94 hits). gk 1.15 helped adults, not kids. Ideas: on Easy, a ball telegraph (a
   shadow / dotted path on the lane it will cross) or `ball` weight × 0.5 on Easy in `_pickPattern`, like `tower2`.
2. Update the unit test `ball: a hit needs real vertical overlap…` (see the CONFIG diff) and MECHANICS §1/§3 (ball hop table, "Otto can run under
   a high moon bounce" no longer happens, since the moon ball top is ≤ 1.03 u). The ball first hop is now 0.59 u on the moon.
3. Easing window: adults are hit about 2× more often in the first 2.7 s of a biome. Consider keeping the first obstacle row of a biome ≥ 1.5 s after
   the arch (a generator rule).
4. The REQUIREMENT says "Each biome is about 60–80 s". Measured: 61–74 s on every difficulty. OK.

## Reproduce
```
node tests/sim/playtest.js --seeds 60 --maxT 480 --out baseline --jobs 2
node tests/sim/playtest.js --seeds 60 --maxT 480 --out proposal --jobs 2 --patch tests/sim/patches/playtest-2026-11-22.json
node tests/sim/report.js baseline proposal
node tests/sim/kidprobe.js kid5 easy 300 1 [patch.json]          # cause of every biome-N hit of a player model
NV=13 node tests/sim/windows.js [patch.json]                      # jump windows per biome gravity
node tests/sim/gravity.js 80 [patch.json]                         # mid-jump ease, easing-window hits, long landings, always-jump exploit
node tests/sim/oracle-gravity.js 40 [patch.json] 10               # oracle on those gravity hits
node tests/sim/oracle.js tests/sim/results/proposal.json          # oracle on every skill-1 bot hit
SIM_GROUPS=main node tests/sim/explore.js 100 base,P4             # A/B (P4 = the proposed patch)
node tests/sim/unit-patched.js tests/sim/patches/playtest-2026-11-22.json
```
New or changed in `tests/sim/`: `players.js` (kid5 model, `missSwipe`, `lowGEarly`), `playtest.js` / `report.js` (kid5 group), `explore.js`
(new candidates, `SIM_GROUPS=main|kid`), new `kidprobe.js`, `windows.js`, `gravity.js`, `oracle-gravity.js`, `unit-patched.js`,
`patches/playtest-2026-11-22.json`. Results are in `tests/sim/results/`.
