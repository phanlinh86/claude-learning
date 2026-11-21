# Bristle's Moon Pop: high-speed playtest report

Report only: nothing in `game/` was changed. All numbers come from headless runs of `MP.World` + `MP.Bot` (+ `MP.Weather` in the human set),
with fixed seeds, so every comparison is paired (same seeds, same models).

**About 7,460 rounds in total**:
- the bot grid: 3 skills × 3 difficulties × 3 `lengthK` values × 40 rounds, 10-minute cap
- 11 human-like and exploit models × 3 difficulties × 60 rounds, 15-minute cap
- endless runs of 40 minutes
- six re-simulation sets for the proposed changes

How to reproduce (run from the project folder):

```
node tests/sim/deep.js --set humans  --n 60 --cap 15 --weather 1      # human-like + exploit models
node tests/sim/deep.js --set grid    --n 40 --cap 10                  # bot 0.5/0.8/1.0 × diff × lengthK 0.7/1/1.4
node tests/sim/deep.js --set endless --n 16 --cap 40                  # lap scaling
node tests/sim/deep.js --set jump    --n 60 --cap 15 --probe 0        # casual vs casual-that-never-jumps
node tests/sim/deep.js --set kids    --n 40 --cap 15 --probe 0 --overrides tests/sim/overrides/proposed.json --tag kids_proposed
node tests/sim/deepreport.js humans          # tables;   node tests/sim/deepcmp.js kids_base kids_proposed   # before → after
```

Raw summaries are in `tests/sim/results/deep_*.json`. The override files are in `tests/sim/overrides/`.

## Player models

| Model | What it does |
|---|---|
| `bot0.5` / `bot0.8` / `bot1.0` | `MP.Bot` (plans ground and jump pops, chains, dodges pebbles); lower skill adds delay, aim noise and missed pebbles |
| `kid4w` | Easy-target 4-year-old: reacts in 0.6–0.8 s, ±34 px aim, skates only, dodges 30 % of pebbles, and 6 %/s lapses of 1–3 s, during 60 % of which the finger **wanders** to a random spot |
| `kid4` | Same as kid4w but slightly quicker, and it lets go during a lapse instead of wandering |
| `kid6` | Reacts in 0.5 s, ±20 px aim, **skates only**, dodges 60 % of pebbles |
| `kid6j` | kid6 plus **occasional jumps** (about 25 % of the out-of-reach bubbles) |
| `casual` | Adult: reacts in 0.25–0.35 s, ±14 px aim, jumps for 70 % of the out-of-reach bubbles, dodges 85 % of pebbles |
| `casualNJ` | casual, but it never jumps (to answer "is jumping worth it?") |
| `spamJump` | casual tracking + presses Jump every frame |
| `standMid` | Never moves from x = 480 and never dodges |
| `campVent` | Parks on the vent nearest the middle, steps away from pebble shadows, then goes back |
| `hugEdge` | Parks at the left edge (dodges like campVent) |
| `campSpam` | campVent + mashes Jump |

**Pebble-fairness oracle**: for every bonk, the world was deep-cloned at *(pebble warning + 0.45 s)* and again at *(+ 0.8 s)*.
From each copy, 30 pure-skating escapes were tried (29 targets across the floor, plus letting go). If none of them avoids that pebble,
the bonk counts as **unavoidable** for that reaction time. Cloning is exact: the clone and the original stay bit-identical over 20 s.

## Headline findings

1. **Pebbles are fair.** The oracle checked **10,184 bonks** and found **0 unavoidable** ones at either 0.45 s or 0.8 s reaction,
   across every model, difficulty, length and lap (up to lap 11). Kids who skate only never get bonked in the air (0 %).
   Bonks per minute on Normal: kid4w 0.93, kid4 0.86, kid6 0.80, casual 0.74, spamJump 0.85, bot0.8 0.36, bot1.0 0.03.
2. **No exploit dominates.** spamJump scores like casual (Normal median 5170 vs 5350; score/min 867 vs 820, +6 %).
   It dies a little sooner (it has 0.85 bonks/min, and 94 % of its bonks happen in the air).
   Camping and standing still are safe but very slow. campVent never dies on Normal, but it gets only 183 points/min (casual: 820), and each level takes about 3 minutes.
   standMid and hugEdge almost never progress (pop rate 4–9 %).
3. **Jumping is worth it, but the sky tier does not exist in practice.** A casual player who jumps earns **+27 % per minute** on Normal
   (820 vs 647) and +14 % for the median game, with the same survival. Only 15 % of its pops happen in the air.
   Most of the gain comes from rescuing bubbles that already left the ground window: it has 2.0 escapes/min against 3.5, and keeps longer streaks.
   But **tier-3 (sky) pops are 0–1 % of all pops** for every model: 0.10/min for casual and 0.12/min for bot1.0. A HUD tier that a player sees once every 8–10 minutes
   is dead weight → proposal A.
4. **Night is the longest and deadliest level for kids, and it goes over the target at `lengthK` 1.4.**
   On Normal, the median length of the night level is 61 s (casual) and 66 s (bot0.8). Those are in range. For kid6 it is 78 s (p90 92), and for kid4 108 s.
   Sunset and night cause 60–75 % of all Normal deaths. At `lengthK` 1.4, night is 90 s (bot0.8 Normal) and 96–101 s (Hard).
   The 32-cupcake box is the cause: at night the spawn rate (1.5 s) is the fastest, but the box is also the biggest, so the time spent under the densest pebbles (one every 5.5 s) is the longest → proposal B.
5. **The heal per clear is not too generous. The game depends on it.** With `healOnClear` 0, kid6 survival on Normal drops from 6.4 to 3.7 min,
   and its chance of reaching night drops from 78 % to 53 %. Easy deaths within 15 min go from 38 % to 83 % (kid4) and from 38 % to 85 % (kid6).
   At the clear, the hearts are already full in more than half of the clears (p50 3/3 on Normal), so the heal only matters when it is needed. **Keep it.**
6. **The magnet helps kids and lowers scores for experts.** Kids pop up to 80 % more per minute while the magnet is on (kid4w Normal: 27.3 vs 15.3), and they lose a third as many
   bubbles (kid4w Easy: 23.9 vs 17.8 pops/min; 3.1 vs 9.1 escapes/min). That is a great catch-up mechanic.
   For skilled players, the pop rate rises a little (+8–14 %), but **points per minute fall by 20–35 %** (bot1.0 Normal: 990 vs 1224).
   The magnet pulls bubbles down to a grounded Bristle, so they become ×1 ground pops.
   This cannot be fixed in CONFIG (the 0.6 "sink" factor is hard-coded in `world.js` `_stepItems`). See the code note at the end.
7. **The endless loop flattens out.** Lap 0 → 11 on Normal (bot1.0): s/level 60 → 36, pop rate 88 % → 79 %, bonks/min flat at 0.02–0.24.
   Rise (+25 %) and pebbles (+40 %) hit their caps at lap 4. After that only `spawnGap` keeps shrinking, until it reaches `gapMin` at lap 7–10.
   On Easy, bot1.0 never dies in 40 minutes, and its levels shrink to 26 s. This is fine for a kids' game, where nobody reaches lap 4 (kid6 Easy: 97 % reach lap 3).
   It is not a tuning target.

## 1. Survival and score (p10 / p50 / p90; 15-min cap for the human set, 10-min cap for the grid)

| Model | Diff | Survival min | Died | Score | Score/min | First pop s |
|---|---|---|---|---|---|---|
| kid4w | easy | 12.4 / 15.0 / 15.0 | 40 % | 6430 / 8380 / 9840 | 590 | 1.6 / 2.3 / 5.0 |
| kid4 | easy | 12.2 / 15.0 / 15.0 | 38 % | 8250 / 10060 / 11140 | 687 | 1.6 / 2.0 / 4.7 |
| kid4 | normal | 2.8 / 4.6 / 8.6 | 100 % | 900 / 1610 / 3120 | 332 | 1.3 / 2.0 / 5.3 |
| kid6 | easy | 13.1 / 15.0 / 15.0 | 37 % | 11090 / 13430 / 14530 | 905 | 1.6 / 1.8 / 2.3 |
| kid6 | normal | 2.7 / 6.3 / 9.2 | 100 % | 1270 / 2870 / 4550 | 462 | 1.3 / 1.8 / 2.3 |
| kid6j | normal | 2.9 / 5.9 / 9.2 | 100 % | 1490 / 3140 / 4590 | 528 | 1.3 / 1.8 / 2.3 |
| casual | normal | 2.8 / 6.5 / 9.3 | 100 % | 2010 / 5350 / 7460 | 820 | 1.3 / 1.4 / 1.9 |
| casual | hard | 1.6 / 2.7 / 4.0 | 100 % | 950 / 2030 / 3610 | 760 | 1.3 / 1.4 / 1.9 |
| bot0.5 | normal | 2.7 / 5.2 / 8.1 | 100 % | 2170 / 3990 / 7190 | 833 | 1.3 / 1.3 / 3.1 |
| bot0.8 | normal | 6.9 / 10.0 / 10.0 | 43 % | 6160 / 9330 / 10510 | 953 | 3.1 / 3.1 / 3.4 |
| bot1.0 | normal | 10 / 10 / 10 | 0 % | 9520 / 10340 / 11310 | 1038 | 3.1 / 3.1 / 3.3 |
| bot0.8 | hard | 3.0 / 4.9 / 9.8 | 93 % | 2600 / 4650 / 8940 | 951 | 3.3 / 4.7 / 5.2 |
| bot1.0 | hard | 10 / 10 / 10 | 3 % | 9400 / 10410 / 11650 | 1049 | 3.0 / 3.0 / 4.7 |

- **Time to first pop** is 1.3–2.3 s (p50) for everyone who skates toward the first puff. It is about 3 s for bots, which wait for a ×2 pop, and up to 5 s at p90 for a wandering 4-year-old.
- Easy is a "play until you're done" mode: 4- and 6-year-olds survive the full 15 minutes in 60 % of games. On Normal, kid6 reaches level 5 (median) and clears dawn 100 % of the time.

## 2. Level pacing, loop 1 (median s per level; target about 45–90 s on Normal)

| Model / setting | Dawn | Noon | Sunset | Night |
|---|---|---|---|---|
| bot0.8 Normal, lengthK 0.7 | 36 | 42 | 45 | 46 |
| bot0.8 Normal, lengthK 1 | 52 | 55 | 61 | 66 |
| bot0.8 Normal, lengthK 1.4 | 70 | 79 | 84 | **90** |
| bot1.0 Hard, lengthK 1.4 | 78 | 86 | 93 | **101** |
| casual Normal | 51 | 53 | 56 | 63 |
| kid6 Normal (p90) | 55 (71) | 61 (72) | 72 (87) | **78 (92)** |
| kid4 Normal | 64 | 78 | 95 | **108** |
| kid4w Easy | 53 | 59 | 71 | 78 |

`lengthK` scales the box size as expected (0.7 gives about 0.7× the time, 1.4 about 1.4×). Short mode on Normal is a little under the 45 s target (36–46 s). That is acceptable for a "short" setting.

## 3. How players pop (Normal)

| Model | Ground / air | Tier 1 / 2 / 3 | Air share of points | Sky/min | Jumps/min | Pops per jump: 0 / 1 / 2 / 3 / 4+ | Best chain p50 / p90 |
|---|---|---|---|---|---|---|---|
| kid6j | 90 / 10 % | 93 / 7 / 0 % | 16 % | 0.06 | 1.7 | 5 / 63 / 25 / 6 / 2 % | 3 / 4 |
| casual | 85 / 15 % | 91 / 9 / 0 % | 23 % | 0.10 | 2.7 | 5 / 52 / 27 / 11 / 4 % | 3 / 5 |
| spamJump | 7 / 93 % | 93 / 7 / 0 % | 95 % | 0.03 | 23.9 | 28 / 39 / 26 / 5 / 1 % | 4 / 5 |
| bot0.5 | 46 / 54 % | 76 / 24 / 0 % | 65 % | 0.03 | 8.6 | 0 / 46 / 38 / 10 / 5 % | 4 / 5 |
| bot0.8 | 33 / 67 % | 66 / 33 / 0 % | 80 % | 0.08 | 9.6 | 0 / 37 / 41 / 13 / 8 % | 5 / 6 |
| bot1.0 | 31 / 69 % | 61 / 39 / 0 % | 83 % | 0.12 | 9.3 | 0 / 34 / 40 / 16 / 10 % | 5 / 7 |

Chains are healthy: a skilled jump pops 2 or more bubbles 60–66 % of the time, and a 5–7 chain happens in most good games.
Spam jumping wastes 28 % of its jumps (no pop at all), which is why it does not pull ahead.

**Is jumping worth it versus skating?** Yes (paired seeds, Normal):

| | casual (jumps) | casualNJ (never jumps) | kid6j | kid6 |
|---|---|---|---|---|
| Score/min | **820** | 647 | **528** | 462 |
| Median score | 5350 | 4100 | 3140 | 2870 |
| Escapes/min | 2.0 | 3.5 | 6.0 | 7.2 |
| Survival p50 min | 6.5 | 6.5 | 5.9 | 6.3 |
| Bonks/min | 0.74 | 0.77 | 0.81 | 0.80 |

Jumping costs almost nothing in safety (14 % of casual's bonks happen in the air) and is clearly rewarded. A skate-only kid is never locked out of progress.

## 4. Magnet

| Model (Normal unless noted) | Magnets caught | Time under magnet | Pops/min on vs off | Escapes/min on vs off | Points/min on vs off |
|---|---|---|---|---|---|
| kid4w (Easy) | 62 % | 20 % | 23.9 vs 17.8 | 3.1 vs 9.1 | – |
| kid6 | 69 % | 18 % | 28.9 vs 23.9 | 3.0 vs 8.7 | – |
| casual | 91 % | 24 % | 30.4 vs 31.8 | 1.1 vs 2.5 | – |
| bot0.8 (endless) | 99 % | 26 % | 34.4 vs 30.0 | 2.8 vs 4.1 | **640 vs 877** |
| bot1.0 (endless) | 96 % | 25 % | 40.7 vs 36.0 | 5.6 vs 9.1 | **990 vs 1224** |

The magnet saves streaks and is a strong safety net for kids. For experts it is a low-value phase: it pulls bubbles to the floor, so they score ×1.

## 5. Pebble fairness and danger

| Set | Bonks checked by the oracle | Unavoidable at 0.45 s | Unavoidable at 0.8 s |
|---|---|---|---|
| Human + exploit models (all difficulties) | 6,149 | 0 | 0 |
| Bot grid (27 cells) | 2,631 | 0 | 0 |
| Endless, 40 min (laps 0–11) | 403 | 0 | 0 |
| Proposed config, bot grid Normal | 1,001 | 0 | 0 |

- **Deaths by zone, Normal (dawn / noon / sunset / night)**: kid6 2 / 14 / 19 / 25, kid4 1 / 9 / 27 / 23, casual 5 / 6 / 26 / 23. The danger ramp works as designed.
- Easy side effect, worth knowing: with `pebbleNearOK false`, **a Bristle who stands still can never be bonked on Easy**
  (standMid, campVent and hugEdge all had 0 bonks in 60 × 15 minutes). Pebbles only hurt a kid who skates into one. That is good for 4-year-olds, but the pebbles are only decoration for a child who stands still.
- hugEdge pops almost nothing (vents sit at least 40 px inside the range). A child who parks at the edge sees nothing happen for minutes.
  A gentle "come back" hint after about 5 s idle at the edge would help (UI, not CONFIG).
- Weather: the most live particles seen with a 10-droplet burst per pop was 64 (the cap is 176).

## 6. Endless loop (bot1.0, 16 × 40 min)

| Lap | Normal: reach / s per level / bonks/min / pop rate | Hard: reach / s per level / pop rate |
|---|---|---|
| 0 | 100 % / 60 s / 0.02 / 88 % | 100 % / 66 s / 84 % |
| 2 | 100 % / 55 s / 0.04 / 84 % | 100 % / 62 s / 78 % |
| 4 | 93 % / 50 s / 0.02 / 80 % | 87 % / 56 s / 76 % |
| 6 | 87 % / 44 s / 0.08 / 79 % | 50 % / 49 s / 73 % |
| 8 | 75 % / 38 s / 0.03 / 78 % | 43 % / 43 s / 78 % |
| 10 | 68 % / 36 s / 0.05 / 77 % | 25 % / 45 s / 76 % |

The loop gets faster, but it is not much harder after lap 4. Only expert play gets there, so no change is proposed.

## 7. Critic's notes (fun and variety)

- **Good**: the first pop comes in under 2 s, a skate-only 6-year-old clears dawn 100 % of the time, there are no unfair bonks, and jumping is rewarded but not required.
  Chains of 2–3 happen naturally for anyone who jumps. Escapes never cost hearts, so a struggling child always progresses.
- **Weak**: the sky tier is invisible in play. Night drags for kids and at long length. The magnet, the advertised twist, is a points penalty for skilled players.
  Every level plays the same apart from density (there is no zone-specific rule). That is fine for 3–6-year-olds, but adults may tire after 3–4 levels.
- **Heal per clear**: keep it as it is. Without it, Normal becomes a 3–4-minute game for kids.

## Proposed CONFIG changes (re-simulated)

### A. `tierY`: `[360, 220]` → `[360, 240]` (all difficulties)
The sky band starts 20 px lower, so a well-timed apex pop (apex y 246 plus 58 px reach) reaches it reliably. Chains reach it more often.

| Paired seeds | Before → after |
|---|---|
| Sky pops/min: bot1.0 Normal | 0.12 → **0.69** |
| Sky pops/min: bot0.8 Normal | 0.09 → **0.50** |
| Sky pops/min: casual Normal | 0.10 → **0.18** |
| Score/min: bot0.8 Normal / bot1.0 Normal / casual | 953 → 1089 / 1038 → 1170 / 800 → 829 |
| Kids (kid4, kid4w, kid6) | unchanged (they only skate) |
| spamJump vs casual median score, Normal (playtest.js check, ≤ +15 %) | +11 % → still PASS |

Follow-ups for the team: `tests/unit/run.js:221` hard-codes the tier boundaries at 220/221, so it must change to 240/241. Update MECHANICS.md §4 and DESIGN §5.1 too.

### B. `boxTargets` (Normal / CONFIG): `[20, 24, 28, 32]` → `[20, 24, 26, 28]`
Sunset and night get shorter. Every level now lasts about 55 s, so the climax no longer drags.

| Paired seeds (median s per level, dawn / noon / sunset / night) | Before → after |
|---|---|
| bot0.8 Normal, lengthK 1 | 52/55/61/66 → **52/55/56/54** |
| bot0.8 Normal, lengthK 1.4 | 70/79/84/90 → **71/77/74/75** |
| bot1.0 Normal, lengthK 1.4 | 71/78/84/91 → **72/77/75/76** |
| casual Normal | 51/52/57/63 → 51/52/53/54 |
| kid6 Normal | 54/61/71/78 → 54/61/67/73 |
| kid4 Normal | 64/78/95/108 → 64/78/88/88 |
| kid6 Normal: survival p50 / median score / reach night | 6.4 → 6.9 min / 2870 → 3330 / 78 → 83 % |
| bot0.5 Normal, lengthK 1.4: reach night | 63 → 68 % |
| playtest.js "bot0.8 Normal 45–90 s" check | 52/55/61/66 → 53/55/56/54, still PASS |

Easy and Hard are left as they are. Hard at lengthK 1.4 still runs about 100 s at night. If that matters, the same trim on Hard would be `[26, 30, 34, 38]` → `[26, 30, 31, 32]` (not simulated).

**Combined A + B** (`tests/sim/overrides/proposed.json`): all eight `playtest.js` verdict checks still pass (`tests/sim/results/playtest_proposed.md`):
kid6 clears dawn on Normal 100 %, kid4 clears dawn on Easy 100 %, bot0.8 Normal levels 53/55/56/54 s, bot1.0 clears loop 1 100 %, first pop 1.7 s, spamJump no exploit on all three difficulties.
The oracle found 0 unavoidable bonks out of 1,001 checked.

### Not changed, on purpose
- `healOnClear` 1 / `healLaps` 1 (Easy 2): it is load-bearing (see finding 5).
- `landLag` 0.1: spam-jumping is already no better than playing normally.
- Pebble schedule: 0 unavoidable bonks, and the deaths ramp from sunset to night as designed.

### Code note (not CONFIG, not simulated)
To make the magnet worth something for skilled players, move the hard-coded `0.6 * buoy` sink in `world.js` `_stepItems` into a CONFIG key
(for example `magnetSink: 0.6`), and/or score a magnet-pulled pop at tier ≥ 2 while Bristle is in the air.
Then a jump under the magnet becomes the expert move ("vacuum the sky"), while kids keep the easy ground catches.
