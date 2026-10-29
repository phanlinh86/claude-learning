# Foxy's Reef Memory: high-speed playtest and design evaluation

Date: 2026-10-29. Tester: the high-speed playtest agent. Code under test: `game/js/world.js` (RF.CONFIG, RF.DIFFICULTY, RF.World) and `main.js` `difficultyOverrides()`. I changed no game code.

**Verdict:** the core loop works. It runs with no errors and no stuck states. The first level is a safe win for a child, and the pacing is fine. Three things need tuning before release:
1. Random mashing beats the memory game.
2. Endless laps never end for good players.
3. The gravity twist barely changes the difficulty.

Each has an exact fix below, checked with before/after sims.

## How to reproduce

| What | Command (from the project folder) | Time |
|---|---|---|
| Baseline grid: 3 difficulties × 4 peeks × 7 player models × 30 seeds = 2,520 games | `node tests/sim/run.js baseline 30` | about 28 min on 2 cores |
| Gravity on vs off: 4 models × 100 seeds × 2 | `node tests/sim/run.js gravity 100` | about 8 min |
| Tuning variants: 4 variants × 3 difficulties × 6 models × 30 seeds | `node tests/sim/run.js tuning 30` | about 15 min |
| Final package with a long cap (48 levels or 60 min) | `node tests/sim/run.js final 30` | about 12 min |
| Browser soak at speed 16 + frame times at 1920×1080 | `node tests/e2e/playtest.js 4 8793` (starts its own `http.server`) | about 6 min |

The results (tables in `.md`, raw data in `.json`) are in `tests/sim/results/`. Screenshots go to `tests/out/playtest_*.png`, which is gitignored.

### Player models (`tests/sim/players.js`)

The models act only through `world.select()`. They learn only what a person can see: their own flips, the open pair and the peek. A memory note says "this face is in that cell". When a `slide` event arrives, each remembered card that moved is either followed (`track`), dropped, or left at its old cell (`staleFrac`). A stale note is what really happens to a child who did not watch the slide.

| Model | Think s per pick | Memory cap | Forget per move | Location slip | Follows a slide | Random impulse | Watches the mismatch | Peek reading |
|---|---|---|---|---|---|---|---|---|
| kid6 (6-year-old) | 1.5–3.0 | 5 | 10 % | 12 % | 30 % (60 % of misses go stale) | 12 % | 90 % | 1 card/s |
| kid9 | 1.0–2.0 | 6 | 7 % | 7 % | 45 % | 7 % | 70 % | 1.5/s |
| casual adult | 0.8–1.5 | 8 | 4 % | 4 % | 65 % | 4 % | 40 % | 2/s |
| strong player | 0.5–0.9 | 14 | 1 % | 1 % | 92 % | 0 | 10 % | 3.5/s |
| random (fast masher) | 0.25–0.45 | none | | | | 100 % | taps through | |
| randomSlow (toddler poking) | 0.7–1.2 | none | | | | 100 % | 50 % | |
| sweeper | 0.3–0.5 | none; flips in reading order, starting one card later on each wrap | | | | | | |

The sim skips Foxy and the cupcakes (`_stepFox`/`_stepCupcakes`) for speed. They have no effect on air, score or cards. `SIM_FULL=1` turns them back on.

## 1. Results with the current values

### Clear rates and session length, Settings peek = 1 s (the shipped default)

Percentages are the share of games that cleared that level. "Lap 2" means levels 5–8. Each row is 30 games. Games stop at 24 levels or 30 min.

| Model | Diff | Spring | Summer | Autumn | Winter | Lap 2 | Typical loss | Session, min (p10–p90) |
|---|---|---|---|---|---|---|---|---|
| kid6 | easy | 100 % | 100 % | 90 % | 77 % | 53 % | Autumn/Winter, lap 3 | 16.0 (6.7–20.8) |
| kid9 | easy | 100 % | 100 % | 100 % | 100 % | 100 % | almost never (80 % hit the cap) | 25.0 |
| casual | easy | 100 % | 100 % | 100 % | 100 % | 100 % | never | ≥ 17 (cap) |
| kid6 | **normal** | **100 %** | 73 % | 27 % | 7 % | 0 % | Autumn, lap 1 (47 %) | **4.0** (2.5–6.3) |
| kid9 | normal | 100 % | 100 % | 100 % | 100 % | 93 % | Autumn/Winter, lap 3 | 11.8 |
| casual | **normal** | 100 % | 100 % | 100 % | 100 % | 100 % | lap 5–6 | **14.7** (12.9–16.0) |
| strong | normal | 100 % | 100 % | 100 % | 100 % | 100 % | **never** | 19.8 at a 48-level cap |
| **random** | **normal** | **97 %** | **93 %** | **73 %** | **37 %** | 3 % | Winter, lap 1 | 5.2 |
| random | easy | 100 % | 100 % | 93 % | 90 % | **63 %** (beats kid6) | lap 3 | 15 |
| randomSlow | normal | 47 % | 3 % | 0 | 0 | 0 | Spring/Summer | 1.2 |
| sweeper | any | 27–30 % | 0 | 0 | 0 | 0 | Spring | 1–2 |
| kid6 | hard | 47 % | 17 % | 0 | 0 | 0 | Spring | 0.9 |
| kid9 | hard | 100 % | 97 % | 93 % | 87 % | 3 % | Autumn, lap 2 | 6.1 |
| casual | hard | 100 % | 100 % | 100 % | 100 % | 100 % | lap 4 | 8.7 |
| strong | hard | 100 % | 100 % | 100 % | 100 % | 100 % | 67 % never die | ≥ 19.6 |

The full grid, with all four peek settings and all models, is in `tests/sim/results/baseline.md`.

### Per level, lap 1, Normal with a 1 s peek

| Model | Level | Clear if reached | Play s | Air left at clear | Lowest air | Mistakes per pair | Max combo | Air-bonus share of the level score |
|---|---|---|---|---|---|---|---|---|
| kid6 | Spring (6 pairs) | 100 % | 53 | 26 s (43 %) | 38 % | 0.9 | 3 | 36 % |
| kid6 | Summer (8) | 73 % | 73 | 21 s (30 %) | 26 % | 1.1 | 3 | 23 % |
| kid6 | Autumn (10) | 36 % | 104 | 12 s (14 %) | 10 % | 1.4 | 2 | 13 % |
| kid6 | Winter (12) | 25 % | 120 | 17 s (17 %) | 14 % | 1.5 | 2 | 15 % |
| kid9 | Spring → Winter | 100 % all | 32 → 83 | 46 → 53 s (77 → 53 %) | 72 → 50 % | 0.7 → 1.1 | 3–4 | 48 → 35 % |
| casual | Spring → Winter | 100 % all | 21 → 50 | 57 → 86 s (**95 → 86 %**) | **87 → 80 %** | 0.5 → 0.8 | 3–4 | 50 → 45 % |
| strong | Spring → Winter | 100 % all | 12 → 26 | full | 95 % | 0.3 → 0.5 | 4–6 | 48 → 42 % |

### What the numbers say

- **First level.** It is a safe, fun win for a kid. On Easy, kid6 clears Spring 100 % at every peek setting and never drops below 63 % air. On Normal, kid6 clears Spring 100 % with peek ≥ 1 s and 93 % with peek off.
- **Session length.** A kid on Normal plays about 4 min, which is on target (3–6). An adult on Normal plays 14.7 min, which is too long (target 6–12). The cause is that lap 1 puts no pressure on an adult: the casual player never drops below 80 % air. A strong player never dies on Normal or Easy, and 67 % never die on Hard. The browser soak shows the same: a skill-1 bot reached level 108–163 at speed 16 without one game over, and even a weak skill-0.35 bot played 20 game-minutes and reached level 38.
- **Exploit: mashing.** Mashing beats remembering. A random clicker at about 3 taps/s clears Summer 93 % of the time and the whole first lap 37 % on Normal. On Easy it beats a 6-year-old who is really trying (lap 2: 63 % vs 53 %). The cause is that a mismatch costs nothing and a 3rd tap skips the 0.8 s display. A random player needs about n² moves, but at 0.2–0.5 s per move that still fits inside 60–100 s of air. Two cases are fine: a toddler poking about once a second wins Spring about half the time on Normal, which is kind, and the reading-order sweeper fails.
- **Lap ramp.** It is fair but too flat for adults. `lapAirMul 0.8` with a floor of `0.3` stops tightening at lap 6. Anyone who clears 6 pairs in about 15 s then plays forever.
- **Combo and score.** The score pacing works. Median best combo: kid 3–4, adult 7, strong 8–9. So ×2/×3 appear every level and the ×5 cap is a stretch goal for adults. The air bonus is 35–64 % of each level's score, though, so on Easy the score mostly rewards waiting less, not matching well.
- **Peek.** It matters for children. kid6 on Normal, autumn clear rate: 27 % with a 1 s peek, 53 % with 2 s. It hardly matters for adults. **Bug-ish:** `RF.DIFFICULTY.easy.peekTime = 2` is dead code. `main.js difficultyOverrides()` always overwrites it with the Settings value, which defaults to 1 s, so Easy really gets a 1 s peek.

## 2. Does the gravity twist change difficulty? (`gravity.md`, 100 games each, Normal, peek 1)

| Model | Level | Cards slid per level | Mistakes/pair, gravity on → off | Play s on → off | Clear if reached on → off |
|---|---|---|---|---|---|
| kid6 | Spring | 5.2 | 0.9 → 0.8 | 50 → 49 | 100 → 99 % |
| kid6 | Autumn | 15.7 | 1.4 → 1.3 | 101 → 99 | 51 → 57 % |
| kid6 | Winter | 14.0 | 1.4 → 1.4 | 122 → 116 | 33 → 40 % |
| kid9 | Autumn | 18.7 | 1.1 → 0.9 | 64 → 61 | 100 → 100 % |
| casual | Autumn / Winter | 18.6 / 16.7 | 0.7 → 0.7 / 0.8 → 0.7 | 40 → 38 / 51 → 49 | 100 → 100 % |
| strong | all | 5–18 | no change | +1–2 s | 100 → 100 % |

Whole game: kid6 death level 3.0 → 3.5 and session 4.2 → 4.8 min. kid9 12 → 14. Casual and strong: no change.

**Finding:** the twist is a nice touch, but it is only a gentle difficulty knob. It costs a child about 6–7 points of clear rate in Autumn and Winter, and costs adults only 1–3 s of waiting for slides. Only the cards in the emptied column or row move, and people mostly remember the cards they have just seen. That is fine for lap 1, which should stay readable for kids. To make the twist matter later, I tested an optional "whirlpool" from lap 2 (see P5): a removal packs the whole board along the current, so cards hop between rows. It raises lap-2 mistakes by about 0.1–0.2 per pair and costs kid9 a lap (lap 2 cleared: 67 % → 33 %).

## 3. In-browser playtest (`tests/e2e/playtest.js`, `results/e2e_playtest.json`)

| Check | Result |
|---|---|
| Soak, 2 min each at speed 16: bot skill 1, then skill 0.35, with `autorestart` | **0 page errors, 0 console errors, 0 anomalies.** Checked: NaN or out-of-range card positions, two cards in one cell, Foxy out of bounds, air > airMax, effects / particles / cupcake list growth. |
| Seasons reached | All 4 seasons in both runs. Skill 1 reached level 108 (lap 28) with no game over. Skill 0.35: 1 game, level 38, score 8,360, 1,195 game-seconds, then the autorestart worked. |
| Resource bounds | Renderer effects ≤ 50, weather particles ≤ 80, cupcake list ≤ 4. Nothing grows over time. |
| Frame time, Winter (level 3), 1920×1080, speed 1, adaptive off | `draw()` 11.5 ms mean / 14.1 ms p95. Simulation step 0.25 ms. rAF median 33 ms (about 32 fps). The sandbox renders in software and is compositor-bound; on a GPU-backed WebView2 the draw cost is what matters, and it fits in 16.7 ms. |
| Same, Spring | draw 11.4 ms, rAF median 16.7 ms (45 fps mean). |
| Adaptive quality | **Weak spot.** With frames alternating 16 / 33 ms (about 37 fps), `adapt()` (`_slow` +1 per slow frame, −2 per fast frame, step down at 70) sat at 13–49 and never stepped down in one run; in the next run it stepped down to 1.125×. On a weak laptop the game can stay at about 35 fps at full resolution. Suggestion for the integrator: step down when an EMA of frame time > 20 ms for 1.5 s. |
| Harness note | `getState().air` is rounded with `toFixed(2)`, so it can read 0.01 above airMax. The check now allows a 0.01 tolerance. |
| Visual note | In the Winter screenshot, the **scallop face (face_09) looks like the clam-shell emblem on the card back**. A child can mistake a face-up scallop for a face-down card. Suggest swapping that face for a sea urchin or a manta ray (a unique silhouette and colour, as DESIGN §4.1 requires). |

## 4. Recommended tuning (exact values), with before/after evidence

Every proposal is simulated in `tests/sim/proposals.js`. P1 is a small rule (about 6 lines in `World._resolve`). The rest are config values.

### P1: anti-mash. A mismatch that re-flips an already-seen card costs a little air (highest priority)

- Rule: in `_resolve()` on a mismatch, if either card has been face-up before in this level (track `k.seen = true` when a card's flip completes, and set it during the peek), do `air = max(min(air, 1), air − mismatchPenalty)`. This never takes air below 1 s, so a penalty never kills. Exploring two never-seen cards stays free.
- Values: `RF.DIFFICULTY.easy.mismatchPenalty = 0.5`, `normal: 1` (CONFIG), `hard: 1.5`.
- UX: show a small "−1" bubble from the air meter and a softer "blub". Foxy's "oops" face already plays.

| Normal, peek 1 | Spring | Summer | Lap 1 | Session |
|---|---|---|---|---|
| random masher, before → after | 97 → **73 %** | 93 → **43 %** | 37 → **0 %** | 5.2 → 1.4 min |
| kid6, before → after | 100 → 100 % | 73 → 70 % | 7 → 3 % | 4.0 → 3.7 |
| kid9 | 100 → 100 % | 100 → 100 % | 100 → 100 % | 11.9 → 10.9 |
| Easy: masher lap 1 | 90 → 33 %; kid6 lap 1 77 → 73 % | | | |
| Hard: masher Spring | 90 → 23 % | | | |

### P2: endless laps that end

| Key | Easy | Normal | Hard |
|---|---|---|---|
| `lapAirMul` | 0.88 → **0.85** | 0.8 → **0.7** | 0.75 → **0.7** |
| `lapAirMin` | 0.5 → **0.4** | 0.3 → **0.15** | 0.3 → **0.12** |

### P3: friendlier kid curve, a fairer score, and a real peek default

| Key | Easy | Normal | Hard |
|---|---|---|---|
| `airMax` (Spring, Summer, Autumn, Winter) | [90,105,125,145] → **[90,110,135,160]** | [60,70,85,100] → **[60,75,95,115]** | unchanged [40,50,62,75] |
| `airBonusPerSec` | 2 → **1** (all difficulties) | | |
| Default peek (Settings) | **2 s** | **1 s** | **0 s** |

- To make the peek default work, add an "Auto" option (default) to Settings → Peek. Auto uses the difficulty's preset peek, and 0–3 s stays as an override. In `difficultyOverrides`, apply `o.peekTime = peek` only when the choice is not Auto.
- `airPerMatch` (3, Easy 4, Hard 2), `comboCap 5`, `pointsPerMatch 10` and `mismatchShow` (0.8 / Easy 1.0 / Hard 0.6) are fine. Keep them; the sims gave no reason to change them.
- Slide speeds (`slideAccel 900`, `slideMaxSpeed 260`) are fine. Waiting for slides costs adults only 1–3 s per level and the slides look readable.

### Final package (P1 + P2 + P3), long cap of 48 levels / 60 min (`final.md`, 30 games each)

| Model, setting | Lap 1 before → after | Lap 2 before → after | Median death before → after | Session min before → after | Target |
|---|---|---|---|---|---|
| kid6, Normal | 7 → 10 % | 0 → 0 % | #3 Autumn → #3 Autumn | 4.0 → **4.0** | kid 3–6 ✔ |
| kid9, Normal | 100 → 100 % | 93 → 67 % | #12 → #9 | 11.9 → **9.1** | ✔ |
| casual, Normal | 100 → 100 % | 100 → 100 % | #22 → #15 (Autumn, lap 4) | 14.8 → **10.2** (9.4–11.4) | adult 6–12 ✔ |
| strong, Normal | 100 → 100 % | 100 → 100 % | **never → #23** (Autumn, lap 6) | 19.8 (cap) → **9.3** | ✔ |
| casual, Hard | 100 → 100 % | 100 → 70 % | #13 → #10 | 8.8 → **6.5** | ✔ |
| strong, Hard | 100 → 100 % | 100 → 100 % | never (67 %) → #17 | 19.6 → **7.1** | ✔ |
| kid6, Easy | 77 → **87 %** | 53 → 43 % | #11 → #8 | 16.1 → 14.4 | first lap kinder ✔ |
| kid9, Easy | 100 → 100 % | 100 → 100 % | #31 → #27 | 31 → 27 | long, but it is Easy |
| random masher, Normal | 37 → 0 % | 3 → 0 % | #4 → #2 | 5.2 → 1.5 | ✔ |

## 5. Small fun additions, ranked by fun per effort (the core spec is unchanged)

1. **Pearl pair** (about 25 lines in world.js plus a glow in render.js). One random pair per level has a pearly shimmer when face-up. Matching it gives +5 s air, and its cupcake is golden (+2 cupcakes). It is a small surprise each level, gives kids a reason to cheer, and costs nothing in difficulty tuning.
2. **Creature name pop + per-creature chime** (about 15 lines in render.js and audio.js). On a match, show "Octopus!" in big friendly text, with a unique pitch per face. It gives young players reading and vocabulary value and makes each match feel different. No art needed.
3. **Easy-mode Foxy hint when air is low** (about 30 lines). On Easy only, once per level when air < 25 %, Foxy swims over and taps one card of a pair the player has already seen; that card glows for 1 s. It stops a 6-year-old's run from ending in frustration (kid6 Easy dies in Autumn or Winter 13–23 % of the time on lap 1).
4. **(Optional) Whirlpool laps** (about 25 lines in `_applyGravity`, simulated as `flowFromLap: 1`). From lap 2, a removal packs the whole board along the current, so cards hop between rows. It gives adults a fresh challenge on later laps without touching lap 1: casual Normal session 10.2 → 9.4 min, kid9 lap 2 67 → 33 %. Use it only if the team wants the twist to matter more; P2 already fixes the session length.

## 6. Prioritised change list

1. **P1 anti-mash penalty**: `mismatchPenalty` Easy 0.5 / Normal 1 / Hard 1.5, applied only when a re-flipped card was seen before, never taking air below 1 s.
2. **P2 lap ramp**: `lapAirMul` / `lapAirMin` set to Easy 0.85 / 0.4, Normal 0.7 / 0.15, Hard 0.7 / 0.12.
3. **Peek default per difficulty**: add a Settings "Auto" option so Easy really gets 2 s (today it silently gets 1 s); Normal 1 s, Hard 0 s.
4. **P3 air and score**: `airMax` Easy [90,110,135,160] and Normal [60,75,95,115]; `airBonusPerSec` 1.
5. **Swap the scallop face** (face_09), because it looks like the card back.
6. **Adaptive quality**: trigger on an EMA of frame time > 20 ms over 1.5 s.
7. Fun additions in the order of section 5.
