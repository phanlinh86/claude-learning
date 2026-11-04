# Juno's Moon Stack: high-speed playtest (2026-11-04)

**Harness:** `tests/sim/` (`lib.js` runner and metrics, `players.js` player models, `run.js` full suite, `sweep.js` CONFIG sweeps). It runs headless and deterministic, with 60 fps frames over 1/120 s world steps.

**Volume:** about 4,600 games per configuration. That is 6 bot skills × 3 difficulties × 40 seeds, plus 6 human-like models × 3 difficulties × 40 seeds, plus 3 device layouts, plus about 1,300 single-planet runs for endless pacing. Each game runs to game over or a 10-minute cap. One configuration takes about 2 minutes of wall time.

**Commands:**
- `node tests/sim/run.js` writes the baseline.
- `--proposal` runs the same suite with the CONFIG changes applied in memory.
- `--compare` writes `results/compare.md`.
- `--patched FILE` runs the suite on a world.js with the patch applied.

The full tables are in `tests/sim/results/{baseline,proposal,compare}.md`.

## Player models (they call `world.drop()` directly)
| model | how it plays |
|---|---|
| **kid** (4–6 y) | Looks for 0.8–2.2 s (8 % of the time distracted +2–6 s). Reaction 0.4–0.9 s with partial anticipation, so it is late by about 0.1 s ± 0.08 s. Aim noise sd 0.22 crate width. 8 % random taps, 12 % "late" taps (reacts to the guide without anticipating), 25 % let one pass go by, 12 % double-taps. |
| **kid6** | A 6-year-old: reaction 0.35–0.65 s, anticipates better, aim noise sd 0.16 crate width, 5 % random taps, 8 % late taps. |
| **adult** | Casual adult: reaction 0.2–0.35 s, anticipates well (about 25 ms timing sd), aims at the centre with noise sd 0.07 crate width. |
| **spam** | Taps every 50–150 ms. |
| **waitPerfect** | Frame-perfect: drops on the first frame where `predictLanding().perfect` is true. |
| **coinGreed** | Frame-perfect: waits for a release that grabs a coin and stays, giving up after 6 s. |

## Findings (baseline, 960×540 = iPhone landscape, unless noted)
1. **Easy planet 1 is NOT easy enough for a real 4–6-year-old.**
   - Planet 1 is cleared in **13 %** of games by the kid model and **68 %** by kid6. On iPhone portrait it is 33 % / 90 %.
   - The kid misses **42 %** of drops. 97 % of the hearts lost come from misses, not topples.
   - The cause is the stay window. A release stays on the tower only within **±150 ms** (302 ms in total) of the right moment on Easy Moon. That is shorter than a child's timing spread.
   - The "skill 0.35 bot ≈ 6-year-old" claim in MECHANICS §4 is too optimistic. That bot has zero-mean timing error, while children tap late.
2. **Topples are not rare on Normal and Hard.** They happen in 95–100 % of adult games and cause **67 %** of adult heart losses (Normal 55 misses to 113 topples, Hard 47 to 95).
   - The cause is lean building up. Edge landings sit at rms 0.26 crate width off-centre, and Normal's beam pulls back only 15 %. Most topples fall from the 1st or 2nd joint.
   - Sway is not the cause: with sway switched off, the topple counts stay the same.
   - With these losses a casual adult on Normal survives a median of 135 s and clears 1 planet.
3. **Hard's perfect zone is 17–29 ms (1–2 frames).** It shrinks to about 13 ms in later loops. Perfects on Hard are luck, not skill.
4. **Endless pacing.** One planet attempt with fresh hearts:
   - Clear rates for an adult on Normal: L0 70 %, L4 60 %, L8 47 %, L12 37 %, L16 17 %, L20 10 %.
   - Comet planets in later loops are a wall: L7 3 %, L11 0 %.
   - `loopGoal` +2 makes later planets 18–20+ crates long and 60–76 s.
   - The sawtooth itself is good: each loop restarts on the easier Moon.
5. **Exploits.**
   - **Spam does not work.** It dies in 6–10 s with 0 planets. The 0.25 s drop buffer never chains: kids' double-taps buffered 0 of 374 drops.
   - **Wait-for-perfect** is unbeatable in theory (100 % perfect, no losses, 18–23 planets in 10 min). But a human can only copy it on Easy, where the green guide window is 150 ms. On Normal and Hard the window is 25–56 ms and Hard hides the guide.
   - **There is no time pressure.** A crate can hang forever. For a kids' game that is correct, so it is left as is.
   - **Coin greed pays little.** It collects only about 10 % more coins and scores less than playing for perfects (Easy 25.7k vs 32.7k). It is safe, not dominant.
6. **Other numbers.**
   - Time to the first point is 2–4 s.
   - Time per planet for a casual adult is 47–58 s, inside the 45–90 s target. For kids it is 67–78 s.
   - Grow steps: an adult reaches grow 5 by planet 3. Kids reach about 1, because misses shrink Juno, so they rarely see the twist.
   - No NaN or invariant failures.

## Proposal: exact CONFIG changes (`tests/sim/results/proposal.patch`)
| key | old → new | why |
|---|---|---|
| `difficulty.easy.swing` | 0.72 → **0.6** | The saucer is 17 % slower at the centre, so the window is longer. The Moon period becomes 6.0 s. |
| `difficulty.easy.crate` | 1.15 → **1.35** | Wider crates widen the stay window. With grow 5 a crate is 1.93 units wide, still under the 2.4-unit base. |
| `difficulty.easy.hearts` | 4 → **5** | Covers the 15–20 % of random or late taps any young child makes. The HUD fits 5 hearts (144 px of the 190 px panel). |
| `difficulty.easy.assist` | 0.4 → **0.6** | The beam pulls 60 % of the lean back, so kids almost never topple. |
| `difficulty.normal.perfectTol` | 0.13 → **0.15** | Perfect window 56 → 63 ms. |
| `difficulty.normal.assist` | 0.15 → **0.5** | Topples drop to about 30 % of losses ("rare but real"). |
| `difficulty.hard.perfectTol` | 0.085 → **0.11** | Perfect window 29 → 35 ms. Perfects become skill instead of 1–2-frame luck. |
| `difficulty.hard.assist` | 0 → **0.2** | Hard stays topple-driven (about 50 % of losses) but is less of a coin flip. |
| `loopGoal` | 2 → **1** | Later planets stay 45–60 s. Level 20 needs 15 crates instead of 20. |
| `loopTolMin` | 0.7 → **0.8** | The perfect zone keeps a floor in late loops. |

The stay windows on Easy become 433 ms at L0 and 273 ms at L20 (before: 302 and 181).

## Before → after
The in-memory proposal and the `--patched` world.js give identical numbers (0 rows differ).

| row | P1 clear % | surv p50 s | planets p50 | miss %/drop | topple /100 drops | hearts lost miss:topple | planet time s |
|---|---|---|---|---|---|---|---|
| Easy kid (landscape) | 13 → **55** | 50 → 116 | 0 → 1 | 42.5 → 31.2 | 1.34 → 0.14 | 159:5 → 222:1 | 67 → 82 |
| Easy kid (iPhone portrait) | 33 → **85** | 73 → 162 | 0 → 1 | 28.5 → 21.5 | 2.91 → 0.36 | 157:16 → – | 78 → 88 |
| Easy kid6 (landscape) | 68 → **95** | 111 → 235 | 1 → 2 | 21.6 → 15.4 | 2.11 → 0.39 | 174:17 → 280:7 | 70 → 78 |
| Easy kid6 (iPhone portrait) | 90 → **100** | 198 → 600 | 2 → 7 | 12.6 → 7.8 | 2.17 → 0.20 | – | 75 → 80 |
| Easy adult | 100 → 100 | 600 → 600 | 10 → 11 | 1.3 → 0.5 | 0.58 → 0.00 | 81:36 → 33:0 | 58 → 51 |
| Normal adult | 78 → **100** | 135 → **600** | 1 → 10 | 3.3 → 3.0 | 6.79 → **1.22** | 55:113 → 164:66 | 50 → 47 |
| Normal bot 0.5 | 80 → 98 | 83 → 103 | 2 → 2 | 7.7 → 9.2 | 4.70 → 1.02 | 102:62 → 162:18 | 28 → 28 |
| Hard adult | 55 → 63 | 65 → 80 | 1 → 1 | 5.3 → 6.1 | 10.63 → 6.03 | 47:95 → 77:76 | 47 → 43 |
| Hard bot 0.7 | 58 → 85 | 61 → 94 | 1 → 2 | 7.1 → 6.9 | 7.66 → 2.84 | 72:78 → 136:56 | 35 → 35 |
| Hard bot 0.9 | 100 → 100 | 600 → 600 | 17 → 19 | 0.1 → 0.2 | 0.11 → 0.01 | – | 36 → 32 |

Endless pacing for an adult on Normal (clear %, L0 / L4 / L8 / L12 / L16 / L20):
- before: 70 / 60 / 47 / 37 / 17 / 10
- after: 100 / 97 / 97 / 83 / 77 / 73. It still rises gently. The within-loop climb from Moon to Comet is 100 → 67 %, and Comet in loop 2 is 53 %.

Hard after the change: 53 / 63 / 40 / 20 / 17 / 13 %. It is still hard, with Comet L11 at 0 %.

The ordering of skill and difficulty is kept: Hard < Normal < Easy for every model, and higher bot skill always does at least as well.

## Notes for the team (not applied; game/ is read-only for this report)
- **Apply the patches from the repo root:** `git apply projects/daily-game/fox-moon-stack/tests/sim/results/proposal.patch`.
- **Unit tests need updating.** With the patch, 3 unit tests fail because they hard-code old values: the hard edge rest x assumes assist 0, the loop-1 goal is 14, and Easy has 4 hearts. `tests/sim/results/unit-tests.patch` makes them read CONFIG instead. With both patches applied in a scratch copy, 23/23 pass, including "Easy + bot 0.35 clears planet 1" at 20/20.
- **Docs to update:** MECHANICS §3 (difficulty table) and §4 (sim table), and DESIGN §5.1 ("crates ×1.15, 4 hearts").
- **The grow twist barely reaches kids** (grow ≈ 1). A per-difficulty `growEvery` (for example 3 on Easy) would need a small code change, not just CONFIG.
