# Ember's Glow Castle: high-speed playtest report

Date: 2026-11-03. Tester: the playtest agent. I only reported. Nothing in `game/` was changed.

## How it was tested
- Harness: `tests/sim/` (`lib.js` runs games and collects metrics, `players.js` holds the player models, `run.js` runs the full matrix, `sweep.js` compares CONFIG candidates, `double_tap.js` checks the drop buffer). Everything runs headless through `tests/unit/load.js` at 60 fps with the real `EG.World` fixed steps (960×540).
- **3,780 games per matrix run.** The matrix was run twice, once for the baseline and once for the proposal, and about 6,000 more games went into the sweeps.
  - `EG.Bot` at skill 0.3, 0.6 and 0.9: 100 seeds × 3 difficulties, 15 min cap.
  - **kid5** (a 5-year-old): about 14 drops/min. Waits 1.7–3.3 s per drop, and 10 % of the time gets distracted for another 5–12 s. Each tap goes 35 % to the column under Ember, 35 % to a random column and 30 % to a column where the same colour is visible. Ignores pumpkins, height and "next". Double-taps 10 % of the time (the second tap is buffered). After a refuse, taps another column. 300 seeds × 3 difficulties, 20 min cap.
  - **kid5 slow**: about 11.5 drops/min and sees matches only 15 % of the time. 150 seeds.
  - **adult** (casual): about 25 drops/min. Greedy one-step merge seeker with a small "don't stack high" term, no lookahead, no pumpkin plan, and 15 % random picks. 300 seeds.
  - **spam**: 30 seeds per mode, 10 min cap. Modes: same column at 10 and 60 taps/s, alternating 2 columns, sweep 0→4, random at 10 and 60/s, and `drop()` with no column while `aim()` jitters every frame.
- Full tables: `tests/sim/results/baseline.md` and `proposal.md` (JSON next to them). Re-run with `node tests/sim/run.js baseline` and `node tests/sim/run.js proposal tests/sim/proposal.json` (about 2 min each).
- Wall-clock times below come from the human models' own drop rates. The bot drops 34–43 lights a minute, 2.5–3× faster than a child.

## Findings (baseline, current CONFIG)

### 1. Stability and exploits: no bugs found
- **No invariant errors and no stuck boards** in any of the 3,780 games. Checks: grid vs stacks, NaN, item leaks, and a board busy for more than 20 s without a drop. That includes about 4 million spam taps, roughly 99 % of them sent while the board was busy.
- **The drop buffer behaves sanely.** Only the latest tap is kept, and it runs once the board is ready. A buffered tap into a column that has filled up meanwhile is refused once and then discarded, with no retry loop. A buffered tap during the goal ascent runs after the level-up.
- **Double taps** (a 5-year-old's excited second tap) become a real second drop in the same column. In practice this does no harm. Measured with and without double taps on Easy (proposal CONFIG): level times 74/113/178/283 s with them vs 81/123/203/298 s without, and 6 % game overs both ways (`results/double_tap.md`).
- **Spamming can't farm points:**
  - *Same column* (10 or 60 taps/s): about 15 drops, then the column is full and every tap is refused. Score is about 150, the game sits on level 0 forever and never ends.
  - *Alternating 2 columns*: 1–2 k points, also stalls.
  - *Random or sweep mashing* runs at about 50 drops/min (the board's maximum throughput). On Normal and Hard it dies in a median 160–180 s with 6 k points, against 24 k for bot 0.9. On Easy (no pressure in the first two places) mashing scores 25–27 k in 10 min. Per minute that is about the same as good play, because Easy's score is supply-bound and scales with drop rate. This is acceptable for a kids' mode, but **Easy's best score mostly rewards tapping fast**.
- **Non-CONFIG note:** a refused tap plays the two-blip "nuh-uh" sound every time, and nothing rate-limits it (`main.js:278`). A child mashing a full column gets up to 60 refuse sounds a second (35 k in 10 min). Suggestion for the integrator: at most one refuse sound per 0.3 s.

### 2. A 5-year-old on Easy: safe, but slow to get going
| Easy, kid5 (14 drops/min) | baseline |
|---|---|
| first merge | 9.6 s (drop 2) |
| first candle (L1 goal) | **99 s** (24 drops) |
| L1 / L2 / L3 / L4 (s per level) | **100 / 176** / 231 / 330 |
| reaches candle / lantern / star / moon (20 min) | 100 % / 100 % / 100 % / 89 % |
| loses in first 3 min | **0 %** |
| game over within 20 min | 10 % (all in the tower, level 3, after about 10 min) |

- She never loses early. **But the candle takes 1 min 40 s and the lantern almost 3 more minutes**, above the 45–90 s target. The slower kid needs 129 s and 236 s.
- The cause: a kid scatters lights, so they need about 2× more supply than the goal's "units". The courtyard gives only 1.40 units/drop and the cellar 1.70.

### 3. Normal: the library and tower are a wall for casual players
- Casual adult: L1 41 s, L2 73 s, L3 **121 s**, L4 155 s. They reach the moon in only **34 %** of games, with a median survival of **6.9 min**. 89 of 150 losses happen in the tower (level 3) and the rest mostly in the library.
- Random play (bot skill 0) reaches the moon in 23 % of games and bot 0.3 in 42 %, so skill barely separates casual players.
- The library rises 3 pumpkins every 4 drops (0.75 per drop) and the tower 1 per drop, on top of 6–10 % dropped pumpkins.
- bot 0.9 reaches the moon in 83 % (matches MECHANICS §8).

### 4. Hard: fine as "hard", no change proposed
- Adult reaches the moon in 17 % of games, bot 0.9 in 60 % and the kid in 7 %. Median survival is 5–9 min, and the kid survives longer in seconds because she drops slower (the creep counts drops).

### 5. Boo and pumpkins
- **How often Boo comes:**
  - Kid: 0.5–0.66 visits/min (about every 1.5–2 min, 12 per 20-min game on Easy).
  - Adult: 0.8–1.2 per min.
  - Bots: 1.2–2.0 per min.
  - Fly-bys (nothing to carry) are under 3 % of visits.
- **What Boo carries:**
  - Normal and Hard: 72–90 % pumpkins.
  - Easy: 61 % for the kid (tiers 1/2/3 make up the rest, 18/13/9 %) and 63–77 % for the others.
  - So the `helperMaxTier 3` cap works: he never takes progress.
- **Pumpkin pressure:**
  - Wakes per pumpkin (rises plus dropped pumpkins): 63–66 % for kids, 73–77 % for adults, 80–83 % for bot 0.9.
  - The night creep is the one mechanic where skill shows. Unwoken pumpkins pile up as "holes" until Boo's next visit.
- Time to first merge is 2–3 drops for everyone (2.5 s for bots, 4.5 s for adults, 8–12 s for kids). Good onboarding.

## Proposed CONFIG changes (`CONFIG.difficulty`, world.js)
| key | old | new | why |
|---|---|---|---|
| `easy.spawn[0]` | `[3, 2, 0, 0]` (1.40 u/drop) | `[1, 3, 0, 0]` (1.75) | still tiers 1–2 only. The kid's candle goes from 99 s to 73 s |
| `easy.spawn[1]` | `[5, 4, 1, 0]` (1.70) | `[2, 4, 3, 0.5]` (2.74) | the kid's lantern goes from 176 s to 114 s |
| `easy.spawn[2]` | `[4, 4, 2, 0.5]` (2.29) | `[3, 4, 3, 1]` (2.82) | the star goes from 231 s to 180 s |
| `easy.spawn[3]` | `[3, 3, 2.5, 1.2]` (2.95) | `[2, 3, 3, 2]` (3.60) | the moon goes from 330 s to 288 s |
| `easy.riseEvery` | `[9, 9, 5, 4]` | `[9, 9, 6, 5]` | gentler library and tower. The kid's 20-min game overs go from 10 % to 4 % |
| `normal.spawn[2]` | `[4, 3, 2, 0.8]` (2.49) | `[3, 3, 3, 1]` (2.90) | the adult's star goes from 121 s to 101 s |
| `normal.spawn[3]` | `[3, 3, 2.5, 1.5]` (3.10) | `[2, 3, 3, 2]` (3.60) | the adult's moon level goes from 155 s to 138 s |
| `normal.riseCount` | `[1, 2, 3, 3]` | `[1, 2, 2, 3]` | the library goes from 0.75 to 0.5 pumpkins/drop. The tower stays at 1/drop |

- Hard is unchanged. Patch: `tests/sim/results/proposal.patch`. It is git-apply-able from the repo root and is **not applied**.
- With the patch, all 29 unit tests pass, checked on a scratch copy. One stronger Normal variant (tower `riseEvery 3 → 4`) took the adult to an 81 % moon rate, but it broke the unit test "random play on Normal loses within 10 min" and let random play reach the moon 65 % of the time, so I rejected it.

## Before / after (re-simulated, same seeds)
**Easy**
| player | L1 / L2 / L3 / L4 s | first candle s (drop) | reach moon | game over (cap) | lost < 3 min | score med |
|---|---|---|---|---|---|---|
| kid5 | 100 / 176 / 231 / 330 → **74 / 114 / 180 / 288** | 99 (24) → **73 (18)** | 89 % → 96 % | 10 % → 4 % | 0 % → 0 % | 15.3 k → 18.9 k |
| kid5 slow | 129 / 236 / 278 / 365 → **100 / 154 / 228 / 347** | 127 (25) → 99 (20) | 77 % → 91 % | 6 % → 9 % | 0 % → 0 % | 12.7 k → 14.9 k |
| adult | 46 / 79 / 125 / 191 → 36 / 48 / 97 / 158 | 45 → 35 | 100 % → 100 % | 15 % → 15 % | 0 % | 30.5 k → 39.1 k |
| bot 0.3 | 35 / 61 / 88 / 133 → 27 / 38 / 72 / 111 | 34 → 26 | 98 % → 100 % | 25 % → 13 % | 0 % | 31.5 k → 39.9 k |
| bot 0.9 | 20 / 41 / 76 / 114 → 15 / 27 / 57 / 96 | 19 → 14 | 100 % → 100 % | 10 % → 17 % | 0 % | 38.8 k → 48.7 k |

For Easy, game overs only happen in castle loops after 10+ minutes, and faster play reaches the harsher loop levels sooner. That is why bot 0.9's rate rises a little.

**Normal**
| player | L1 / L2 / L3 / L4 s | reach star / moon | median survival | game over | score med |
|---|---|---|---|---|---|
| adult | 41 / 73 / 121 / 155 → 41 / 73 / **101 / 138** | 97 / 34 % → 100 / **51 %** | 414 → **588 s** | 100 → 100 % | 9.5 k → 15.6 k |
| kid5 | 97 / 144 / 217 / 246 → 97 / 144 / 196 / 202 | 83 / 10 % → 97 / 17 % | 637 → 658 s | 93 → 88 % | 7.0 k → 8.0 k |
| bot 0.3 | 29 / 57 / 88 / 108 → 29 / 57 / 74 / 95 | 94 / 42 % → 100 / 44 % | 308 → 300 s | 100 → 100 % | 9.8 k → 10.1 k |
| bot 0.6 | 25 / 50 / 75 / 108 → 25 / 50 / 67 / 94 | 99 / 63 % → 100 / 62 % | 502 → 476 s | 100 → 100 % | 19.6 k → 19.0 k |
| bot 0.9 | 18 / 40 / 73 / 105 → 18 / 40 / 60 / 93 | 100 / 83 % → 100 / 88 % | 547 → 556 s | 100 → 97 % | 23.8 k → 24.0 k |
| random (bot 0, 60 seeds, 10 min) | moon 23 % → 40 %, loses within 10 min 87 % → 77 % | | 294 → 303 s | | |

Spam with the proposal: no invariant errors and no stuck boards. Mashing still dies on Normal (median about 3.5 min, 8–10 k points against 24 k for bot 0.9).

## What remains (not fixable by CONFIG alone)
- Easy L1 and L2 for the slowest kid are still 100 s and 154 s. Getting to 60–90 s would need a lower first goal for Easy (for example a firefly jar, tier 4, as the first goal). `CONFIG.goals` is shared by every difficulty, so that needs a code change: a `goals` override per difficulty.
- Throttle the refuse sound (see 1).
- Skill separation on Normal is still modest: random play reaches the moon 40 % of the time and the casual adult 51 %. The creep counts drops, so the main skill signal is survival in the castle loops.
