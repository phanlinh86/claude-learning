# Taffy's Candy Reel: high-speed playtest report (2026-11-18)

Report-only. No game code was changed. Every number comes from the headless world plus player models in a node vm (`tests/sim/playtest.js`). The real browser was checked with `tests/sim/browser-check.js`.
About 16,000 simulated rounds in total (base about 4,350 ten-minute rounds, the proposal 4,350, plus level-1, exploit and variant runs).
Raw tables: `tests/sim/results/playtest-main.md` (base), `playtest-main-proposal.md`, `playtest-exploit.md`, `playtest-level1*.md`.

## How to reproduce
```
node tests/sim/playtest.js main    --n 50                       # 7 skill models + 4 exploit models × 3 difficulties × landscape/portrait, + wind off
node tests/sim/playtest.js main    --n 50 --set '{"difficulty.easy.flakesNeeded":8,"difficulty.easy.gummyMaxCap":1,"goldSpeed":1.35}' --tag proposal
node tests/sim/playtest.js exploit --n 40                       # camper depth sweep, rhythm tapping, kid mashing the reel
node tests/sim/playtest.js level1  --n 300 [--set …]            # level 1 only, kids + adult, both orientations
node tests/sim/browser-check.js 30 easy 0.75                    # ?speed=8&bot=1 in Chromium vs headless
```
Models:
- bots: `PR.Bot` at skill 1, 0.75, 0.5 and 0.3.
- kid 5–6: reacts in 350–600 ms, overshoots its holds (σ 30 px), taps with σ 120 ms, double-taps 15% of the time and never notices half of the gummies.
- **kid hesitant** (new): reacts in 450–850 ms, taps with σ 160 ms; 35% of its reel taps wait one more needle pass, 10% are panic taps.
- casual adult.
- exploit models: mash 8–10 Hz, mash on the reel only, hold forever, never press, park at a fixed depth, tap in a fixed rhythm while reeling.

Each round lasts at most 10 minutes. 50 rounds per cell, so game-over rates carry about ±10 points of noise.

## Base numbers (landscape 960×540, wind on)

| player | diff | game over in 10 min | survived min p10/p50 | score p10/p50/p90 | first point s p50 | level s p10/p50/p90 | level in 45–90 s | escapes/level | snaps/level |
|---|---|---|---|---|---|---|---|---|---|
| bot 1.00 | easy | 0% | 10/10 | 2795/3010/3185 | 6 | 27/**35**/48 | **10%** | 0 | 0 |
| bot 1.00 | normal | 0% | 10/10 | 2835/3000/3250 | 5 | 36/46/60 | 52% | 0 | 0.01 |
| bot 1.00 | hard | 0% | 10/10 | 2750/2930/3200 | 4 | 45/59/73 | 88% | 0 | 0.04 |
| bot 0.75 | easy / normal / hard | 0% | 10/10 | p50 2790 / 2590 / 2280 | 5–6 | p50 37 / 50 / 65 | 14 / 63 / 91% | ≤ 0.30 | ≤ 0.06 |
| bot 0.50 | easy / normal / hard | 0 / 0 / 8% | 10/10 | p50 2245 / 1705 / 980 | 6–7 | p50 42 / 65 / 121 | 30 / 81 / 25% | 0.08 / 1.5 / 9.2 | ≤ 0.31 |
| bot 0.30 | easy / normal / hard | 0 / 2 / 24% | – | p50 1685 / 1055 / 525 | 7–9 | p50 48 / 104 / 191 | 64 / 39 / 0% | 0.9 / 5.7 / 19.9 | ≤ 0.83 |
| kid 5–6 | easy | **16%** | 7.9/10 | 1565/1965/2195 | 7 | 29/**39**/51 | 20% | 0.22 | 0.34 |
| kid 5–6 | normal | 98% | 2.9/4.6 | 415/625/1210 | 7 | 48/61/92 | 85% | 1.88 | 1.13 |
| kid 5–6 | hard | 100% | 1.2/2.7 | 70/255/415 | 8 | 82/106/135 | 22% | 5.9 | 2.06 |
| kid hesitant | easy | 14% | 9.2/10 | 1030/1245/1420 | 9 | 40/57/81 | 77% | 0.93 | 0.42 |
| kid hesitant | normal | 94% | 2.7/5.2 | 230/450/780 | 10 | 71/104/168 | 29% | 4.75 | 1.41 |
| casual adult | easy | 0% | 10/10 | 2435/2625/2780 | 7 | 30/**40**/51 | 19% | 0 | 0.10 |
| casual adult | normal | 12% | 9.8/10 | 2090/2315/2510 | 6 | 39/51/64 | 77% | 0.07 | 0.42 |
| casual adult | hard | 84% | 3.9/6.6 | 760/1270/1770 | 5 | 55/73/104 | 79% | 1.12 | 1.00 |

**Portrait 560×1212** gives the same pacing (levels within about ±5 s) but is clearly safer, because the lake is about 3.4× taller and the gummies are spread thinner:
- kid on Easy: 0% game over (16% in landscape)
- kid on Normal: 64% (98% in landscape)
- casual adult on Hard: 36% (84% in landscape)
- first point: same in both orientations

**Time to first point** has a p50 of 5–10 s for every real model, and a p90 of 8–19 s except at low skill on Hard. This is good.

**Per level** (landscape medians, levels 1 to 8):
- Easy is flat at about 35–40 s for everyone except the hesitant kid (51–70 s).
- Normal is flat at 46–53 s for bots and the casual adult.
- Hard climbs from 54 to 64 s (bot 1) and from 64 to 102 s (casual adult).
- The loop speed-up from level 5 onwards is gentle. Nothing spikes.

## Findings

1. **Easy levels are too short.** A competent player clears an Easy level in 35–40 s (p50), and only 10–20% of Easy levels fall in the 45–90 s target. Easy levels are a third shorter than Normal ones, so the weather scenes (the level theme) flash past. Normal and Hard sit inside the target.
2. **On Easy, the kid model loses one round in six in landscape** (16%, median death at level 13). Easy reaches `gummyMaxCap` 2 by level 3. The kid misses half the gummies (59% of its snaps), so two gummies at once is what ends a 5–6 year old's run. Easy is the default difficulty, so this case matters most.
3. **Golden snowflake.** It appears about 1.2 times per minute (0.7 per Easy level, 1.0 per Normal level), which matches "now and then". The kid catches only 31% of them on Easy (adult 71%, bot 76%), because at 1.6× speed it has usually passed the hook before the kid's slow aim arrives. When a kid hooks one, they land it 96% of the time, so the reel is not the problem.
4. **The wind changes almost nothing in the outcome.** With wind on vs off (`driftMax = current = 0`, same seeds):
   - snaps per level, escapes per level and level time all change by ≤ 0.07, ≤ 0.15 and ≤ 8 s in every cell, which is within noise.
   - 41–47% of the kid's and the adult's snaps happen where the sway moved the hook into a gummy that a straight line would have missed. Yet the snap rate is the same with the wind off, so the sway moves which gummy gets touched, not how many.
   - "Wind misses" (a straight line would have hooked a flake the bowed line passed) are only 0.01–0.10 per level for good players and 0.3–0.8 per level for sloppy ones on Hard.
   - The wind helps more than it hurts: "wind assists" (the sway swept the hook onto a flake a straight line would have missed) are 1–3 per level.
   - The reel meter does not depend on the wind. The column "escapes during a strong gust" (45–76%) only shows how much of the time a gust is blowing.
   - So the twist is readable and fair, but it is mostly visual. On Easy this is what the requirement asks for ("costs a small child nothing"). If the team wants the Windy level on Hard to *feel* harder, `difficulty.hard.driftMax` 70 → 90 is the knob to try. I did not test it and do not propose it here.
5. **Exploits: none that pay** (`playtest-exploit.md`, plus the main tables). Compare each with the casual adult's 2600 points on Easy:
   - **Mash 8–10 Hz:** 0 points on every difficulty. It dies on 24 / 76 / 98% of rounds.
   - **Mash on the reel only:** 0–25 points p50, catch/hook ≤ 2%. The 3-slip rule kills it.
   - **Rhythm tapping on the reel** (1.5 / 2.5 / 4 Hz, ignoring the needle): 3–20% catch/hook, 55–555 points on Easy.
   - **Hold forever** (hook parked on the bottom): 220 points p50 on Easy, 400 s per level.
   - **Never press** (hook resting at the top): 280 points on Easy, survives (2% game over), 135–177 s per level. Shallow flakes drift into the bobber on their own. This is harmless and even nice for a toddler who just watches.
   - **Parking at a fixed depth (0.10–0.85) with perfect reeling:** the best is 0.40 on Easy, at 1035 points p50 and 70% game over. No depth is gummy-proof: gummies spawn from `minHookY+16` to `maxHookY−6` and bob ±10, so their reach covers the whole hook range.
6. **Hard with low skill:** the reel meter is the wall. Bot 0.3 escapes 19.9 times per level and bot 0.5 9.2 times, and their levels take 121–191 s. This is fine for Hard. A kid should not be there: only 22% of the kid's Hard levels and none of the hesitant kid's fall in the target band.
7. **The browser matches the sim.** I ran `?speed=8&bot=1&skill=0.75&diff=easy&seed=5` for 30 s real time, which is 240 s of game time:

   | | landscape 960×540: browser | landscape: headless (20 seeds) | portrait 390×844 → 560×1212: browser | portrait: headless |
   |---|---|---|---|---|
   | flakes/min | 9.0 | 9.7 | 8.5 | 9.5 |
   | levels cleared | 6 | 6.0 | 5 | 6.0 |
   | mean level s | 38.6 | 37.0 | 40.9 | 37.2 |
   | snaps / escapes | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
   | gusts/min | 3.8 | 4.1 | 3.7 | 4.1 |

   - The browser ran at 60 fps with no console errors.
   - The phone-sized viewport maps to logical 560×1212, the same size the sim uses for portrait.
   - Screenshots: `tests/sim/results/browser-landscape.png`, `browser-portrait.png`.

## Proposed CONFIG diff (`game/js/world.js`)

| key | old → new | reason |
|---|---|---|
| `difficulty.easy.flakesNeeded` | 6 → **8** | Easy levels go from 35–40 s to 48–53 s (p50) for competent players, and the share in the 45–90 s band goes from 10–20% to 50–79%. Level 1 for the kid takes 51 s (p90 64 s) and is still cleared 100% of the time. |
| `difficulty.easy.gummyMaxCap` | 2 → **1** | Keeps at most one sour gummy on Easy, so longer levels don't mean more snaps. Kid game over in 10 min goes from 16% to 6%, hesitant kid from 14% to 8%. Adults and bots are unchanged (they barely get snapped on Easy). |
| `goldSpeed` | 1.6 → **1.35** | The kid's golden catch rate goes from 31% to 43% on Easy (adult 71% → 77%, bot 1 on Hard 62% → 64%). Goldens still drift 35% faster than other flakes, and their frequency doesn't change (about 1.2 per minute). |

Re-simulation with the diff (same seeds, 50 rounds per cell, `playtest-main-proposal.md`):

| player | diff / size | game over | level s p50 (p90) | level in 45–90 s | snaps/level | gold caught |
|---|---|---|---|---|---|---|
| bot 1.00 | easy / land | 0 → 0% | 35 → **48** (48 → 61) | 10 → **50%** | 0 → 0 | 76 → 82% |
| bot 0.50 | easy / land | 0 → 0% | 42 → 56 | 30 → 79% | 0 → 0 | 70 → 76% |
| casual adult | easy / land | 0 → 0% | 40 → **52** (51 → 69) | 19 → **68%** | 0.10 → 0.09 | 71 → 77% |
| casual adult | easy / port | 0 → 0% | 40 → 53 | 17 → 75% | 0.05 → 0.04 | 47 → 59% |
| kid 5–6 | easy / land | **16 → 6%** | 39 → **50** (51 → 63) | 20 → **71%** | 0.34 → 0.29 | **31 → 43%** |
| kid 5–6 | easy / port | 0 → 0% | 42 → 57 | 31 → 82% | 0.20 → 0.18 | 22 → 32% |
| kid hesitant | easy / land | 14 → 8% | 57 → 74 (81 → 103) | 77 → 79% | 0.42 → 0.31 | 23 → 26% |
| kid 5–6 | easy level 1 only (300 rounds) | clears 100 → 100% | 39 → 51 (p90 50 → 64) | – | lines lost 0.11 → 0.22 | – |
| Normal / Hard (every model) | – | unchanged within noise | ±3 s | ±5 pts | ±0.05 | +2–10 pts |

Side effects to watch:
- The hesitant kid's Easy p90 becomes 103 s, a little over 90 s. A slow child spends longer per level, which is acceptable for the default mode.
- Lines lost in Easy level 1 rise from 0.11 to 0.22, because the level is longer. There is still no game over in level 1.
- The casual adult on Normal read 12 → 22% game over in one run, but snaps per level were 0.42 → 0.45. This is noise at 50 rounds (the base wind-off run of the same model read 28%).

If the diff is applied, these must change with it (I did not touch them, report-only):
- `tests/unit/run.js:92–93`: the expected `[6, 8, 10]` becomes `[8, 8, 10]`.
- `tests/e2e/functional.js:568`: `ed.need === 6` becomes 8.
- `REQUIREMENT.md:35`: "(Easy 6, Hard 10)" becomes "(Easy 8, Hard 10)".
- the tables in `docs/MECHANICS.md` §2 (`flakesNeeded`, `gummyMaxCap`, `goldSpeed`).

## Not proposed (noted)
- Kid on Normal: 98% game over in landscape, 64% in portrait. Normal is not meant for 5–6 year olds and the default is Easy. Lowering `normal.gummyMaxCap` 4 → 3 and raising `gummyMin` 5 → 6.5 did not help the kid, who dies around level 4, before the cap applies. It only moved the casual adult from 12% to 6%, so I dropped it.
- Landscape is harder than portrait, because the gummy density per pixel of lake is higher. That is a layout property, not a CONFIG fix.

## Fixes applied (fix engineer, 2026-11-18)
- **The proposed CONFIG diff is applied** in `game/js/world.js`:
  - `difficulty.easy.flakesNeeded` 6 → 8
  - `difficulty.easy.gummyMaxCap` 2 → 1
  - `goldSpeed` 1.6 → 1.35
- **Updated to match:**
  - `tests/unit/run.js` now expects `[8, 8, 10]`.
  - `tests/e2e/functional.js` now expects `ed.need === 8`, with the label updated.
  - `REQUIREMENT.md` now reads "(Easy 8, Hard 10)".
  - The `docs/MECHANICS.md` tables now give `flakesNeeded` 8, gummy cap 1, and `goldSpeed` 1.35 / "35% faster".
  - The in-game how-to text has no per-difficulty numbers, so nothing changed there.
- **Two visual fixes also touch mechanics:**
  - In portrait, items (and their hit radii) are ×1.15. This makes portrait a little easier, and portrait was already the easier orientation.
  - An escaping flake now rises faster. This is visual only.
- **Not re-simulated after these changes:** the sims were not re-run. All unit tests, smoke and the full functional suite pass.
