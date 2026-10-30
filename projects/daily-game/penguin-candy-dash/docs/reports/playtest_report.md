# Pip's Candy Dash: high-speed playtest report

Date: 2026-10-29. Code tested: `game/js/world.js` as delivered (CONFIG and DIFFICULTY unchanged; nothing in `game/` or `app/` was edited).

**How to re-run**
- `node tests/sim/run.js baseline 40`: current values, 17 models × 3 difficulties, about 7 min on 2 cores.
- `PROPS=final NOCURRENT=1 TAG=final node tests/sim/run.js tuning 30`: the recommended package.
- `PROP=final node tests/sim/run.js terrain 24`: terrain on vs off.
- `(cd game && python3 -m http.server 8803 &) ; node tests/e2e/playtest.js http://127.0.0.1:8803/index.html 3`: the browser run.

Raw tables are in `tests/sim/results/*.md` and `*.json`.

## 1. Verdict

**The game is solid, but on Normal it is far too hard for real humans.** It plays very fast and every level is short.

- The mechanics agent's balance table used `CD.Bot`. The bot sees the world with zero perception latency and dodges almost perfectly.
- Human models perceive the world 150–600 ms late, notice bears less often, and steer with 8-way keys or a finger. They die much sooner:

| Normal, current values | Lap 1 cleared | Median session | Target |
|---|---|---|---|
| 6-year-old | 0% (Meadow 38%) | **0.3 min** | 3–6 min |
| casual adult | 3% | **1.2 min** | 6–12 min |
| strong adult | 88% | 6.0 min | – |
| CD.Bot (skill 1) | 100% | 10.7 min | – |

**Root causes**, in order of measured effect:
1. **Hits chain.** After a bump the bear rests only 0.8 s and Pip blinks for 1.5 s. The same bear, usually the green follower, is back on Pip at once. For the kid model the median gap between bumps is **2.0 s**, and 56% of gaps are under 3 s, so three hearts go in about 10 s.
2. **Too many bears too early on Normal.** The Meadow has 2 bears (follower included), and the orange guard arrives in the 3rd biome. The guard is the #1 cause of lost hearts for adults (41–58% of bumps), and the biome where it first appears is the difficulty spike: for the casual model, hearts lost per biome go 0.38 → **2.0**.
3. **Bear contact is generous.** `hitForgive` is 0.85 and `bearCapFrac` is 0.75.
4. **Biomes are short.** They take 15–35 s against the requirement's 60–90 s. Raising `jarTargets` alone makes this *worse* for survival (probe `jar15`: casual lap 1 drops 88% → 71% on Easy). Longer levels only work once the danger per minute has dropped.

**The recommended package** (section 4, `final` in `tests/sim/proposals.js`), on Normal:

| | Current | Final |
|---|---|---|
| Casual adult session | 1.2 min | **5.9–6.0 min** (p10–p90: 2.5–9.4) |
| Casual adult, lap 1 cleared | 3% | **73–80%** |
| Strong adult session | 6.0 min | **13.6 min** |
| 6-year-old, Meadow cleared | 38% | **93%** |
| Biome length | 15–35 s | **33–51 s** |

- On Easy, a 6-year-old goes 1.1 → 2.4 min, and a casual adult plays 10.4 min.
- Exploits still score ≤ 2% of skilled play.
- Every human run ends.

## 2. Method

**Headless sim** (`tests/sim/`):
- `sim.js` runs one game at 1/60 s frames through the public API only: `setMove`, `setTarget` and `action`. It records per-level play time, gems, the score split, Pops and stunned bears, and every bump with its bear kind, the terrain under Pip, and whether the gate was open.
- `pool.js` (copied from Foxy's Reef Memory) runs the jobs on both cores.
- The cap is 30 game minutes or 32 levels.
- About 4,700 games in total.

**Human models** (`tests/sim/players.js`, class `Human`):
- Each model perceives a **snapshot from `rt` seconds ago**, kept in a ring buffer. Bears are extrapolated by `comp × rt`, which models how players anticipate. Pip's own position is current, since the player knows where they steered.
- A model only avoids bears it noticed. The chance of noticing is rolled per bear for each decision.
- Each decision gets heading noise, then 8-way key quantisation, or pointer-follow (`setTarget`) with an inaccurate hand.
- The action press lands after a further delay.

| Model | Reaction | Aim | Avoidance (radius, notice) | Dash | Pop! | Input |
|---|---|---|---|---|---|---|
| kid6 | 350–600 ms, no compensation | nearest gem | 45 px, 55% | 6% when touching | rarely (6% per decision, 12% when a bear is close) | pointer |
| kidKeys | same | same | same | same | same | keys |
| casual | 200–350 ms, 50% | gem cost with danger | 90 px, 85% | 35% | when a bear is near, 45%; or after 8 s at max | keys |
| strong | 150–230 ms, 80% | gem cost with danger | 115 px, 97% | 70% | when a bear is near, 90%; or after 4 s at max | keys |
| greedy / balanced / popspam | casual hands | | | | never / always near a bear, or after 3 s / at once | keys |
| strongGreedy / strongSpam | strong hands | | | | never / at once | keys |

**Exploit models:**
- **random:** a new direction every 0.3–1 s, and the action button on 3% of frames.
- **camper:** sits in the bottom-left corner, darts only for gems within 220 px, and dashes when a bear is close.
- **strafer:** runs a big ellipse forever and Pops whenever full.

**Model check.** With zero latency and zero noise, `strong` reaches level 10–15 on Normal, about the same as CD.Bot. The model logic is competent: the gap between it and the bot is the latency, not bad play.

## 3. Findings (current values, N = 40 per row, `results/baseline.md`)

### 3.1 Overview

| Model | Diff | Meadow | Lap 1 | Median death | Session min (p10–p90) | Score | Score: gems / Pop / clear |
|---|---|---|---|---|---|---|---|
| kid6 | easy | 100% | 3% | Clouds | 1.1 (0.6–1.5) | 1915 | 54 / 11 / 35% |
| casual | easy | 100% | 90% | Clouds L3 | 4.7 (2.7–6.1) | 9820 | 48 / 16 / 36% |
| strong | easy | 100% | 100% | Meadow L6 | 10.3 (8.6–12.2) | 22115 | 43 / 20 / 37% |
| kid6 | normal | 38% | 0% | Meadow | 0.3 (0.2–0.7) | 385 | 72 / 11 / 17% |
| kidKeys | normal | 40% | 0% | Meadow | 0.4 (0.2–0.7) | 430 | 74 / 13 / 12% |
| casual | normal | 98% | 3% | Clouds | 1.2 (0.7–1.8) | 1705 | 61 / 18 / 21% |
| strong | normal | 100% | 88% | River L3 | 6.0 (2.0–8.5) | 9760 | 54 / 24 / 21% |
| bot (CD.Bot 1) | normal | 100% | 100% | Clouds L5 | 10.7 (7.8–13.6) | 21815 | 55 / 25 / 20% |
| casual | hard | 40% | 0% | Meadow | 0.4 | 485 | |
| strong | hard | 90% | 18% | Clouds | 1.9 | 2575 | |
| random | normal | 0% | 0% | Meadow | 0.4 | 10 | |
| camper | normal | 0% | 0% | Meadow | 0.2 | 0 | |
| strafer | normal | 3% | 0% | Meadow | 0.7 | 85 | |

Pointer and keys make no real difference for the kid (38% vs 40% Meadow clears).

### 3.2 Per biome, Normal, lap 1 (current values)

| Model | Biome | Clear if reached | Play s (median) | Hearts lost | By bear | By terrain |
|---|---|---|---|---|---|---|
| kid6 | Meadow | 38% | 25 | 2.13 | green 84%, red 16% | plain |
| casual | Meadow | 98% | 24 | 0.50 | red 50%, green 50% | plain |
| casual | River | 54% | 29 | 1.95 | orange 58%, green 34% | slow 24% |
| casual | Clouds | 29% | 32 | 2.05 | orange 56%, green 35% | puff 7% |
| casual | Glacier | 17% | 40 | 2.33 | green 64%, orange 21% | ice 36% |
| strong | Meadow / River / Clouds / Glacier | 100 / 93 / 100 / 95% | 22 / 30 / 34 / 33 | 0.10 / 0.55 / 0.49 / 0.38 | Clouds: orange 78% | |

**Causes over all runs on Normal:**
- **Kid:** green 76%. The follower is the kid killer.
- **Casual:** orange 47%, green 39%, red 14%.
- **Strong:** orange 41%.
- Only 1–7% of bumps happen while the gate is open, so the calm run to the gate works.

### 3.3 Growth risk/reward and Pop!

| Normal, current | Session min | Pts/min | Gem × | Pops |
|---|---|---|---|---|
| greedy (never Pops) | 0.9 | 1541 | 4.08 | 0 |
| balanced | 1.2 | 1485 | 2.67 | 6 |
| popspam | 1.3 | 1556 | 2.42 | 10 |
| strongGreedy | **1.7** | 1603 | 4.32 | 0 |
| strong (smart Pop) | **6.0** | 1705 | 2.78 | 34 |
| strongSpam | 4.2 | 1636 | 2.43 | 31 |

- **Growth is a real risk.** A strong player who never Pops survives 3.5× shorter than one who Pops when bears are near. The ×5 multiplier does not pay for the danger (points per minute are within ±5% across policies).
- **Pop! is meaningful as a survival tool, not as a score tool.** Points per minute are almost flat across policies, so the *timing* decision is weak. An average Pop stuns only 0.6 bears (kid) to 1.7 bears (strong), and `popPerBear` (+10) is small next to `popBase` (50).
- **Fix** (tested on top of the final package, N = 40): `popBase 50 → 30`, `popPerBear 10 → 30`. For the strong model, smart Pop then scores 1872 pts/min, greedy 1842 (−2%) and spam 1665 (−11%). Survival is unchanged.

### 3.4 Exploits

No exploit beats skill on any difficulty or with any tuning.

- **Easy:** the best exploit (strafer) scores 630 vs the kid's 1915 and the casual's 9820, and none clears lap 1.
- **Normal:** the best exploit scores 85 vs 1705 (casual).
- **Final package:** the best exploit scores ≤ 410 on Easy, against 3,645 for the kid and 22,020 for the casual adult.
- **Camping fails** because the follower and the wanderer come to the corner (the wanderer aims near Pip 40% of the time) and no gems spawn there.
- **The strafer** picks up only about 5–25 gems before it bumps.

### 3.5 Terrain (on vs off, final package, N = 24, `results/terrain_pkgF.md`)

| Biome | Effect of the terrain | Verdict |
|---|---|---|
| River (slow band) | hearts lost: casual N 0.33 → **0.71**; kid E 1.58 → **2.63**; play +4–10 s | noticeable, good |
| Glacier (ice) | hearts lost: strong N 0.29 → **0.58**, strong E 0.13 → 0.38; 41–55% of Glacier bumps happen on ice, which is 21% of the area | noticeable; the hardest biome, which suits the finale |
| Clouds (puffs) | mixed within noise (casual N 0.46 → 0.88; kid N 2.90 → 2.60): puffs push bears away as well as Pip | barely changes difficulty; it is mostly flavour |

If the Clouds should feel distinct, raise `bouncyImpulse` (140 → 190) or grow the puffs. This was not tested here and is optional.

### 3.6 Laps and ending

| Model | Diff | Lap 1 | Lap 2 | Lap 3 | Lap 4 | Hit cap (30 min or 32 levels) |
|---|---|---|---|---|---|---|
| strong (current) | normal | 88% | 60% | 15% | 0% | 0% |
| bot (current) | normal | 100% | 100% | 100% | 65% | 0% |
| bot (current) | easy | 100% | 100% | 100% | 100% | **38%** |
| strong (final) | normal | 97% | 90% | 87% | 27% | 0% |
| bot (final) | normal | 100% | 100% | 97% | 93% | 20% |
| strong (final) | easy | 100% | 100% | 100% | 100% | 23% → **0%** with `bearLapMul 0.22` (session 22 → 18 min) |

- **The ramp is fair:** each lap costs a strong player about 10–60 points of clear rate, not a cliff.
- **Every human run ends** on Normal and Hard.
- **On Easy, only the zero-latency bot can play forever**, because once the bear speed cap (fraction × Pip's speed) binds, extra laps add only bears (max 8). This is acceptable for a superhuman. If a hard stop is wanted, add +1 bear per lap without the cap of 8 on Easy.

### 3.7 Browser run (`tests/e2e/playtest.js`, `results/browser_playtest.json`)

- **Settings:** `?mute=1&bot=1&autostart=1&autorestart=1&speed=16` for 3 real minutes, which is about 48 game minutes.
  - 5 games on Normal. Scores: 17880, 14930, 31250, 14770, 20250.
  - Death levels: 13, 15, 23, 13, 17. This matches the headless bot (median 18), which **cross-validates the sim against the shipped page**.
  - Peaks: 65 weather particles and 67 effects.
  - **0 page errors, 0 console errors, 0 `CD.debug.stats.errors`.**
- **Frame times at speed 1:** bot on the Glacier (`level=3`), 1920×1080, software-rendered sandbox, render scale 2 (1920×1080 backing store).
  - Adaptive on: 59.9 fps, median 16.7 ms, p99 16.8 ms, max 33.4 ms.
  - Adaptive off: 59.6 fps, the same.
  - No adaptive downscale was needed.

## 4. Recommended changes (exact values; `final` in `tests/sim/proposals.js`)

### 4.1 All difficulties (`CD.CONFIG`)

| Key | Now | New | Why (evidence) |
|---|---|---|---|
| `bearRestTime` | 0.8 | **2.5** | Stops hit chains (median bump gap was 2.0 s). Alone it is worth +13 pts of lap 1 for casual on Normal. |
| `followLag` / `followDirect` | 0.8 / 60 | **1.2 / 40** | The green follower causes 76% of kid hits. Alone it is worth +13 pts of lap 1 for casual on Normal and +12 pts on Easy. |
| `guardAggro` | 120 | **80** | The orange guard is the #1 adult killer and the biome spike. |
| `guardCharge` / `guardChargeMax` / `guardCool` | 1.25 / 1.6 / 1.2 | **1.0 / 0.9 / 2.0** | A short, readable lunge instead of a chase. |
| `guardOrbitR` | 62 | **75** | Room to grab the guarded gem with a dash. |
| `hitForgive` | 0.85 | **0.70** | Kinder contact. Alone it is worth +13 pts of lap 1 for casual on Normal. |
| `bearCapFrac` | 0.75 | **0.65** | Big Pip can still escape. |
| `popBase` / `popPerBear` | 50 / 10 | **30 / 30** | Rewards popping next to bears, not spamming (section 3.3). |

### 4.2 `CD.DIFFICULTY`

| Key | Easy now → new | Normal now → new | Hard now → new |
|---|---|---|---|
| `bearSpeedMul` | 0.8 → **0.6** | 1 → **0.75** | 1.15 (keep) |
| `bearCounts` | [1,2,3,3] → **[1,2,2,3]** | [2,3,3,4] → **[1,2,2,3]** | [3,3,4,5] (keep) |
| `jarTargets` | [8,10,12,14] → **[12,15,18,21]** | [12,15,18,20] → **[18,23,27,30]** | [15,18,22,25] → **[20,23,29,33]** |
| `invulnTime` | 2.0 → **2.5** | 1.5 → **2.0** | 1.2 (keep) |
| `healOnClear` | 1 → **2** | 1 → **2** | 0 (keep) |
| `bearRestTime` | **3.0** | (2.5 from CONFIG) | (2.5) |
| `followLag` | 1.0 → **1.4** | (1.2) | 0.6 (keep) |
| `guardAggro` | 100 → **70** | (80) | **100** |
| `guardCharge` | (1.0) | (1.0) | **1.15** |
| `hitForgive` | **0.6** | (0.7) | (0.7) |
| `bearLapMul` | **0.22** | (0.12) | (0.12) |

On Normal, `bearCounts [1,2,2,3]` brings in one new bear kind per biome step: the red wanderer in the Meadow, the green follower in the River, and the orange guard in the Glacier. On lap 2 the counts become 2, 3, 3, 4.

### 4.3 Before and after (final package, N = 30; `results/tuning_final.md`, `tuning_easyramp.md`)

| Model | Diff | Lap 1 | Session min (p10–p90) | Biome s (M / R / C / G) | Hearts lost per biome (M / R / C / G) |
|---|---|---|---|---|---|
| kid6 | easy | 3% → **25–27%** | 1.1 → **2.4** (1.1–4.0) | 25 / 36 / 40 / 45 | 0.6 / 2.7 / 2.2 / 3.4 |
| casual | easy | 90% → **100%** | 4.7 → **10.4** (7.0–13.1) | 22 / 28 / 33 / 36 | 0.03 / 0.13 / 0.47 / 1.07 |
| strong | easy | 100% | 10.3 → **17.9** | 21 / 27 / 30 / 34 | ~0 / 0.03 / 0.07 / 0.40 |
| kid6 | normal | 0% (Meadow 38% → **93%**) | 0.3 → **1.3** (0.9–2.8) | 38 / 54 / 53 / – | 1.0 / 2.5 / 2.4 / 3.0 |
| casual | normal | 3% → **73–80%** | 1.2 → **5.9–6.0** (2.3–9.4) | 33 / 43 / 48 / 51 | 0.13 / 0.63 / 0.90 / 1.41 |
| strong | normal | 88% → **97%** | 6.0 → **13.6** (9.2–17.6) | 30 / 39 / 41 / 47 | 0 / 0.10 / 0.10 / 0.57 |
| strong | hard | 18% → **33%** | 1.9 → **3.0** | | |
| random / camper / strafer | normal | 0% | score 165 / 30 / 185 | | |

**Against the targets:**
- **Casual on Normal:** at the low edge of 6–12 min, so the target is met.
- **Kid:** 3–6 min is **not yet reached** with config alone. A 6-year-old on Easy plays 2.4 min (p90 4.0), still losing 2–3 hearts per biome to the green follower from the River on.
- **Biomes:** 33–51 s, up from 15–35 s. Going to the requirement's 60–90 s would need about 2× jars. That only works after addition #1 below, because longer biomes mean more exposure: `pkgE`, with 1.8× jars, gave no gain.

**Other tested options** (`results/tuning_probe*.md`):
- `slowBears`, `invuln` and `jar15` alone made almost no difference.
- `pkgA` to `pkgE` are the steps that led to `final`.

## 5. Fun additions, ranked by fun per effort (the core spec is kept)

1. **Sleepy follower: "yawn and nap"** (about 20 lines in `_stepBears` plus a `nap` mode; reuse the stun frame with a "Zzz" bubble).
   - After about 6 s of following, the green bear sits down for 2.5 s.
   - It gives the chase a readable rhythm that kids learn at once ("run while it naps!"), and it removes the kid's #1 cause of lost hearts.
   - It is what would let the kid target (3–6 min) and longer jars land.
2. **Heart candy** (small: one gem type, one event).
   - When hearts are below max, one heart-shaped candy appears per biome once the jar is half full.
   - It adds a goal and a "save me" moment, and it extends kid sessions without making adult play softer.
3. **Guard warning ring and "!" bubble** (render only; `b.mode === 'charge'` and the guard's gem are already exposed).
   - Draw a faint dotted ring of radius `guardAggro` around the guarded gem, and a "!" for 0.3 s when the guard charges.
   - The guard is the #1 adult killer, and making its rule visible turns hits into decisions.
4. **Sparkle streak** (small: a timer plus a HUD pop).
   - Gems collected within 1.5 s of each other give +5 × streak.
   - It adds skill expression for adults alongside growth and Pop, and it is harmless for kids.
