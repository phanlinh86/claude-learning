# Puff's Volcano Catch: high-speed playtest report

Playtester: human-like player models + VC.Bot, headless at max speed. No change was made to `game/js/`. Every proposed change was re-simulated with `new VC.World({ config: Object.assign({}, VC.DIFFICULTY[diff], overrides) })`.

- Harness: `tests/sim/players.js` (run `node tests/sim/players.js --n 150 --cap 15 [--diffs easy] [--overrides tests/sim/overrides/recommended.json] --tag <name>`)
- Raw results (one row per run + summaries): `tests/sim/results/players_*.json`. Tables: `players_*.md`
- Override files: `tests/sim/overrides/*.json` (`recommended.json` = the final proposal)
- The seeds are the same for every model, difficulty and variant, so before/after comparisons are paired.

## 1. Player models (input only through `setTarget` / `setMove` / `action`)

| Model | Reaction | Looks every | Aim error | Anticipation of the landing point | Starts tracking | Picks | Lapses (finger lifted) | Rocks |
|---|---|---|---|---|---|---|---|---|
| **kid4** (4 y) | 450–600 ms | 0.20–0.35 s | ±40 px | 45 % | only once the coin falls (after the apex) | closest coin | 6 %/s, 1–3 s | dodges 25 %, Cool Rain 8 %, mistakes a rock for a coin 4 % |
| **kid6** (6 y) | 350–450 ms | 0.15–0.25 s | ±30 px | 70 % | after 0.45 s of flight | closest coin | 2.5 %/s, 0.5–1.5 s | dodges 55 %, rain 25 %, mistakes a rock 1 % |
| **adult** (casual) | 250–350 ms | 0.08–0.15 s | ±20 px | 100 % | after 0.25 s | soonest reachable coin | none | dodges 90 %, rain 40 % |
| **rainSpam** | adult who also presses Cool Rain every time it is charged | | | | | | | |
| **park / parkRain** | sits under the crater (x 480), parkRain also spams the rain | | | | | | | |
| **sweep** | full-width left/right with the keys, never stops | | | | | | | |
| **wiggle** | fast ±150 px around the middle + rain spam | | | | | | | |
| **edge** | hides at the left edge | | | | | | | |
| **mash** | random finger position every 0.4–1.2 s (the toddler floor) | | | | | | | |
| **bot0.4 / 0.7 / 1.0** | `VC.Bot` | | | | | | | |

Each model plays 150 rounds per difficulty, capped at 15 min of game time. Baseline: 5,850 runs in 21 min. The verification run used 1,950 runs.

## 2. Findings on the current CONFIG (baseline)

Full tables: `tests/sim/results/players_baseline.md`.

### 2.1 Key numbers

| Model | Diff | Survival med (min) | Died ≤ 15 min | Score med | Clear zone 1 | s per zone, lap 1 (beach / jungle / ash / crater) | Catch rate beach → crater | Reach ×2 / ×3 / ×5 | Coin pts at ×≥2 |
|---|---|---|---|---|---|---|---|---|---|
| kid4 | easy | 15.0 | 39 % | 4,490 | 100 % | **95** / 125 / 140 / 161 | **0.44** → 0.31 | 97 / **2** / 0 % | **8 %** |
| kid4 | normal | 8.3 | 97 % | 1,395 | 98 % | 161 / 188 / 197 / 211 | 0.33 → 0.24 | 57 / 0 / 0 % | 4 % |
| kid6 | easy | 15.0 | 36 % | 13,780 | 100 % | 53 / 61 / 62 / 69 | 0.84 → 0.77 | 100 / 100 / 2 % | 52 % |
| kid6 | **normal** | 14.2 | 67 % | 7,310 | **100 %** | **68** / 77 / 92 / 105 | 0.78 → 0.56 | 100 / 73 / 0 % | 36 % |
| kid6 | hard | 6.1 | 100 % | 2,620 | 100 % | 72 / 93 / 114 / 122 | 0.67 → 0.45 | 100 / 30 / 0 % | 27 % |
| adult | easy | 15.0 | 8 % | 23,455 | 100 % | 47 / 52 / 54 / 57 | 0.97 → 0.92 | 100 / 100 / 78 % | 81 % |
| adult | **normal** | 14.2 | 74 % | 15,920 | 100 % | **56 / 61 / 67 / 66** | 0.95 → 0.90 | 100 / 100 / 67 % | **79 %** |
| adult | hard | 12.1 | 93 % | 14,115 | 100 % | 54 / 60 / 66 / 70 | 0.92 → 0.85 | 100 / 100 / 38 % | 74 % |
| bot0.4 | normal | 12.6 | 99 % | 15,660 | 100 % | 56 / 59 / 64 / 66 | 0.97 → 0.91 | 100 / 100 / 80 % | 85 % |
| bot1.0 | normal | 14.5 | 61 % | 29,205 | 100 % | 53 / 56 / 59 / 62 | 0.99 → 0.98 | 100 / 100 / 100 % | 96 % |

Time to the first catch is 4.4–5.0 s for every human model: 1.4 s banner, 0.5 s delay, the rumble, then a 2 s flight. A 4-year-old on Normal takes 7.6 s. Rocks caught per minute ("ouch/min"): kid4 0.51–0.63, kid6 0.40–0.59, adult 0.20–0.24, bots 0.17–0.53.

### 2.2 What is good (keep)

1. **Normal is well paced for adults:** 56–67 s per zone on lap 1, inside the 45–90 s target, with a 0.90–0.95 catch rate.
2. **The 6-year-old clearly wins Normal zone 1:** 100 % of runs, median 68 s (p90 83 s), 78 % catch rate. Later zones get harder for the child in a smooth way (zone 4: 105 s, 91 % clear).
3. **The multiplier twist matters for skilled play:** an adult earns 79 % of coin points (60 % of the total score) at ×≥2, and the skill-1.0 bot earns 96 %. Score roughly doubles from the casual adult to the perfect bot (15.9k → 29.2k on Normal).
4. **No degenerate strategy exists.** Every exploit scores 17–98 pts/min, against 1,150 for a casual adult and 315 for a 4-year-old:

| Exploit (Normal) | Score/min | Clear zone 1 | Survival med | Verdict |
|---|---|---|---|---|
| park under the crater | 59 | 74 % (431 s) | 9.1 min | catches only 12 % of coins: arcs spread over 90–870 px |
| park + rain spam | 67 | 88 % | 11.9 min | rain only slows death; no score |
| sweep left/right | 39 | 80 % (653 s) | 15.0 | 8 % catch, combo never > 3 |
| wiggle ±150 + rain spam | 65 | 88 % | 11.7 | 12 % catch |
| hide at the edge | 17 | 1 % | 6.2 | landing targets are 90–870 and rocks aim near Puff |
| random mashing | 65 | 93 % | 12.7 | 12 % catch |
| adult + rain spam | 1,141 (adult 1,153) | 100 % | 14.3 | **no gain and no penalty:** the rain only steams rocks, so extra casts add nothing |

The coin fairness rule (`|Δx| ≤ fairSlack + fairSpeed·Δt`) does not reward parking, because coins can still land anywhere along the shore. Rain spam is harmless and pointless, so no rain cooldown penalty is needed. On Easy, idle strategies with rain can survive 15 min, but they score less than 100 pts/min and stay stuck at level 1–2. That is fine for a toddler and is not an exploit.

### 2.3 Problems

1. **Easy is too hard for the 4-year-old, its target player.** The child can win zone 1, but only with a 44 % catch rate and a median of **95 s** (p90 131 s) to fill a 16-coin pouch. Later Easy zones take 125–161 s. That is long and full of misses for a 3–5-year-old's attention span.
2. **The 4-year-old never feels the twist.** Only 2 % of kid4 runs reach ×3, and just 8 % of coin points come from ×≥2 on Easy (4 % on Normal). The combo resets before the child gets 5 catches in a row.
3. **The bot is not a proxy for a child.** MECHANICS §8 says "a young child plays like the skill-0.4 row or worse". In fact bot0.4 catches 97 % on the Normal beach, against 78 % for kid6 and 33 % for kid4, and it plays like a casual adult. Use `kid4` / `kid6` from `players.js` for child balance.
4. *(minor)* **Hard is mainly harder for children.** For adults, the time per zone matches Normal (more bursts make up for the bigger pouches). Hard costs adults 2 min of survival, 3 points of catch rate and many ×5 runs (38 % vs 67 %). That is an acceptable gap, so no change is proposed.
5. *(minor, UI)* A 4-year-old on Normal needs 161 s for zone 1 and dies within 8 min. The menu should default to **Easy** for ages 3–5. This is a UI/default change, not a CONFIG change.

## 3. Levers tried on Easy (kid4 / kid6 / adult, 120 runs, 5-min cap, paired seeds)

| Variant | kid4 beach s (p90) | kid4 catch beach | kid4 reach ×3 | kid4 coin pts ×≥2 | kid6 beach s | adult beach s | kid4 ouch/min |
|---|---|---|---|---|---|---|---|
| e0 baseline | 95 (128) | 0.45 | 2 % | 8 % | 53 | 47 | 0.29 |
| a_fair: `fairSpeed` 200 → 130 | 80 (101) | 0.54 | 4 % | 16 % | 50 | 47 | 0.27 |
| a_catch: `catchHalfW` 38 → 46 | 86 (101) | 0.52 | 2 % | 14 % | 50 | 47 | 0.40 |
| a_speed: `speedMul` 0.85 → 0.75 | 86 (113) | 0.52 | 0 % | 14 % | 53 | 47 | 0.25 |
| e1: fair 130 + catch 46 + thresholds [0,3,7,12,20] | 71 (86) | 0.63 | 14 % | 55 % | 47 | 44 | 0.41 |
| e2: e1 + higher apex | 68 (83) | 0.64 | 17 % | 58 % | 47 | 44 | 0.41 |
| e3: e1 + speedMul 0.75 | 65 (83) | 0.67 | 27 % | 64 % | 47 | 47 | 0.43 |
| e4: fair 130 + speed 0.75 + thresholds (catch 38) | 74 (92) | 0.59 | 7 % | 54 % | 50 | 47 | 0.33 |
| **e5 (recommended):** fair 130 + speed 0.75 + catch 44 + thresholds + fewer rocks | **68 (83)** | **0.66** | **20 %** | **61 %** | 47 | 47 | 0.34 |

Each lever is worth about 10–15 s on the kid4 beach on its own. A wider basket also makes rocks easier to catch: ouch/min rises from 0.29 to 0.40. So e5 uses a slightly smaller widening (44) and pairs it with about 25 % fewer rocks on Easy. That keeps the gain in coin catches while holding the extra ouches down (0.34).

## 4. Recommendation: Easy only (Normal and Hard unchanged)

```js
// merge into VC.DIFFICULTY.easy (game/js/world.js)
const RECOMMENDED_OVERRIDES = {
  easy: {
    fairSpeed: 130,                          // 200 → 130: each coin lands closer to Puff / the previous coin
    speedMul: 0.75,                          // 0.85 → 0.75: slower, floatier arcs (≈ 2.5–2.9 s flights)
    catchHalfW: 44,                          // 38 (CONFIG) → 44: slightly wider basket for small fingers
    multThresholds: [0, 3, 7, 12, 20],       // [0,5,12,22,35] → ×2 after 3 catches, ×5 after 20
    rockChance: [0.03, 0.08, 0.12, 0.16]     // [0.04,0.10,0.15,0.20] → fewer rocks to offset the wider basket
  }
  // normal: {} and hard: {} unchanged: they meet every target
};
```

### 4.1 Before → after, Easy, full run (150 rounds, 15-min cap)

`players_baseline.md` → `players_recommended_easy.md`

| Model | Metric | Before | After |
|---|---|---|---|
| **kid4** | zone 1 cleared | 100 % | 100 % |
| | s to clear zone 1, median (p90) | **95 (131)** | **65 (86)** |
| | s per zone, lap 1 (beach / jungle / ash / crater) | 95 / 125 / 140 / 161 | 65 / 81 / 85 / 94 |
| | all 4 zones cleared on lap 1 | 83 % | 99 % |
| | catch rate beach → crater | 0.44 → 0.31 | 0.66 → 0.53 |
| | runs reaching ×2 / ×3 | 97 % / 2 % | 100 % / 38 % |
| | coin pts at ×≥2 (share of total score) | 8 % (4 %) | **58 % (32 %)** |
| | score median | 4,490 | 9,685 |
| | survival median / p10 (min) | 15.0 / 8.8 | 15.0 / 12.2 |
| | level reached, median | 6 | 11 |
| kid6 | s per zone, lap 1 | 53 / 61 / 62 / 69 | 47 / 55 / 57 / 60 |
| | catch rate beach | 0.84 | 0.92 |
| | reach ×4 / ×5 | 43 % / 2 % | 86 % / 20 % |
| | coin pts at ×≥2 | 52 % | 87 % |
| adult | s per zone, lap 1 | 47 / 52 / 54 / 57 | 44 / 50 / 52 / 53 |
| | coin pts at ×≥2 | 81 % | 95 % |
| exploits | best exploit score/min (wiggle + rain) | 98 | 142 (adult 2,188, kid4 667) |
| | park: zone 1 clear time | 356 s | 317 s |

Side effects to know about:

- **Easy runs end later and further in.** Players now reach levels 11–22 instead of 6–20. There they meet lap-3+ pressure, so "died within 15 min" rises: kid6 36 % → 84 %, kid4 39 % → 47 %. Deaths now come after 12–14 min and 18+ levels, which is a natural end to a session rather than a frustration. kid4's early deaths improve: p10 survival goes from 8.8 to 12.2 min.
- **Easy scores are now about 2× Normal scores** for the same player, because of the lower thresholds. Best scores are stored per difficulty, so nothing breaks.
- The adult time per zone on Easy drops to 44–53 s. That is fine, since Easy is not the adult target.

## 5. Other notes for the team

- Default the difficulty to **Easy** for ages 3–5 (UI).
- Update MECHANICS §8: the skill-0.4 bot plays like a casual adult, not a child. Child balance should use `tests/sim/players.js` (`kid4`, `kid6`).
- Optional (not simulated): shortening `introDelay` from 1.4 to 1.0 s would bring the first catch from about 4.8 s to about 4.4 s.
