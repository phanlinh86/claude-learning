# Ziggy's Apple Castle: high-speed playtest report (2026-11-19)

Report only: no game code was changed. All numbers come from headless runs of `game/js/world.js` + `bot.js` in a node vm.

- **How to reproduce:** `node tests/sim/deep.js` (baseline), `node tests/sim/make-patched.js` (builds `results/world.patched.js` = world.js with the proposal applied as source edits, and checks that it plays the same 60/60 games as the in-memory overrides), `node tests/sim/deep.js --patched tests/sim/results/world.patched.js`, `node tests/sim/deep.js --compare --after deep-patched`. CONFIG sweeps: `node tests/sim/sweep2.js easy|lantern|pace|hard`.
- **Size:** 15,780 games per full run (60 seeds per row, 10 min cap, 30 min for the long runs, plus 10,860 games of exploit sweeps), about 4.5 min wall time. Baseline and proposal were both run in full: 31,560 games, plus about 9,000 sweep games.
- **Full tables:** `tests/sim/results/deep-baseline.md`, `deep-patched.md`, `deep-compare.md`.

## Player models
| model | what it does |
|---|---|
| `AC.Bot` 0.2 … 1.0 | the stock bot. It watches `predictLanding()` and taps with timing and aim noise of (1 − skill). The noise is × (1 + 0.7·(1 − lit)) in the dark |
| **kid4** (4–5 y) | looks for 0.8–2.2 s and is sometimes distracted for 2–6 s. Reacts in 0.4–0.9 s and only partly anticipates (k 0.82), so it taps late. Rough aim (sd 0.22 crate). 8 % random taps, 12 % "late" taps (reacts to the guide without anticipating), 25 % lets a chance pass, 12 % double-taps |
| **kid6** (6 y) | the same with reaction 0.35–0.65 s, k 0.86, aim sd 0.16, 5 % random and 8 % late taps |
| adult | reaction 0.2–0.35 s, good anticipation, aim sd 0.07 crate |
| spam | a tap every 50–150 ms without looking |
| metronome / fixed delay | a blind tap every *iv* s (0.1–6 s), or exactly *d* s after each new crate (0–6 s, which tries to phase-lock to the swing) |
| centre | taps the very frame Ziggy passes the middle (zero reaction time) |
| waitPerfect / appleGreed | frame-perfect upper bounds. appleGreed waits for a release that also grabs an apple |

**New in the harness:** the human models now feel the dark too. Their timing and aim noise is × (1 + 0.7·(1 − lit)). This is the same law as the bot, but with its own constant, so CONFIG changes cannot tune the model. Without it, darkness and lanterns would have no effect on the human models.

## Findings (baseline, 960×540)
### 1. Survival and score
| row | game over in 10 min | survival p50 | score p10/50/90 | levels p50 | perfect | miss / drop |
|---|---|---|---|---|---|---|
| easy kid4 | 100 % | 143 s | 105/375/825 | 1 | 31 % | 32.2 % |
| easy kid6 | 88 % | 342 s | 925/1765/3515 | 3 | 43 % | 19.3 % |
| easy adult | 0 % | 600 s | 9810/10860/11625 | 11 | 78 % | 1.0 % |
| normal adult | 87 % | 357 s | 940/3505/7425 | 6 | 40 % | 7.8 % |
| hard adult | 100 % | 114 s | 225/725/1575 | 1 | 28 % | 10.1 % (+6.3 topples per 100 drops) |
| normal bot 0.5 / 0.7 / 0.9 | 100 / 98 / 0 % | 88 / 244 / 600 s | | 2 / 7 / 18 | 31 / 39 / 72 % | 15.9 / 8.5 / 0.5 % |

- **Skill matters and the curve is smooth.** On Normal, bot 0.5 → 0.9 goes from an 88 s game to "never dies".
- **Kids should play Easy.** On Normal a 6-year-old clears dawn in only 27 % of games.
- **Time to the first point** is 2–4 s in every row (the first crate lands right away).

### 2. Pacing per time of day (p50 seconds per level, first day; target 45–90 s)
| row | dawn | noon | sunset | night |
|---|---|---|---|---|
| easy kid4 | 89 | 95 | 102 | — |
| easy kid6 | 71 | 84 | **93** | **110** |
| easy adult | **41** | **43** | 53 | 63 |
| normal adult | **43** | 49 | 54 | 58 |
| hard adult | **43** | 53 | 53 | — |
| normal bot 1.0 (expert) | 23 | 25 | 25 | 26 |

- Normal/adult pacing is about right.
- On Easy a 6-year-old's sunset and night levels run long (93 s and 110 s).
- Easy dawn and noon are short for an adult (about 41 s).
- Experts finish a level in about 25 s, which is expected for a tap-timing game.

### 3. Darkness: how much it raises misses, and whether lanterns help
Miss % per drop by time of day. The counterfactual "noDark" plays the same seeds with every zone at light 1.

| row | dawn | noon | sunset | night | night with noDark | night with no lantern light |
|---|---|---|---|---|---|---|
| easy kid6 | 13.4 | 16.1 | 21.0 | 25.2 | 17.7 | 27.3 |
| normal adult | 2.8 | 4.5 | 8.2 | **13.0** | **6.0** | **18.1** |
| hard adult | 6.2 | 8.8 | 16.6 | 21.1 | 8.7 | 16.7* |
| normal bot 0.7 | 0.3 | 1.2 | 8.8 | 13.5 | 7.3 | 15.5 |

\* few hard-adult drops reach night (n ≈ 130), so treat this as noise.

- **The dark roughly doubles night misses.** Normal adult goes 6 % → 13 %, and survival drops from 600 s (noDark) to 357 s.
- **Most deaths happen at sunset and night:** Normal adult 47 of 52 game overs, Easy kid6 41 of 53.
- **Lanterns help clearly where perfects are common.** For Normal adult, removing the lantern light raises night misses 13 % → 18 % and cuts survival 357 → 210 s.
- **Drops onto a lantern crate miss half as often** (Normal adult 7.5 % vs 14.3 %; lit 0.79 vs 0.39). Lanterns are a real reason to aim for Perfect.
- **For a 6-year-old, lanterns help only a little** (night 25 % vs 27 %): kids make few perfects, and their errors are mostly slow reactions, not poor visibility.
- **Bigger lanterns barely help.** In the sweep, lantern r 1.5 → 2.0 or a 0.9 → 1 changed misses by under 1 point: the lit value rises for the crate above, but not enough to matter. Not proposed.
- **A lighter night barely helps.** Sunset 0.6, night 0.35, nightEnd 0.3 changed nothing measurable. Not proposed.
- **Miss rate by how lit the top is** (all drops, Normal adult): lit < 0.45 → 14.5 %, 0.45–0.7 → 9.1 %, 0.7–0.9 → 6.3 %, ≥ 0.9 → 3.6 %.

### 4. Pies: too easy or endless?
| row | survival p50 with pies | without pies | pie hearts per game | alive at 30 min (with / without) |
|---|---|---|---|---|
| easy kid6 | 342 s | 211 s | 5.3 | 0 / 0 % |
| normal adult | 357 s | 180 s | 4.4 | 0 / 0 % |
| hard adult | 114 s | 78 s | 2.0 | 0 / 0 % |
| easy adult | endless | endless | 0.9 | 100 / 87 % |
| normal appleGreed (frame-perfect) | endless | endless | 0 | 100 / 100 % |

- **Pies about double a normal player's game.** They give back roughly half of the hearts a player loses.
- **They never make Normal or Hard endless.** No human-like or bot ≤ 0.7 game survived 30 min.
- **The only endless games are Easy-adult and frame-perfect play**, and those are endless with or without pies.
- **Verdict:** `pieEvery` 5 is right. Keep it.

### 5. Perfect rate
- Easy: kid6 43 %, adult 78 %. Normal: adult 40 %. Hard: adult 28 %.
- Bots run from about 50 % at skill 0.2 to 95–100 % at skill 1.
- Perfect stays meaningful and reachable at every level.

### 6. Exploits: none found
| exploit | best case found (Easy / Normal / Hard) |
|---|---|
| spam taps (every 50–150 ms) | dies in 9 / 6 / 6 s, 75–83 % misses. A buffered tap fires at spawn, at a random swing phase |
| blind metronome, best of 60 intervals | 37 / 21 / 19 s, 0 levels |
| fixed delay after each crate, best of 121 delays (cherry-picked on 20 seeds) | 150 / 64 / 107 s, 1 level, about 30 % misses: worse than the kid6 model |
| kid double-taps | 178 double taps in 1,356 Easy drops: **0** of them dropped the next crate (the 0.25 s buffer runs out during the fall and settle) |
| "tap when Ziggy is in the middle" (zero reaction) | Easy: 100 % perfect, endless (the Easy drift of about 24 px is inside the ±33 px perfect zone, as designed). Normal/Hard: dies in 11 / 8 s |

There is no input trick that beats real timing. Easy has no skill ceiling for an adult, which is fine for a kids' setting.

### 7. Is Easy dawn easy for a 6-year-old?
- **Yes:** kid6 clears dawn on Easy in 100 % of games, with 13 % misses, in 71 s.
- **A 4–5-year-old struggles:** 63 % dawn clear at 960×540, 31 % misses at dawn, and every game is over within about 2.5 min.

### 8. Devices
| layout | easy kid6 game over in 10 min | normal adult game over in 10 min |
|---|---|---|
| 960×540 | 88 % | 87 % |
| iPhone landscape 844×390 | 92 % | 95 % |
| iPhone portrait 390×844 | 10 % | 15 % |
| iPad portrait 820×1180 | 28 % | 13 % |

- **Portrait plays much easier.** `computeLayout` uses `swingA = 0.34·w` in portrait, which is 2.0 units, against 3.0 units in landscape. Ziggy's top speed relative to the crate is about 30 % lower.
- **This is not a CONFIG key.** It is flagged for the mechanics owner.
- **Option:** give portrait `swingA` a floor of about 2.6 units, or accept that portrait (the usual phone hold) is the gentler mode. It helps kids, but best scores are not comparable across orientations.

## Proposal: exact CONFIG changes (`game/js/world.js`; also in `tests/sim/proposal-config.json`)
| key | old → new | reason |
|---|---|---|
| `difficulty.easy.swing` | 0.6 → **0.52** | A late tap costs v × delay. A 13 % slower swing is the biggest lever for small kids, and it moves Easy-adult dawn into the 45–90 s band |
| `difficulty.easy.crate` | 1.35 → **1.45** | A wider stay window for noisy or late taps (1.6 unit crate on a 2.4 unit plinth) |
| `difficulty.hard.assist` | 0.2 → **0.35** | About 40 % of Hard heart losses were late centre-of-mass topples (6.3 per 100 drops), which feel unfair. This halves them and Hard stays hard |
| `zones[2].goal` (sunset) | 14 → **13** | Sunset/night ran 93–110 s for a 6-year-old on Easy |
| `zones[3].goal` (night) | 16 → **14** | The longest and darkest level. Normal adult stays above 45 s |

Rejected after sweeps:
- `lights.lantern.r` 1.8/2.0/2.2 and `a` 1: under 1 point of gain.
- Lighter `nightEnd` / sunset / night: no gain.
- `difficulty.easy.perfectTol` 0.25: +4 points of kid4 dawn clear, but it makes Easy even more automatic for adults.
- Goals 11/12/13/14: dawn was already fine.
- Hard assist 0.3: about half the topple gain of 0.35.

## Before → after (60 seeds per row, the patched world.js)
| row | game over in 10 min | survival p50 s | dawn clear % | miss % | topples / 100 | level s dawn/noon/sunset/night | night miss % |
|---|---|---|---|---|---|---|---|
| **easy kid4** | 100 → 100 | 143 → **165** | 63 → **83** | 32.2 → 28.1 | 0.37 → 0.40 | 89/95/102/— → 85/93/102/108 | 66.7 → 35.9 |
| **easy kid6** | 88 → **50** | 342 → **600** | 100 → 100 | 19.3 → **15.5** | 0.34 → 0.22 | 71/84/93/110 → 67/84/91/**95** | 25.2 → **19.2** |
| easy adult | 0 → 0 | 600 → 600 | 100 → 100 | 1.0 → 0.4 | 0 → 0 | **41/43**/53/63 → **47/47/47/52** | 2.0 → 0.6 |
| iPhone portrait easy kid4 | 95 → **75** | 280 → 353 | 92 → 95 | 24.9 → 20.9 | | 87/95/105/118 → 85/100/100/108 | 36.7 → 27.9 |
| iPad portrait easy kid6 | 28 → **3** | 600 → 600 | 100 → 100 | 13.3 → 9.2 | | 69/81/91/101 → 68/81/86/92 | 17.5 → 10.7 |
| easy bot 0.2 | 73 → **15** | 482 → 600 | 100 → 100 | 11.3 → 6.6 | | 38/39/46/50 → 40/44/44/47 | 16.5 → 9.9 |
| normal adult | 87 → 85 | 357 → 297 | 98 → 98 | 7.8 → 8.1 | 1.55 → 1.42 | 43/49/54/58 → 43/49/**49/52** | 13.0 → 13.9 |
| normal bot 0.7 | 98 → 100 | 244 → 255 | 100 → 100 | 8.5 → 8.4 | 0.33 → 0.30 | 23/25/31/44 → 23/25/29/40 | 13.5 → 12.8 |
| **hard adult** | 100 → 100 | 114 → **127** | 73 → **92** | 10.1 → 12.2 | **6.29 → 2.81** | 43/53/53/— → 39/44/47/54 | 21.1 → 21.1 |
| hard bot 0.5 | 100 → 100 | 32 → 36 | 25 → 42 | 22.2 → 23.9 | **6.82 → 3.02** | | |
| hard bot 0.9 | 7 → 2 | 600 → 600 | 100 → 100 | 1.2 → 1.2 | 0.33 → 0.08 | | |

**Unchanged:**
- Normal-difficulty kid rows (the proposal does not touch Normal) and spam/metronome rows: the exploits are still dead.
- Long runs: still no Normal/Hard game alive at 30 min.
- Pies: still about double survival, never endless.

**Trade-off:** Normal adult survival p50 is 357 → 297 s.
- Shorter sunset/night levels bring the faster loop 2 sooner in time.
- Levels per game stay about the same (6 → 5 p50), and the 10-minute game-over rate is about the same (87 → 85 %).
- If that matters more than the kids' night pacing, keep night at 15 instead of 14.

## Still not covered by the sims
- Real kids' hands. The kid models are guesses: reaction times from the literature, plus random, late and double taps.
- How dark the screen really looks on an iPhone at full brightness against an iPad in a dim room.
- Music and sound: whether audio cues help the timing.
