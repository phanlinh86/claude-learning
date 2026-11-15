# Shelly's Sky Catch: high-speed playtest report (2026-11-15)

Report only. I didn't edit anything in `game/`. Every "after" number comes from config overrides passed to
`new SC.World({ config })`, which is the same merge `main.js` does (`SC.DIFFICULTY[diff]`, then the overrides).

- **Harness:** `tests/sim/playtest.js`. It builds on `players.js` and adds bot skills 0.2 to 1, a `jitter` finger, pacing for every level, gold dropped and caught, zap causes, wind and snow drift, medals, and score per level.
- **Overrides:** `tests/sim/tune/proposed2.json` is the proposal. `proposed2_nojar.json` is the same without the Easy jar change.
- **Results:** `tests/sim/results/playtest_baseline.md`, `playtest_proposed2.md` (kids, casual, bot 0.3 and 1.0) and `playtest_proposed2_rest.md` (the other models), plus `playtest_kid4_jar.md` and `playtest_kid4_nojar.md`.
- **Re-run:**
  - Baseline: `node tests/sim/playtest.js --n 80 --cap 30 --tag baseline`
  - Proposal: add `--overrides tests/sim/tune/proposed2.json --tag after`
  - The baseline is 3,120 games in about 23 minutes on 2 cores.
- **Volume:** about 9,000 games in total, at 80 rounds per cell (160 for the kid4 Easy check), with a 30-minute game-time cap. That's 13 models × 3 difficulties for the baseline, plus the re-simulations.

## Player models
All models play through `setTarget`, `setMove` and `action` only.

| Model | What it is |
|---|---|
| bot0.2 … bot1.0 | `SC.Bot` at that skill. It sees everything and plans perfectly, so it's "superhuman but slow" at low skill. |
| kid4 | Reacts in 0.45–0.6 s and aims ±34 px. Only sees stars once they fall. Guesses 40 % of the drift. Stops steering for 1–3 s at random. Dodges 25 % of puffs and mistakes 5 % of puffs for stars. |
| kid6 | Reacts in 0.35–0.45 s, aims ±26 px, guesses 65 % of the drift, dodges 55 % of puffs. |
| casual | An adult. Reacts in 0.25–0.35 s, aims ±18 px, guesses 90 % of the drift, dodges 85 % of puffs, uses Jet Hop sensibly. |
| spamJet | The casual adult, but presses Jet Hop every time it's charged (an exploit attempt). |
| park, parkJet | Stands still in the middle; parkJet also hops whenever charged. |
| jitter | A finger wiggling ±90 px at about 3 Hz while drifting slowly across the floor. |
| mash | Taps a random spot every 0.4–1.2 s (the floor for a toddler). |

## What I found before the changes
1. **Endless play is far too long for good players.**
   - On Normal, the casual adult survives a median of **22.8 min**; only 7 % are still alive at 30 min.
   - bot1.0 Normal: **50 % alive at 30 min**, median ≥ 30 min, reaching level 36.
   - bot0.8 Normal: median 22.7 min, with 24 % alive at 30 min.
   - Easy is endless for any adult: casual 86 % alive at 30 min, bot0.8 87 %.
   - **Why:** a miss never costs a heart, so only thunder puffs kill. The puff threat hardly grows per loop.
     - In zaps per minute, the casual adult goes 0.06 (loop 1), 0.09, 0.09, 0.13, 0.20 (loop 5).
     - The rule that keeps puffs away from stars only starts shrinking on loop 3.
     - Puff chance rises only +3 % per loop.
2. **Kids' first loop is fine.** It must stay that way.
   - kid4 on Easy clears loop 1 in 100 % of runs and survives 14.0 min.
   - kid6 on Normal clears loop 1 in 100 % and survives 12.5 min.
   - kid4 on Normal clears loop 1 in 79 %. Easy is the mode meant for a 4-year-old.
3. **Pacing (target about 45–90 s per level).**
   - Normal and Hard sit at 42–86 s, which is fine.
   - **Easy is short.** Sunny takes 37 s for a good player and 40 s for kid4, and the first loop on Easy is 37/44/50/56 s.
   - Levels in later loops barely change length.
4. **Medals don't mean anything.**
   - Platinum (4000) goes to 100 % of games for every player model, kid4 on Easy included.
   - A non-playing jitter finger on Easy gets gold in 65 % of games.
   - The thresholds fit loop 1 only: sunny ≈ 700 points and loop 1 ≈ 3,700–4,900. Players then keep going for 10–25 more minutes at about 1,000 points per minute.
5. **Time to first point** is 3.2 s after "go" on Normal and 3.8 s on Easy, with kid4's 90th percentile at 6.5 s. 0 % of human runs went without a catch. A child who doesn't play at all gets the first star in about 15 s. Good.
6. **Gold:**
   - Frequency:
     - About 2.3 golds per level on Normal and about 1.9 on Easy (the guaranteed one plus 8 %).
     - That's 9–10 % of stars, or about 1 in 11 (the brief asks for about 1 in 12). Fine.
   - Caught:
     - Casual adult: 92 %.
     - Bots: 88–97 %.
     - kid6: 85 % on Normal.
     - kid4: 84 % on Easy and 70 % on Normal.
     - Non-players: 10–17 %.
   - Gold feels rare and catchable. No change.
7. **Do the weathers feel different in the numbers?**
   - **Wind: clearly yes.** Stars travel 57–84 px sideways in wind, against 3–10 px in any other weather. Kids' catch rate drops in wind: kid4 on Normal goes from 0.87 (sunny) to 0.70.
   - **Snow: yes, through control rather than drift.**
     - Snow has the lowest catch rate for bots and kids: kid4 on Normal 0.70, bot0.2 0.90, against 0.98 for bot0.2 in sunny.
     - "Snow slide" causes 16–28 % of the zaps for casual players and bots.
   - **Rain: weakly.** Catch rates are the same as sunny (within 0.01–0.05). Rain only shows up as 1.5–2× more zaps per minute (its puff chance is 16 %). A cosmetic or feel issue, not a balance bug.
8. **Exploits: none harmful.**
   - **Spamming Jet Hop backfires.**
     - On Normal it survives 16.6 min against 22.8 min for the casual adult, with the same catch rate.
     - 43–51 % of its zaps happen in mid-air.
   - **park, parkJet, jitter and mash** catch 10–16 % of stars.
     - On Normal they die in 4–9 min, mostly still on sunny.
     - On Easy, a child who does nothing still clears sunny after about 4 min, and survives about 16 min.
     - That's gentle on purpose and fine for little kids.
9. **Zap causes (baseline):**

   | Player | Main causes of zaps |
   |---|---|
   | kid4 | Didn't dodge (47–54 %), mistook a puff for a star (24–33 %), distracted (14–19 %) |
   | casual | Didn't dodge (45 %), then a slide on snow, a late dodge, a wind push |
   | bots | Didn't see the puff (low skill), or a late dodge, wind push or snow slide |

   - "Star right next to a puff" causes ≤ 16 %, so the fairness rules work. Zaps never come from a trap.

## Proposed changes (exact)

**All difficulties** (`CONFIG`). Every key only changes loops 2 and up, so loop 1 is untouched.

| Key | Old → new | Why |
|---|---|---|
| `lapPuff` | 0.03 → **0.12** | The main lever. Puff chance per loop on Normal (sunny/rain/wind/snow): loop 2 0.20/0.28/0.26/0.30, loop 3 0.32–0.42, then the cap. |
| `puffCap` | 0.32 → **0.48** | Lets the later loops actually get puffier. The cap is reached on loop 4. |
| `puffKeepLap` | 25 → **35** | From loop 3, puffs come closer to stars (110, then 75, then 40 px), so a player must choose between them. The 40 px minimum stays. |
| `lapFall` | 0.08 → **0.12** | Later loops fall faster, puffs too, so there's less time to dodge. |
| `fallCap` | 1.4 → **1.7** | Lets that keep rising up to loop 6. Puffs then fall at about 170 px/s, stars at 280. |
| `lapGap` | 0.06 → **0.08** | Busier skies later. Levels don't get shorter, because puffs take drop slots (see pacing below). |
| `gapMin` | 0.9 → **0.8** | Floor for the line above. |

**Easy** (`DIFFICULTY.easy`). Keeps Easy gentle for 3–5-year-olds and fixes the short levels.

| Key | Old → new | Why |
|---|---|---|
| `lapPuff` (new key in easy) | (0.03 from CONFIG) → **0.06** | Easy gets half of the Normal ramp. |
| `puffCap` | 0.22 → **0.30** | Same idea. |
| `jarTargets` | [12, 15, 18, 21] → **[14, 17, 20, 23]** | Sunny goes from 37–40 s to 43–47 s, closer to the 45–90 s target. This one is optional: see the kid4 check below. |

**Normal** (`DIFFICULTY.normal`)

| Key | Old → new | Why |
|---|---|---|
| `jarTargets` (new key in normal) | [18, 22, 26, 30] → **[20, 22, 26, 30]** | Sunny goes from 42 s to 47 s, so level 1 doesn't feel rushed. |

**Hard** (`DIFFICULTY.hard`)

| Key | Old → new | Why |
|---|---|---|
| `puffAim` (new key in hard) | 0.4 → **0.6** | More puffs fall near Shelly. I didn't use this on Normal: it changes loop 1 and dropped kid6's Normal loop-1 rate from 100 % to 96 % in a trial. |
| `puffCap` (new key in hard) | 0.32 → **0.52** | Hard's base puff chances are higher, so it needs a higher cap. |

**Medals** (`UI.MEDALS` in `game/js/ui.js`)

| Medal | Old → new | Meaning |
|---|---|---|
| bronze | 300 → **700** | About sunny cleared, for anyone: sunny ≈ 630–790 points. |
| silver | 1000 → **3000** | About the whole first weather loop for a child: kid4 Easy ≈ 3,670 at level 4, kid6 Normal ≈ 3,150. |
| gold | 2200 → **8000** | About two loops: casual Normal ≈ 8,260 at level 8. |
| platinum | 4000 → **18000** | A long run. That's the top ~20 % of casual adults on Normal, or a median bot1.0. |

Also update the comment in `ui.js`. The "Score N for a medal" text follows `MEDALS[0]` automatically.

## Before and after
Numbers below are the median, or p10 / median / p90, over 80 runs per cell with a 30-minute cap.

### Survival in minutes
Each cell is the median, then the share still alive at 30 min in brackets. "Loop 1 cleared" is the share of runs that clear the first four levels.

| Model | Diff | Before | After | Loop 1 cleared (before → after) |
|---|---|---|---|---|
| **casual** | **normal** | **22.8** (7 % alive) | **15.2** (0 %); p25 12.8, p10 10.3 | 100 → 100 % |
| casual | hard | 18.3 (6 %) | 14.0 (0 %) | 100 → 100 % |
| casual | easy | ≥ 30 (86 %) | 27.4 (41 %) | 100 → 100 % |
| bot1.0 | normal | ≥ 30 (50 %) | 17.9 (5 %) | 100 → 100 % |
| bot0.8 | normal | 22.7 (24 %) | 15.3 (1 %) | 100 → 100 % |
| bot0.5 | normal | 19.9 (5 %) | 15.0 (0 %) | 100 → 100 % |
| bot0.3 | normal | 18.2 (1 %) | 13.3 (0 %) | 100 → 100 % |
| bot0.2 | normal | 17.9 | 11.7 | 100 → 100 % |
| bot1.0 | hard | 24.0 (31 %) | 13.5 (1 %) | 100 → 100 % |
| **kid4** | **easy** | **14.0** | **12.4** | **100 → 99 %** (no jar change: 100 %, 11.6 min, 160 runs) |
| **kid6** | **normal** | **12.5** | **8.7** | **100 → 100 %** |
| kid6 | easy | 17.6 | 15.9 | 100 → 100 % |
| kid4 | normal | 7.7 | 6.6 | 79 → 76 % |
| spamJet | normal | 16.6 | 11.4 | 100 → 100 % |
| park, jitter, mash | normal | 7.2 / 8.7 / 9.1 | 7.5 / 10.2 / 9.0 | 0 → 0 % |

The casual adult on Normal now ends in the 8–15 min band: median 15.2 min, interquartile range 12.8–18.4 min. Before, it ran 18–26 min.

### Zaps per run, by loop, on Normal

| Loop | casual (before → after) | bot1.0 (before → after) |
|---|---|---|
| 1 | 0.21 → 0.13 (noise) | 0.11 → 0.11 |
| 2 | 0.33 → 0.61 | 0.26 → 0.41 |
| 3 | 0.33 → 0.90 | 0.23 → 0.63 |
| 4 | 0.44 → 1.00 | 0.31 → 0.75 |

Loop 1 is unchanged. Endless loops now ramp up properly.

### Pacing in s per level (target 45–90 s)
Levels 1–4 are loop 1; levels 9–12 are loop 3.

| Model | Diff | Before L1–L4 | After L1–L4 | Before L9–L12 | After L9–L12 |
|---|---|---|---|---|---|
| casual | normal | 42 / 53 / 58 / 67 | 47 / 53 / 59 / 66 | 43 / 50 / 56 / 64 | 54 / 58 / 65 / 73 |
| kid4 | easy | 40 / 49 / 57 / 63 | 47 / 55 / 63 / 67 | 38 / 47 / 55 / 60 | 48 / 55 / 62 / 67 |
| bot1.0 | easy | 37 / 44 / 50 / 56 | 43 / 50 / 55 / 62 | 36 / 42 / 49 / 53 | 42 / 49 / 53 / 60 |
| kid6 | normal | 43 / 54 / 63 / 77 | 48 / 55 / 64 / 77 | 43 / 49 / 61 / 72 | 58 / 59 / 69 / 78 |

Everything for a human player is now inside 43–90 s. kid4 on Normal and Hard goes up to 101 s on snow, but only at difficulties that are too hard for that age anyway.

### Score and medals
The medal shares are none / bronze / silver / gold / platinum.

| Model | Diff | Score p10/med/p90 (after) | Medals at the current thresholds (before) | Medals at the proposed thresholds (after) |
|---|---|---|---|---|
| kid4 | easy | 8,010 / 10,460 / 12,720 | 0/0/0/0/**100 %** | 0/1/8/**91**/0 % |
| kid4 | normal | 1,270 / 3,260 / 4,260 | 0/11/8/31/50 % | 0/43/58/0/0 % |
| kid6 | normal | 4,210 / 5,960 / 7,930 | 0/0/0/1/99 % | 0/0/**93**/8/0 % |
| kid6 | easy | 12,490 / 17,070 / 21,940 | 100 % platinum | 0/0/0/63/38 % |
| casual | normal | 9,420 / 14,680 / 20,370 | 100 % platinum | 0/0/3/**79**/19 % |
| casual | hard | 6,490 / 10,290 / 14,400 | 98 % platinum | 0/0/20/79/1 % |
| bot1.0 | normal | 13,440 / 21,510 / 38,150 | 100 % platinum | 0/0/1/28/**71** % |
| jitter | easy | 1,350 / 2,200 / 3,100 | 65 % gold | 0/**85**/15/0/0 % |
| park | normal | 110 / 400 / 660 | 63 % bronze | **94 % none** |

### Other after numbers (Normal unless noted)
- **Gold:**
  - About 2.3 per level, 9–10 % of stars.
  - Caught: casual 93 %, kid6 87 %, kid4 Easy 86 %.
  - Unchanged, as intended.
- **Zap causes, casual adult:** didn't dodge 54 %, snow slide 28 %, late dodge 7 %, wind 5 %, star right next to a puff 4 %. Forced zaps stay rare, so it's still fair.
- **Drift:** wind 66–72 px against 4–10 px elsewhere. Unchanged.
- **Time to first point:** unchanged, 2.9–3.8 s.

## Changes I tried and dropped (30-min cap, 40 runs each, casual adult on Normal)
- **A smaller ramp** (+0.06 per loop, cap 0.40, plus fall and gap ramps): casual 18.2 min. Not enough.
- **+0.08 per loop with a bigger fall ramp:** casual 15.3–15.7 min.
- **`puffAim` 0.6 on Normal:** casual 14.0 min, but kid6's loop 1 on Normal fell from 100 % to 96 %. Rejected for Normal; kept for Hard.
- **+0.14 per loop, cap 0.50, gap −12 % per loop:** casual 15.0 min. No better than the proposal with half the sky full of puffs. Rejected.

Survival saturates near 14–15 min for the casual adult. Loops 1 and 2 take about 8 min together, loop 1 is protected, and a miss never costs a heart. Getting the median down to 10–12 min would need a rule change rather than a CONFIG value. Two options:
- Let puff aiming grow per loop. Today `puffAim` is the same on every loop.
- Cost a heart after N misses in a row, from loop 2 on.

I'd keep the CONFIG-only proposal: it sits at the top of the 8–15 min target.

## Caveats
- The human models are scripted guesses, not recordings. Dodge chance and lapses drive deaths the most. A real adult who never fails to see a puff behaves more like bot1.0 (17.9 min after the changes).
- Everything ran on the default 960-wide play range. On a narrow iPhone portrait screen, `setPlayRange` shrinks the floor, so the game gets easier to reach but more crowded. I didn't simulate that.
- The Short/Long level-length setting scales the jar target in `main.js` and wasn't simulated (Normal length only).
