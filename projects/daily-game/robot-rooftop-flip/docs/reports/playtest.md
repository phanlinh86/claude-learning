# Bolt's Rooftop Flip — high-speed playtest report

**Verdict:** the core works. It is deterministic, it never produced a NaN or a stuck state, the levels run to time, spamming is a losing strategy and Normal and Hard are fair. **Easy is too hard for the 4–6-year-old it is meant for.** A kid model finishes Dawn on Easy in only 79 % of rounds, has 2 of 5 batteries left at the Dawn arch, and reaches Sunset in only 23 % of rounds. A three-value **CONFIG-only** change to `difficulty.easy` fixes this (Dawn 93 %, Sunset 52 %, 3 batteries left) and leaves Normal and Hard exactly as they are. A second, optional finding is that **reading colours barely pays** on Normal and Hard. A small code patch for that is attached separately.

Everything below can be reproduced with `node tests/sim/run.js` (about 4 min on 2 cores). Report only: nothing in `game/` was edited.

## 1. How it was tested
- Headless `RF.World` + `RF.Bot` in a node vm (`tests/sim/lib.js`), 960×540, 60 fps frames (the world itself runs at 1/120 s sub-steps), and at most 600 s per round.
- **5,400 rounds** for the main table: 18 players × 3 difficulties × 100 seeds. Another 5,400 were run with the proposal, plus about 1,700 for sweeps, the colour test, frame rates and determinism.
- Player models (`tests/sim/players.js`). Every model taps through `world.flip()`, the real input path.

| model | what it does |
|---|---|
| bot skill 1 / 0.8 / 0.5 / 0.3 | the stock `RF.Bot` |
| **kid 4–6 (base)** | Watches the next hazard on its own surface once it is on screen and aims to tap about 0.6 s before it (sd 0.15). Its finger is off by +0.08 s ± 0.18 s. It can act only 0.6–1.1 s after each landing or drone drop, because it has to re-orient. Per hazard: 5 % forgets, 8 % distracted for 0.5–2 s, 6 % misreads a hazard on the *other* surface as its own and flips toward it. It also taps at random (0.08 /s, about 5 per minute), double-taps 10 % of the time (the buffer then turns it into a flip-back), and chases firefly groups with 35 % colour confusion. It never checks where it will land. |
| kid, struggling 4 y | reaction 0.8–1.1 s, ±0.22 s, forgets 8 %, random taps 0.12 /s, misreads 10 %, double-taps 15 % |
| kid, steady 6 y | reaction 0.6–0.8 s, ±0.14 s, forgets 3 %, random taps 0.05 /s, misreads 4 %, double-taps 6 % |
| casual adult | Reaction 0.3–0.5 s, aims 0.38 s ahead, timing ±0.07 s. It looks at the landing spot 90 % of the time and makes optional flips for its own colour (and to dodge wrong colours). |
| colour-ignorer | adult timing, chases every firefly group whatever its colour, never dodges |
| hazards only | adult timing, never flips for fireflies |
| never taps · flip on every landing · spam every 80/150/250/400/700/1000 ms (±15 %) | exploit probes |

> The kid models are assumptions; nobody measured them on real children. They are tuned to be plausible: anticipation timing errors of 5-year-olds are about ±150–200 ms at slow speeds, and the random taps, double-taps and misreads are typical of 4-year-olds on touch screens. The proposal is checked against all three kid variants, so it does not depend on one guess.

## 2. Baseline (current CONFIG): key numbers
Full tables: `tests/sim/results/baseline.md`.

### Survival (p50 s; % of rounds reaching Noon / Sunset / Night / round 2; batteries left at the Dawn arch, p50)
| | Easy | Normal | Hard |
|---|---|---|---|
| kid, struggling 4 y | 56 s · 40/0/0/0 % · 1 | 23 s · 0 % | 18 s · 0 % |
| **kid 4–6** | **104 s · 79/23/3/0 % · 2 of 5** | 29 s · 4 % | 23 s · 2 % |
| kid, steady 6 y | 171 s · 97/70/31/16 % · 3 | 44 s · 23/5 % | 39 s · 8 % |
| casual adult | 600 s (cap) · 100 % · 5 | 241 s · 79/70/57/43 % · 2 of 3 | 162 s · 86/52/37/25 % · 2 |
| bot 1 / 0.8 | 600 s, 0 / 0.12 hits/min | 600 s, 0 / 0.17 hits/min | 600 s, 0 / 0.24 hits/min |
| bot 0.5 | 600 s · 100/100/96/88 % | 184 s · 81/62/41/25 % | 121 s · 71/46/28/15 % |
| bot 0.3 | 276 s · 99/89/74/48 % | 100 s · 64/29/11/3 % | 59 s · 46/21/6/0 % |

Hits per minute (bumps + falls): kid 3.37 / 5.53 / 6.94, adult 0.51 / 1.06 / 1.43 (Easy / Normal / Hard). Time to first point is 0.6–0.9 s for every player: the welcome line works. Time to first hit (p50): kid 13 s, adult 80 s on Easy, 31 s on Normal and 33 s on Hard.

### Exploits (Easy / Normal / Hard, survival p50)
| | Easy | Normal | Hard |
|---|---|---|---|
| never taps | 33 s (first hit after 6 s) | 15 s | 13 s |
| flip on every landing | 24 s | 12 s | 11 s |
| spam 80 / 150 / 400 / 1000 ms | 25 / 25 / 26 / 31 s | 12 / 12 / 13 / 14 s | 11 / 10 / 11 / 12 s |

- **Spamming is the worst strategy in the game.** It does worse than never tapping and far worse than even the struggling-4-year-old model (56 s). Ping-ponging keeps Bolt in the air, so he lands blind on gaps and flies through vents and signs: 11–16 hits a minute. Spam scores 990 on Easy against the kid's 4,290 and the adult's 36,000. Nobody reaches the first arch. **There is no exploit to fix.**
- Never-tap is not instant. The first 3 s (Easy) or 2 s are empty, the first hit comes at about 6 s, and game over at 33 s on Easy or 13–15 s on Normal and Hard.

### Pacing
Every difficulty and every loop runs **62.2 / 68.2 / 72.2 / 76.2 s** (Dawn / Noon / Sunset / Night). Round 2 and 3 dawns take 61.7 and 61.6 s, and one round takes about 4.6 min. All of this is inside the 60–80 s aim, and it is the same at 30, 60 and 144 fps (bot 0.5, Normal).

### Health and determinism
- 0 NaN frames, 0 frames out of the corridor, 0 stalled frames in over 15,000 rounds. The longest drone rescue was 1.78 s.
- The same seed with the same player gives a bit-identical game. Replaying the recorded taps by sub-step index through `_step()` gives the same score and batteries (6/6 cases).
- The bot at 30, 60 and 144 fps gives the same distributions. The 144 fps bot is slightly better, only because it reacts every frame.

### Timing windows (from a hand-made one-hazard track)
How late you can tap, in ms of time left before Bolt's centre reaches the near edge. The earliest guaranteed-safe tap comes from generator rule 2.

| | vent (AC) | chimney | sign | gap | earliest guaranteed |
|---|---|---|---|---|---|
| Easy dawn | 152 ms before | 194 | 160 | 190 ms *after* the edge (coyote) | 1058 ms before |
| Normal dawn | 183 | 233 | 192 | 175 after | 990 |
| Hard night | 175 | 209 | 184 | 150 after | 910 |

That gives a window of about 0.85–0.9 s for obstacles and about 1.1–1.25 s for gaps: roomy for adults. Gaps are already very forgiving, and **obstacles are the kid's problem** (80 % of the kid's hits are bumps).

## 3. Findings
### F1 — Easy is too hard for 4–6-year-olds (fix: CONFIG, §4)
The goal is that a kid usually finishes Dawn and often Noon on Easy, with batteries left. Today the base kid finishes Dawn in 79 % of rounds (the struggling 4-year-old in 40 %), with a median of 2 of 5 batteries left at the arch, and finishes Noon in only 23 %. The kid takes about 3 hits per Dawn.

What causes the kid's hits on Easy (`node tests/sim/causes.js`, 889 hits):
| cause (last tap < 1.5 s before the hit) | share |
|---|---|
| random tap: lands on the other surface right next to a hazard | 28 % |
| double tap: the buffer turns the second tap into a flip-back | 20 % |
| misread a hazard on the other surface and flipped toward it | 16 % |
| own planned tap, too late | 11 % |
| forgot to tap | 10 % |
| no tap in the last 1.5 s (late notice after a landing, distraction) | 9 % |
| chased fireflies | 5 % |

About 70 % of the hits are **self-inflicted flips onto the other surface**. That surface is guaranteed clear only around hazards on the kid's *own* side, so these flips land among hazards. The sweeps (`tests/sim/sweep.js easy`) tried every lever:

| Easy-only change (kid 4–6: reach Noon / Sunset %, batteries at the Dawn arch) | result |
|---|---|
| base | 80 / 24 · 2 |
| `hitK` 0.8 → 0.6 | 83 / 32 · 2 |
| `extra` [0.5, 1.6] → [0.8, 2.0] | 83 / 35 · 3 |
| `reaction` 1.4 → 1.8 | 78 / 34 · 2 |
| `speed` 0.78 → 0.70 | 75 / 17: **worse** (more time on screen near each hazard; the level lasts the same seconds) |
| `gapShare` 0.30 → 0.20 | 76 / 21: no help (gaps were never the problem) |
| global `buffer` 0.18 → 0.12 / `invuln` 1.5 → 2.0 | 78 / 22 · 80 / 23: no help, and they would change Normal and Hard too |
| `hearts` 5 → 6 | 92 / 42, but REQUIREMENT fixes Easy at 5 batteries: rejected |
| **reaction 1.8 + extra [0.8, 2.0] + hitK 0.6 (proposed)** | **92 / 53 · 3** (200 seeds) |
| … with extra [1.0, 2.4] | 96 / 63 · 3, but Easy dawn falls to about 12.6 hazards a minute (sparse) and the existing unit test "Easy gapShare < Normal" fails on its sample: not chosen |

### F2 — Normal is a fair challenge and Hard is hard but fair: no change
- A perfect player is never hit on Normal or Hard (bot 1: 0 hits in 100 × 10 min), and bot 0.8 survives 10 min in 100 % and 99 % of rounds. The difficulty is skill, not luck.
- A casual adult on Normal lasts a median of 4 min (p10 48 s, p90 at the 10-min cap) and gets past Dawn → Night in 79 / 70 / 57 %. That is a good first-session arc. On Hard: 2.7 min median, 52 % reach Sunset and 25 % finish round 1.
- Normal and Hard do not change with the proposal: the tables are bit-identical (`results/compare.md`).

### F3 — Reading colours barely pays, and the ×5 multiplier is rare on Normal and Hard (optional code fix)
- Today a line of 3–5 fireflies mixes colours per firefly (65 % match). You cannot avoid the wrong one in a line without leaving the surface, so **purity is about 68–72 % for every player, even "never taps"**. The colour-aware adult and the colour-ignorer score the same: 1,261 vs 1,241 pts/min on Normal and 1,353 vs 1,372 on Hard. Wrong fireflies break the combo on Normal and Hard, so the adult reaches ×5 in only **15–20 % of rounds** and only 30 % of catches are at ×2 or more.
- CONFIG-only alternative: `gen.match` 0.65 → 0.8 lets the adult reach ×5 in 83 % of rounds on Normal, but the colour-ignorer still matches the adult (1,829 vs 1,888 pts/min). It hands out the combo without rewarding colour reading, so it is **not recommended**.
- Code alternative: **one-colour lines** (`tests/sim/results/proposal-mono-lines.patch`, adds `CONFIG.gen.lineMono: true`; a line is one colour like a cluster, and never straddles a gate). From `tests/sim/colour.js`, Normal: adult 2,013 pts/min against the ignorer's 1,800 (+12 %) and hazards-only 1,541. The adult reaches ×5 in 90 % of rounds and 61 % of catches are at ×2+. The skilled bot goes from 1,551 to 2,825. On Hard the adult and the ignorer are level (2,015 vs 2,018), because risky optional flips cost batteries there; that is a fair risk/reward trade. The overall match share is unchanged. With this patch the unit tests still pass 22/22. **It is not part of the CONFIG patch**; it is an integrator decision because it changes DESIGN §4 ("lines" mixed).
- On Easy, wrong fireflies never break the combo (by design), so 99 % of catches are at ×2+ and everyone sits at ×5. Easy scores (about 36k in 10 min) are about 7× Normal. Best scores are saved per difficulty, so this is fine for kids.

### F4 — Smaller observations (no change proposed)
- On Normal, the colour-ignorer outlives the colour-aware adult (median 433 vs 241 s). This is an artefact of the model: the adult's extra dodge flips cost batteries. Optional flips are risky, and today they are not worth it (see F3).
- Measured hazard density (`run.js`, density section): Easy 21–23 a minute, a little above MECHANICS §3's 19–23 because this count includes the stretch after each arch. Normal is 30–34 and Hard 39–43.
- The first gate of a run comes 6–9 s in, and there are 5–7 gates per level: fine.

## 4. Proposal: CONFIG-only (Easy only)
**Patch:** `tests/sim/results/proposal.patch` (it changes the `difficulty.easy` line in `game/js/world.js` and refreshes its comment). Apply it with `git apply` from the repo root or from the project folder.

| key | old → new | why |
|---|---|---|
| `CONFIG.difficulty.easy.reaction` | **1.4 → 1.8** s | At least 1.8 s between two forced flips. A kid needs 0.6–1.1 s to re-orient after a landing, so there was almost no margin. |
| `CONFIG.difficulty.easy.extra` | **[0.5, 1.6] → [0.8, 2.0]** s | More calm after each hazard: fewer chances for a stray tap to land next to something. Easy dawn goes from 20.9 to 17.0 hazards a minute (one every 3.5 s), still lively. |
| `CONFIG.difficulty.easy.hitK` | **0.8 → 0.6** × | The obstacle hit box becomes 48 % × 53 % of the drawn vent or sign. Running into one still always bumps: Bolt's feet are 0.17 u up and the lowest hit box top is 0.33 u. A flip that grazes a corner, a late tap or a landing next to it is forgiven. The latest safe tap before a vent moves from 152 to 85 ms. |

### Before → after (Easy, 100 rounds per row; `tests/sim/results/compare.md`)
| player | survival p50 | reach Noon / Sunset / Night / round 2 | batteries at Dawn arch | hits/min | Dawn hits | score p50 |
|---|---|---|---|---|---|---|
| kid, struggling 4 y | 56 → **86 s** | 40/0/0/0 → **65/18/3/0 %** | 1 → **2** | 4.94 → 3.68 | 4.34 → 3.63 | 1,940 → 3,240 |
| **kid 4–6** | 104 → **151 s** | 79/23/3/0 → **93/52/20/4 %** | 2 → **3** | 3.37 → 2.58 | 3.12 → 2.56 | 4,290 → 6,540 |
| kid, steady 6 y | 171 → **310 s** | 97/70/31/16 → **99/91/69/51 %** | 3 → **4** | 2.18 → 1.60 | 2.16 → 1.56 | 8,690 → 15,590 |
| casual adult | 600 → 600 s | 100 % → 100 % | 5 → 5 | 0.51 → 0.22 | 0.57 → 0.25 | 36,040 → 34,690 |
| bot 0.5 / 0.3 | 600 / 276 → 600 / 589 s | — | — | 0.97 / 1.60 → 0.58 / 1.10 | — | — |
| never taps | 33 → 38 s | 0 % | — | 8.9 → 7.8 | — | 690 → 740 |
| spam 150 ms / flip on every landing | 25 / 24 → 33 / 35 s | 0 → 2 / 1 % | — | 11.5 → 8.8 | — | 990 → 1,490 |

- Every goal is met. The 4–6-year-old **usually finishes Dawn (93 %) and often Noon (52 %) with batteries left** (3 of 5 at the Dawn arch, 2 at the Noon arch). Even the struggling 4-year-old now clears Dawn about two times in three.
- Spamming is still clearly worse than playing on Easy: 33 s against the kid's 151 s, and it never gets far.
- Pacing is unchanged at 62.2 / 68.2 / 72.2 / 76.2 s. First point at 0.9 s, first hit for the kid at 17 s (was 13 s).
- **Normal and Hard: identical** (the same numbers in every cell).
- Checks: the patch applied to a copy of `world.js` gives the same results as the in-memory overrides on all 42 human and exploit rows (`--patched`, to within 1e-9). Fireflies per minute on Easy dawn go from 133 to 121.

### Unit tests with the patch (run on a scratch clone, real files untouched)
- `proposal.patch` alone: **21/22**. The only failure is a sample-size guard in the fairness test, `assert.ok(hz.length > 150)` over 160 screens. A calmer Easy generates about 136–146 hazards there. With the guard lowered, every fairness check in that test passes.
- `proposal.patch` + **`tests/sim/results/unit-tests.patch`** (that guard 150 → 120, one line): **22/22 pass**.
- `proposal.patch` + `unit-tests.patch` + `proposal-mono-lines.patch`: **22/22 pass**.

### Docs to update with the patch (integrator)
- DESIGN.md §5.1 fairness ("reaction … easy 1.4 s") → 1.8 s.
- MECHANICS.md §3 difficulty table (Easy reaction 1.8 s, extra calm 0.8–2.0 s, hitK ×0.6) and §3/§6 "Easy 19 hazards/min" → about 17.

## 5. Files
- `tests/sim/run.js`: everything above. `--proposal` (in-memory overrides from `proposal-config.json`), `--patched FILE`, `--compare`, `--seeds N`, `--time S`, `--only bots,humans,exploits,late,density,det,fps,loop`.
- `tests/sim/lib.js` (harness and metrics), `tests/sim/players.js` (models), `tests/sim/sweep.js` (CONFIG sweeps), `tests/sim/causes.js` (kid hit causes), `tests/sim/colour.js` (colour-reading test).
- `tests/sim/results/`: `baseline.*`, `proposal.*`, `patched-partial.*`, `compare.md`, `colour.md`, **`proposal.patch`**, `unit-tests.patch`, `proposal-mono-lines.patch` (optional).
