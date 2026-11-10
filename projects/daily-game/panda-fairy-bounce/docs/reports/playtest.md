# Mochi's Fairy Bounce — high-speed playtest report

Date 2026-11-10 · headless sim (`tests/unit/load.js` → `MFB.World`, `MFB.Bot`) · no game files changed.

**Runs:** 13 player models × 3 difficulties × 100 seeds = 3,900 games per configuration, each up to 900 s of game time (≈ 75–330 s of wall time per configuration). Five configurations were run, so about 19,500 games in total.

```
node tests/sim/playtest.js --n 100 --cap 900 --patch none            --out tests/sim/out/baseline.json
node tests/sim/playtest.js --n 100 --cap 900 --patch proposed+stall  --out tests/sim/out/proposed_stall.json
node tests/sim/compare.js tests/sim/out/baseline.json tests/sim/out/proposed_stall.json
node tests/sim/trace.js bot1.0 hard 58529          # the 175 s stall, explained
node tests/sim/explore.js                          # the Easy tuning sweep
node tests/sim/unit_with_patch.js proposed+stall   # which unit tests a proposal changes
```

## Player models (`tests/sim/players.js`)

| model | what it does |
|---|---|
| `bot0.2 … bot1.0` | the shipped `MFB.Bot` at skill 0.2 / 0.3 / 0.5 / 0.8 / 1.0 |
| `kid5` | a 5-year-old. Sees the ball 0.5 s late (σ 0.12 s) and moves to where the ball is now, without predicting where it will land. Overshoots by 35 % of each jump, with ±0.45 u hand noise, and moves the finger every 0.12–0.3 s. Looks away about every 20 s for 1–2.5 s. Taps serve after 0.8–2.5 s, or waits for the auto-serve in 30 % of cases. Chases 40 % of the stars |
| `kid5fast` | a quick 5-year-old: 0.35 s late, 25 % overshoot, ±0.35 u noise |
| `kid4` | a slower or younger child: 0.65 s late, 45 % overshoot, ±0.6 u noise |
| `adult` | a casual adult: 0.22 s late. Predicts the landing point once the ball falls below y 6 (σ 0.3 u). Grabs low stars and never aims |
| `park8`, `park5` | exploit: the finger stays parked at x 8 or x 5 and serves at once |
| `wiggle` | exploit: the finger moves 8 ± 2.5 u back and forth at 0.7 Hz |
| `idle` | never touches the screen; only the auto-serve plays |

## 1. Baseline findings (current CONFIG)

| model (Easy) | survival p10/p50 | seasons p10/p50/p90 | clears spring | score p10/p50/p90 | stars caught | pillow bonk | time at 5 ♥ |
|---|---:|---:|---:|---:|---:|---:|---:|
| bot0.2 | 472 / 900 s | 7/11/13 | 99 % | 6560/11845/13345 | 56 % | 28 % | 50 % |
| bot0.5 | 900 / 900 | 14/15/16 | 100 % | 14130/14960/15850 | 60 % | 31 % | 84 % |
| bot1.0 | 900 / 900 | 15/16/17 | 100 % | 14650/15230/16090 | 62 % | 32 % | 89 % |
| adult | 900 / 900 | 8/9/10 | 100 % | 10080/11290/12350 | 79 % | 30 % | 88 % |
| **kid5** | **20 / 30 s** | **0/0/0** | **0 %** | 195/345/645 | 77 % | 20 % | 0 % |
| kid5fast | 23 / 33 | 0/0/0 | 2 % | 235/390/745 | – | – | 0 % |
| kid4 | 19 / 25 | 0/0/0 | 0 % | 180/260/450 | 73 % | 13 % | 0 % |
| park8 / park5 / wiggle / idle | 10–19 / 12–22 s | 0 | 0–1 % | < 400 | 23–72 % | 100 % (parked, idle) | 0 % |

1. **The first season on Easy is not winnable by a 5-year-old.** `kid5` cleared spring in 0 of 100 games. It breaks about 15 of the 34 blocks and is out in about 30 s, losing about 6 hearts a minute; the 2 vine saves are used up in the first 10 s. `kid5fast` cleared spring in 2 of 100 games and `kid4` in 0. The unit-test proxy ("a skill-0.3 bot clears Easy spring") is misleading. Even the skill-0.2 bot predicts where the ball will land, with wall folding, and re-plans every 0.36 s. On Easy it survives the full 15 minutes in 52 % of games, which makes it a strong adult rather than a child.
2. **Hearts pile up for any competent player.** On Easy, bots at skill 0.5 or higher and the adult sit at 5 hearts for 84–89 % of the time. They lose 0.0–0.1 hearts a minute and are 100 % alive at 900 s. On Normal, the bot at skill 0.8 or higher and the adult are 82–100 % alive at 900 s. Since the speed ramp stops at round 4, the game never ends for them. I'm leaving this unchanged on purpose: endless play is fine for kids. If a run should have an ending, the lever is `STARS_PER_HEART` 10 → 15. I did not simulate this as part of the proposal.
3. **Long stalls with no block hit.**
   - Median longest gap: 13–19 s on Easy for the bots and the adult; 19 s for the adult.
   - Worst cases: **175 s** (bot1.0, hard, seed 58529), 58 s (bot1.0, normal) and 35 s (bot0.2, easy).
   - `trace.js` shows a **periodic orbit**. The last block is a corner block at (14.66, 4.20), right next to the wall. The paddle keeps returning the ball at exactly 60° from x ≈ 4 (hits 3.8/4.3 alternate), and the ball folds off the ceiling and the wall back to the same spot 78 times. The anti-stall can't break this:
     - the straight line to the block needs about 76°;
     - `_nearestBrickAngle` returns that angle, and the 50 % blend is then clamped back to 60°, so the angle never changes.
   - Lowering `ANTI_STALL` alone made this worse: it produced a 341 s orbit on bot1.0 Easy (see the `proposed` column in `tests/sim/out/proposed.md`).
4. **Season length.** For the bots on Easy it is 51–67 s (74–92 % of seasons fall within 45–90 s), which is good. The adult takes **92 s at the median on Easy (only 46 % within 45–90 s, p90 127 s)** and 77 s on Normal. That time is spent hunting the last blocks.
5. **Time to the first block** is fine: 0.7–1.2 s after the serve for the bots and the adult, 0.2–0.4 s for parked players, and about 2.5–3.4 s for kids and idle players (that includes waiting for the 3 s auto-serve).
6. **Exploits: none found.**
   - The longest time the ball spent above all the blocks was 6–9.6 s, so the ball never gets trapped between Hoot and the ceiling.
   - Parked, wiggling and idle players never clear spring on Normal or Hard. On Easy only 1 wiggle game cleared it (1 %).
   - Hoot hits come at 1–4 a minute, so he can't be farmed.
7. **Pillows** bonk a moving player 13–33 % of the time and a parked or idle Mochi 100 % of the time. That's because `PILLOW_MISS` 0.5–1.5 u is less than the hit box w/2 + 0.3 = 1.8 u on Easy. The unit test expects this ("most land on the cap if he stands still"). It is harmless (no hearts are lost), but the MECHANICS wording "never at him" really means "never dead centre".
8. **Stars** are caught 56–65 % of the time by the bots, 77–85 % by the kids (they wait low) and 79–83 % by the adult. That is healthy.

## 2. Proposal

### 2a. CONFIG / DIFF (world.js lines 88 and 95)

```js
ANTI_STALL: 5,          // s — was 12. Only together with the code fix in 2b (alone it lengthens the periodic orbit)
DIFF.easy: { paddleW: 3.6, ballSpeed: 5.4, netSaves: 8, pillowEvery: 35, sleepyTime: 1.6, budStar: 0.15 }
//                was 3.0       was 6.2       was 2
```

Normal and Hard are unchanged.

**Why these values.** `explore.js` swept Easy settings for 150 seeds per cell:

| Easy variant | kid5 clears spring | kid4 | kid5fast | adult season length |
|---|---:|---:|---:|---:|
| ballSpeed 5.2 | 1 % | 1 % | 5 % | 102 s |
| paddleW 3.6 | 2 % | 1 % | 3 % | 93 s |
| netSaves 10 | 41 % | 17 % | 60 % | 91 s |
| speed 5.4, width 3.6, vine 6 | 37 % | 17 % | 80 % | 104 s |
| **speed 5.4, width 3.6, vine 8** | **65 %** | **34 %** | **95 %** | 104 s (86 s once the anti-stall fix is added) |

- Width and speed alone barely help.
- Extra vine saves help only the player who is struggling. A good player never reaches the vine, so they don't flatten the game for adults.
- Speed 5.4 (–13 %) and width 3.6 (+20 %) make the vine saves last long enough for a slow child.
- The vine already draws one glow bud per save, 1.2 u apart, so 8 buds span x 3.8–12.2 and fit.

### 2b. Code fix for the anti-stall periodic orbit

Proven at runtime by `smartStall` in `tests/sim/patch.js`:

- **world.js:601-611, `_nearestBrickAngle`:**
  - aim at the block's underside (y − h/2 − r) instead of its centre;
  - if the straight line needs more than `MAX_ANGLE`, aim at the block's mirror image in the near side wall (a bank shot);
  - if that is still out of reach, return `sign · rng.range(0.3, 0.9) · MAX_ANGLE`. The random part matters: any fixed angle (0.7·MAX was tried) just locks into a new orbit with a steady player.
- **world.js:587-590:** the steering weight grows from 0.5 to 1.0 between `ANTI_STALL` and 2 × `ANTI_STALL`:

```js
var k = M.min(1, 0.5 + 0.5 * (this.noBrickT - C.ANTI_STALL) / C.ANTI_STALL);
ang = (1 - k) * ang + k * tgt;
```

## 3. Before / after (baseline → `proposed+stall`, 100 seeds × 900 s)

| model | diff | clears spring | survival p50 | seasons p50 | season p50 | seasons in 45–90 s | longest no-block p50 / max | time at 5 ♥ |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| **kid5** | easy | **0 % → 73 %** | **30 → 192 s** | 0 → 1 (p90 5) | – → 81 s | – → 77 % | 3.2/12 → 9.9/20 | 0 → 18 % |
| kid4 | easy | 0 % → 41 % | 25 → 93 s | 0 → 0 | – → 78 s | – → 79 % | 2.8/11 → 8.4/15 | 0 → 5 % |
| kid5fast | easy | 2 % → 97 % | 33 → 682 s | 0 → 7 | 57 → 82 s | – → 67 % | 3.9/15 → 12.1/21 | 0 → 50 % |
| adult | easy | 100 → 100 % | 900 → 900 | 9 → 10 | **92 → 86 s** | **46 → 61 %** | **19.2/28 → 12.2/20** | 88 → 88 % |
| adult | normal | 100 → 100 % | 900 → 900 | 10 → 12 | 77 → 68 s | 70 → 89 % | 17.1/26 → 10.3/16 | 56 → 55 % |
| adult | hard | 96 → 96 % | 141 → 121 s | 2 → 2 | 64 → 58 s | 84 → 86 % | 14.1/20 → 8.1/12 | 0 → 1 % |
| bot0.2 | easy | 99 → 100 % | 900 → 900 | 11 → 12 | 67 → 69 s | 86 → 90 % | 16.4/35 → 11.4/20 | 50 → 87 % |
| bot0.5 | easy | 100 → 100 % | 900 → 900 | 15 → 14 | 56 → 62 s | 88 → 93 % | 13.2/23 → 10.1/18 | 84 → 89 % |
| bot1.0 | easy | 100 → 100 % | 900 → 900 | 16 → 14 | 53 → 62 s | 78 → 90 % | 9.0/27 → 9.5/27 | 89 → 89 % |
| bot0.5 | normal | 100 → 100 % | 402 → 462 s | 7 → 9 | 48 → 48 s | 64 → 63 % | 10.3/18 → 8.2/16 | 23 → 24 % |
| bot1.0 | normal | 100 → 100 % | 900 → 900 | 19 → 19 | 43 → 44 s | 41 → 43 % | **7.9/58 → 7.6/15** | 81 → 82 % |
| bot1.0 | hard | 100 → 100 % | 579 → 571 s | 15 → 15 | 37 → 37 s | 9 → 8 % | **6.4/175 → 6.6/12** | 26 → 26 % |
| park8 | easy | 0 → 0 % | 13 → 42 s | 0 | – | – | 2.0/6 → 5.1/13 | 0 |
| idle | easy | 0 → 2 % | 22 → 50 s | 0 | – (→ 75 s for the 2 % that clear) | – | 2.0/5 → 5.2/17 | 0 |
| wiggle | easy | 1 → 0 % | 22 → 48 s | 0 | – | – | 1.6/8 → 4.1/9 | 0 |

- **Longest no-block stretch across all 39 cells:** 175 s → 27 s.
- **Normal and Hard** for every bot: unchanged within noise.
- **Exploits:** still none. A parked or idle player now lasts about 45 s on Easy (the vine), and 2 % of idle games clear spring by luck. Nobody gets past spring without input.

Full tables: `tests/sim/out/{baseline,easyOnly,proposed,proposed_bank,proposed_stall}.md`.

## 4. Bugs and issues (file:line)

1. **game/js/world.js:587-590 and :601-611.** The anti-stall can't reach a far corner block: the target angle is above 60°, gets clamped, and only a 50 % blend is applied. A steady player then gets stuck in a periodic orbit (175 s seen). Fix in §2b.
2. **game/js/world.js:95, `DIFF.easy`.** Too hard for the stated audience: 0 % of 5-year-old models clear spring. Fix in §2a.
3. **game/js/bot.js:94-98 (test tool).** Once the target block is out of reach, the bot keeps the saturated offset (±0.8·reach, so the ball always leaves at 60°). Combined with #1, this causes the bot-only orbits. Also, bot skill 0.2–0.3 is not a child proxy (bot.js:33-34: it always predicts the landing point). Suggestion: have `MFB.Bot` take a `child` mode, or use `tests/sim/players.js:kid5` for the "a child clears spring" unit test.
4. **docs/MECHANICS.md:82 and :114** ("a 6-year-old clears spring", "forgiving for a 6-year-old"). Not supported by the sim with the current numbers.
5. **docs/MECHANICS.md:19** ("aimed … beside Mochi, never at him"). A parked Mochi is bonked 100 % of the time, which is by design according to the unit test. Suggest the wording "never dead centre".
6. **Unit tests the proposal changes:**
   - **tests/unit/run.js:129**, the DIFF table: update the expected values.
   - **tests/unit/run.js:365-376**, the vine "twice per season on Easy" test: change the loop to `C.DIFF.easy.netSaves`.
   - REQUIREMENT.md:29 and DESIGN.md:12 say "2 saves"; update both to 8.
   - Everything else passes with the patch: 32/34 via `tests/sim/unit_with_patch.js`.
