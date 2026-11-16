# Momo's Dino Drums: high-speed playtest report

2026-11-16 · playtester agent · report-only (no game code changed)

How to reproduce:
- `node tests/sim/playtest.js --runs 100`: about 1.5 min on 2 cores. It plays 2 × 5,870 headless rounds (current settings, then the proposal) and writes `tests/sim/results/playtest.md` plus the JSON files.
- `node tests/sim/tune.js <diff> '<json overrides>' <players> <runs>`: quick sweeps. `EMPTY_COST=x [EMPTY_L0=1]` prototypes the code rule suggested in §7.
- The older harness, `node tests/sim/run.js`, still works. Its results are in `tests/sim/results/summary.md`.

Each run lasts at most 8 floors (two climbs of the tower) or until the groove runs out. Frames are 60 fps, the world sub-steps at 120 Hz, and players tap with exact offsets.

## 1. Players
| model | stands for | timing σ / bias | wrong rail | other |
|---|---|---|---|---|
| `toddler3` (new) | a just-3-year-old | 0.16–0.22 / +0.08–0.15 s | 35 % | skips 20 %, looks away every ~15 s for 4–10 s |
| `toddler` | 3–4 years | 0.13–0.18 / +0.06–0.12 | 30 % | skips 12 %, lapses every ~20 s |
| `kid` | 4–6 years (average) | 0.09–0.14 / +0.03–0.08 | 15–25 % | lapses every ~30 s, double taps 8 % |
| `kid6` (new) | a 6-year-old | 0.07–0.10 / +0.02–0.06 | 8–14 % | lapses every ~45 s |
| `casual` | casual adult | 0.04–0.06 / 0–0.02 | 5 % | |
| `veteran` (new) | rhythm-game veteran | 0.018–0.03 / ≈0 | 1 % | reads ahead 1.2 s |
| `camper` | adult who uses only the lower rail | | | |
| `bot:s` | DD.Bot, skill 0.1 to 1 | | | |
| exploits | `spamBoth/Alt/One/Fast` (a tap every 40–120 ms), `mashSlow(Both)` (every 200–330 ms), `beatOne/beatBoth` (blind metronome on every beat), `idle` | | | |

## 2. Goals: current game vs proposal (100 runs per cell)
| goal | current | proposed | verdict |
|---|---|---|---|
| Easy floor 1 cannot be lost | idle player clears F1 100 % (groove floor 0.05) | same | ✅ |
| A toddler clears ≥ 1 floor (Easy) | toddler3 100 %, toddler 100 % (reaches F3: 5 % / 67 %) | same | ✅ |
| A 6-year-old on Normal clears F1 ≥ 90 % | kid6 100 % (kid 4–6: 97 %) | 100 % (97 %) | ✅ |
| …and often reaches floor 2–3 | kid6 reaches F3 99 %, clears the tower 71 %, median 6 floors | 98 %, tower 73 %, **median 7** | ✅ |
| Adults get a challenge on Hard | casual adult clears all 8 floors **92 %**, Pip saves 4.1 / song | **F1 94 %, tower 53 %, 8 floors 33 %**, saves 2.8 / song | ❌ → ✅ |
| Mashing never clears a floor on Normal / Hard | every spam and mash variant: 0 % | 0 % | ✅ |
| (extra) a blind metronome | Normal F1 96–97 %, then stops at F2 (≤ 4 % reach F3); Hard 0 % | same | ⚠ see §7 |

## 3. Survival and score (current settings, 100 runs, at most 8 floors)
| cell | clear F1 | reach F3 | clear tower (4) | clear 8 | score p10 / p50 / p90 | first point |
|---|---|---|---|---|---|---|
| easy · toddler3 | 100 % | 5 % | 0 % | 0 % | 0.75k / 1.4k / 3.3k | 5.7 s |
| easy · toddler | 100 % | 67 % | 12 % | 1 % | 2.3k / 6.6k / 17.7k | 3.0 s |
| easy · kid | 100 % | 100 % | 100 % | 99 % | 55k / 72k / 91k | 2.9 s |
| easy · kid6 | 100 % | 100 % | 100 % | 100 % | 122k / 147k / 198k | 2.9 s |
| normal · kid | 97 % | 17 % | 0 % | 0 % | 1.9k / 4.1k / 8.7k | 3.0 s |
| normal · kid6 | 100 % | 99 % | 71 % | 29 % | 18.5k / 48.6k / 93k | 2.9 s |
| normal · casual | 100 % | 100 % | 100 % | 100 % | 213k / 263k / 297k | 2.9 s |
| hard · casual | 100 % | 100 % | 97 % | 92 % | 147k / 191k / 253k | 2.9 s |
| hard · veteran | 100 % | 100 % | 100 % | 100 % | 541k / 573k / 604k | 2.9 s |
| hard · kid6 | 18 % | 1 % | 0 % | 0 % | 0.3k / 1.4k / 7.8k | 2.9 s |

- **Bots:** Easy is cleared by every bot skill, even 0.1. Normal is cleared from skill 0.3 up, and Hard from skill 0.5 up (now 0.6, see §6).
- **First point:** 2.9 s after "Start" for everyone who can play (the 4-beat count-in is 2.86 s, then the first gem lands on "Go!"). The 3-year-old needs 5.7 s (the median). That is fine: Momo, the count-in and the music keep the screen lively until then.
- **Pacing:** every floor is 60.6–60.9 s from count-in to "floor cleared" (song 57.9–58.4 s). Lap-2 floors take 68.6–71.3 s. All of them are inside the 45–90 s target. A full climb of the tower is about 4 min, and two climbs are about 9 min, which suits a kid's session. Nothing to change.
- **Difficulty cliff:** on Normal, the kid 4–6 model clears F1 97 % but Fern Canopy only 17 %. The reason is that floor 1 halves the miss cost (`firstLevelCostMul`) and floor 2 charges the full cost with more notes. The 6-year-old is not affected (99 %). The proposed `densStart` change softens the cliff a little (17 → 25 %). The real fix is a per-floor cost ramp (§7).

## 4. Pip the helper
| cell | songs with a Pip visit | Pip visits / song | Pip on screen (% of play) | saves / song | score with / without Pip* |
|---|---|---|---|---|---|
| easy · toddler | 79 % | 1.6 | 13 % | 1.6 | 7.3k / 5.6k |
| easy · kid | 100 % | 3.8 | 39 % | 3.6 | 65k / 47k |
| normal · kid6 | 98 % | 3.3 | 28 % | 3.3 | — |
| normal · casual | 100 % | 3.7 | 58 % | 3.0 | 260k / 126k |
| hard · casual | 100 % | 4.4 | 47 % | **4.1** | 223k / 117k |
| hard · veteran | 100 % | 2.8 | 73 % | 1.1 | — |

\* from `tests/sim/results/compare.md` (Pip switched off with `helperCombo 1e9`).

- **For the kids Pip is a treat, not a crutch.** A child of 3 to 6 meets Pip in nearly every song, and Pip is on screen 13–39 % of the time. Pip never decides whether the child clears floor 1 (the clear rate is the same with and without Pip). Pip lifts the toddler's chance to reach floor 3 from 68 % to 78 %. Keep the Easy and Normal settings as they are.
- **On Hard, Pip was the crutch.** Pip came back every 6 s (plus 5 catches), so an adult who kept missing got about 4 free misses per song, and that is a big reason why 92 % cleared all 8 floors. Setting `helperCooldown` to 12 on Hard only gives 2.8 saves per song and Pip on screen 28 % of the time, with REQUIREMENT's combo 5 kept.
- For strong players, Pip doubles the score (it is on screen 58–77 % of the time). That is fine because it rewards streaks, but it means scores grow very unevenly with skill. Medal thresholds (§5) take that into account.

## 5. Medals
**Now** (`ui.js`), the medal depends on floors cleared: 1 bronze, 2 silver, 3 gold, 4+ platinum.

Current result: on Easy, every 4–6-year-old gets platinum (100 %). On Normal, a casual adult gets platinum 100 %. On Hard, the casual adult got platinum 97 % before the tuning. So platinum means nothing to anyone older than about 4. The 3-year-old gets bronze 100 %, and that part is good.

**Proposal:** a hybrid, per difficulty. Bronze stays "clear floor 1", so every small child who finishes a song still gets a medal. Silver, gold and platinum use the run's score and need at least one floor cleared.

| difficulty | bronze | silver | gold | platinum |
|---|---|---|---|---|
| Easy | finish floor 1 | **5,000** | **50,000** | **100,000** |
| Normal | finish floor 1 | **20,000** | **75,000** | **250,000** |
| Hard | finish floor 1 | **50,000** | **150,000** | **450,000** |

Share of runs that earn each medal or better (simulated, with the proposed tuning):

| cell | ≥ bronze | ≥ silver | ≥ gold | platinum |
|---|---|---|---|---|
| easy · toddler3 | 100 % | 2 % | 0 % | 0 % |
| easy · toddler | 100 % | 60 % | 0 % | 0 % |
| easy · kid (4–6) | 100 % | 100 % | 96 % | 5 % |
| easy · kid6 | 100 % | 100 % | 100 % | 97 % |
| normal · kid (4–6) | 97 % | 0 % | 0 % | 0 % |
| normal · kid6 | 100 % | 83 % | 27 % | 0 % |
| normal · casual adult | 100 % | 100 % | 100 % | 40 % |
| hard · casual adult | 94 % | 54 % | 17 % | 0 % |
| hard · veteran | 100 % | 100 % | 100 % | 98 % |

How the numbers were chosen. These are the medians of all human models for each difficulty, with the proposed tuning:
- Score when clearing floors 1 / 2 / 4 / 8: Easy 3.4k / 14k / 40k / 108k. Normal 5.2k / 18k / 82k / 237k. Hard 19k / 61k / 199k / 508k.
- Score percentiles p25 / p50 / p75 / p90: Easy 2.6k / 43k / 108k / 158k. Normal 6.6k / 58k / 228k / 257k. Hard 66k / 432k / 520k / 542k.

The silver, gold and platinum thresholds sit at roughly "two floors / the whole tower / two climbs played well". Each age has a next medal to aim for. The game is endless, so a long adult session will go past platinum. That is fine.

Code sketch for `ui.js`:
```js
const T = { easy: [5000, 50000, 100000], normal: [20000, 75000, 250000], hard: [50000, 150000, 450000] }[diff];
const m = info.cleared < 1 ? 'none' : info.score >= T[2] ? 'platinum' : info.score >= T[1] ? 'gold' : info.score >= T[0] ? 'silver' : 'bronze';
```
(`info` would need the run's difficulty, `game.runDifficulty`.)

## 6. Proposed CONFIG / DIFFICULTY changes
| key | old → new | reason |
|---|---|---|
| `DIFFICULTY.hard.goodWin` | 0.11 → **0.09** | Hard was the same game as Normal with slightly tighter timing: a casual adult (σ ≈ 50 ms) still landed 88 % of gems. At 0.09 an adult has to really lock onto the beat. The veteran is unaffected (98 % accuracy). |
| `DIFFICULTY.hard.missCost` | 0.11 → **0.13** | Misses on Hard must matter. About 5 misses in a row from a half-full meter now send Momo to sleep. |
| `DIFFICULTY.hard.helperCooldown` (new override) | (6) → **12** | Pip was saving 4.1 misses per song for adults on Hard. Now it saves 2.8, and Pip is on screen 47 → 28 % of the time. Easy and Normal are unchanged (kids keep their treat), and so is the combo 5 from REQUIREMENT. |
| `DIFFICULTY.normal.densStart` (new override) | [1.5, 2.1, 2.5, 2.9] → **[1.5, 1.8, 2.3, 2.9]** | Smoother climb from floor 1 to floor 3 for 4–6-year-olds who chose Normal (reach F3 17 → 25 %). The 6-year-old's median rises from 6 to 7 floors. Adults and exploits are unchanged. Floor 4 and the laps keep the same density. |

Re-simulated with the same seeds, 100 runs per cell (full table: `tests/sim/results/playtest.md`, "before → after"):

| cell | clear F1 | reach F3 | clear tower | clear 8 | median floors | score p50 | Pip on screen | saves / song |
|---|---|---|---|---|---|---|---|---|
| hard · casual adult | 100 → **94 %** | 100 → **89 %** | 97 → **53 %** | 92 → **33 %** | 8 → **5** | 191k → **66k** | 47 → **28 %** | 4.08 → **2.81** |
| hard · veteran | 100 → 100 % | 100 → 100 % | 100 → 100 % | 100 → 100 % | 8 → 8 | 573k → 520k | 73 → 60 % | 1.06 → 0.89 |
| hard · bot 0.5 | 100 → **87 %** | 100 → **76 %** | 99 → **44 %** | 98 → **3 %** | 8 → **3** | 146k → 38k | 39 → 23 % | 4.42 → 2.64 |
| hard · bot 0.6 | 100 → 100 % | 100 → 100 % | 100 → 97 % | 100 → 93 % | 8 → 8 | 243k → 179k | 50 → 34 % | 4.00 → 3.01 |
| hard · kid6 | 18 → 0 % | 1 → 0 % | 0 → 0 % | 0 → 0 % | 0 → 0 | 1.4k → 0.65k | | |
| hard · beatBoth / spam | 0 → 0 % | | | | | | | |
| normal · kid (4–6) | 97 → 97 % | 17 → **25 %** | 0 → 0 % | 0 → 0 % | 1 → 1 | 4.1k → 4.1k | 8 → 8 % | 0.96 → 0.97 |
| normal · kid6 | 100 → 100 % | 99 → 98 % | 71 → 73 % | 29 → 33 % | 6 → **7** | 48.6k → 58.3k | 28 → 29 % | 3.27 → 3.22 |
| normal · casual | 100 → 100 % | 100 → 100 % | 100 → 100 % | 100 → 100 % | 8 → 8 | 263k → 245k | 58 → 58 % | 3.03 → 2.90 |
| normal · beatOne (metronome) | 97 → 97 % | 2 → 4 % | 0 → 0 % | 0 → 0 % | 1 → 1 | 3.7k → 3.8k | | |
| normal · spam / mash (all 6) | 0 → 0 % | | | | | | | |
| easy · all cells | unchanged (no Easy changes) | | | | | | | |

Other settings tried:
- Hard `goodWin 0.10 + missCost 0.13`: adults still cleared all 8 floors 73 %.
- Hard `goodWin 0.09` with `lapBpm 12 / densLap 0.7`: hardly any effect, because the timing window is what separates players.
- Normal `firstLevelCostMul 0.65–1.0`: this cuts the metronome exploit (97 → 72 → 8 %) but cuts the 4–6 kid's floor 1 just as hard (98 → 80 → 34 %), because a reaction-late small child and a blind metronome both land about 50 % of gems. Rejected.
- Normal `eighthsFrom 1 → 2`: no measurable effect.

After applying these, the integrator must update `tests/unit/run.js:83`, which asserts the Hard windows `'0.055,0.11,0.28'` and should become `'0.055,0.09,0.28'`. Also update the window and cost numbers in DESIGN.md §5.1 and MECHANICS.md §3.

## 7. Exploits and code-level suggestions (optional, not CONFIG)
1. **Blind metronome on Normal floor 1 (P3).** Tapping one rail on every beat without looking clears Normal F1 97 % of the time (score about 3.8k). It catches the gems on its rail, wrong-rail-misses the others, and the half miss cost on floor 1 keeps the meter afloat. It never gets past floor 2 (≤ 4 % reach F3) and earns almost nothing, so I rate it low.
   - A clean fix, prototyped with `EMPTY_COST=0.03 EMPTY_L0=1 node tests/sim/tune.js normal '{}' kid,kid6,beatOne,camper 50`: on Normal floor 1, a tap that catches nothing costs `0.03 × firstLevelCostMul` groove.
   - Result: metronome 94 → **18 %**, kid6 100 → 100 %, kid 4–6 98 → 90 %, camper unchanged.
   - Charging every floor instead hurts the 6-year-old on later floors (tower 48 → 28 %), so it should apply to floor 1 only.
2. **Easy one-button + metronome = perfect play.** On Easy, tapping on every beat clears everything at 100 % accuracy. Easy has no eighths, and gems one beat apart are outside `earlyWin`. This is "drum along to the beat", the skill Easy is meant to teach, so leave it.
3. **Floor-1 to floor-2 cliff on Normal for 4–6-year-olds.** A per-floor cost ramp, e.g. `levelCostMul: [0.5, 0.75, 1, 1]` in place of the single `firstLevelCostMul`, would smooth it. That needs a world.js change, so it is not simulated here.
4. **Camping one rail:** Normal F1 93 %, then 0 % at F2. Same cause as item 1; the fix in item 1 does not touch it, item 3 would.

## 8. Files
- `tests/sim/playtest.js`: the high-speed playtest (current vs proposal, medal percentiles, pacing). New.
- `tests/sim/tune.js`: sweep helper and the empty-tap rule prototype. New.
- `tests/sim/players.js`: adds the `kid6`, `toddler3` and `veteran` models. Existing models are unchanged.
- `tests/sim/results/playtest.md` and `playtest-{baseline,proposed}.json`: the raw results.
