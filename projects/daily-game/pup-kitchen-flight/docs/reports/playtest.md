# Biscuit's Kitchen Flight — high-speed playtest report

Playtester: headless simulation, report-only (nothing in `game/` was edited).
Code: `tests/sim/harness.js` (player models, one round, static checks) and `tests/sim/run.js` (runner, 2 worker processes).
Run: `node tests/sim/run.js --reach` (≈25 min, 10 556 jobs: **8 400 rounds** + 1 800 first-obstacle checks + 72 no-hit proofs; `--quick` takes ≈3 min).
Raw output: `tests/sim/out/summary.md` (every table below and more) and `rounds-<tag>.json`.
Note: `tests/sim/out/` is **not covered by `.gitignore` yet** (only `tests/out/` is). Add `tests/sim/out/` before committing.

## 1. What was simulated

Every round runs the real `BKF.World` at 60 Hz frames (the world's fixed 1/120 s steps inside), capped at **300 s** (five levels: Sunny → Rainy → Windy → Snowy → Sunny day 2). Players may **only call `world.flap()`**.

| model | how it plays |
|---|---|
| bots 0.3 / 0.5 / 0.7 / 0.85 / 1 | `BKF.Bot`, 40 seeds each |
| **4-year-old** | predictive player with a tap latency of **450–700 ms** (it plans with its own worst case, so the spread is its timing error). It looks again every 150 ms, its sense of height drifts (σ 18 px), 22 % of taps turn into a 2–3 tap **burst**, and it has an **attention lapse every ≈12 s that lasts 1–2 s** with no taps. 200 seeds. |
| **6-year-old** | latency 300–450 ms, looks every 100 ms, σ 12 px, 10 % bursts, a lapse every ≈25 s lasting 0.6–1.2 s. 200 seeds. |
| **casual adult** | latency 200–300 ms, looks every 60 ms, σ 6 px, 3 % bursts, a lapse every ≈60 s lasting 0.3–0.6 s. 200 seeds. |
| spam-tapper | taps every 80–150 ms, no matter what. 100 seeds. |
| ceiling-hugger | taps whenever he is not pressed against the ceiling. 100 seeds. |
| reckless leaf-chaser | adult timing, but it **ignores obstacles** and only chases leaves (the "bump-through and refill" exploit). 100 seeds. |
| do-nothing | one tap to start, then nothing (the counter-bounce exploit). 100 seeds. |

The human models share one rule: a plan that touches something costs a lot, a soft margin (18–25 px, larger for the kids) costs a little, leaves are a reward, and the counter counts as a solid floor. These are models, not children. Read the kid numbers as "a clumsy, slow, distractible player". They do not predict exactly what a real 4-year-old will do. The bot ladder gives a second, model-free view.

Static checks (independent of any player):
- **First 3 s empty:** across 300 seeds × 3 difficulties, I recorded the first time any obstacle edge enters the 16:9 frame (x < 960) or a 2.2:1 phone (x < 1074).
- **Nothing impossible:** this is an exact reachability search over Biscuit's state (y at 1 px × vy at 10 px/s, a tap decision every 50 ms = `flapCooldown`, the real wind gusts and steam lift, the real swinging hangers), run on a "ghost" copy of the same seed, for **250 s** (Sunny → most of Snowy), 8 seeds × 3 difficulties × 2 configs. The obstacle layout never depends on the player (the RNG only drives generation and wind), so the ghost sees exactly what a player sees. Every surviving state is a real tap sequence, so "alive at 250 s" proves that a path with **no hits at all** exists.

## 2. Baseline (current game)

### Survival, score, reach

| difficulty | player | survival med (p10–p90) | finishes Sunny | reach Rainy / Windy / Snowy / Day 2 | score med (p10–p90) | bumps/min | batteries back/min |
|---|---|---|---|---|---|---|---|
| Easy | 4-year-old | **19 s** (12–34) | **2 %** | 2 / 0 / 0 / 0 % | 14 (4–36) | 9.1 | 0.9 |
| Easy | 6-year-old | 56 s (19–170) | **48 %** | 48 / 21 / 8 / 4 % | 65 (14–218) | 4.6 | 2.4 |
| Easy | casual adult | 300 s (300–300) | 100 % | 100 / 98 / 97 / 97 % | 442 (409–465) | 0.7 | 0.6 |
| Easy | bot 0.3 | 142 s (33–300) | 80 % | 80 / 60 / 23 / 13 % | 191 | 3.8 | 2.6 |
| Easy | bot 0.85 (title demo) | 300 s | 100 % | 100 / 95 / 88 / 88 % | 443 | 1.1 | 1.0 |
| Normal | 6-year-old | 27 s (15–56) | 9 % | 9 / 1 / 0 / 0 % | 31 | 7.5 | 1.7 |
| Normal | casual adult | **300 s** (300–300) | 100 % | 100 / 99 / 96 / **94 %** | 474 (434–506) | 1.1 | **1.0** |
| Normal | bot 0.5 / 0.85 / 1 | 155 / 300 / 300 s | 88 / 95 / 100 % | day 2: 30 / 55 / 100 % | 242 / 452 / 508 | 3.1 / 2.1 / 0.1 | 2.3 / 1.7 / 0.1 |
| Hard | casual adult | 124 s (32–300) | 73 % | 73 / 53 / 26 / 20 % | 220 (45–523) | 3.4 | 2.2 |
| Hard | bot 0.5 / 0.85 / 1 | 85 / 153 / 300 s | 63 / 93 / 100 % | day 2: 5 / 28 / 100 % | 137 / 262 / 580 | 4.3 / 3.1 / 0.3 | 2.5 / 2.2 / 0.3 |

Other baseline numbers (all difficulties):
- **Time to first point:** median 6.1 s (Easy), 5.2 s (Normal), 4.5 s (Hard). The 3 intro leaves sit at x ≈ 1150 (offscreen on the widest phone), so they take ≈6 s to reach Biscuit. On a 16:9 screen they come into view after ≈1.5 s, so a child sees something coming early.
- **Leaves per minute:** 33 (4 y), 54 (6 y), 62–65 (adult and bots) on Easy; about the same on Normal and Hard.
- **Level pacing:** a level is exactly 60.0 s in every run (time-based, in the target 45–90 s). A level holds 24 obstacle passes on Easy, 34 on Normal and 46 on Hard.

### What causes the bumps (baseline)

| difficulty | player | bumps | counter | stack top | stack side | hanger underside | hanger side/top | chain/handle | kettle | in or ≤ 0.8 s after a lapse |
|---|---|---|---|---|---|---|---|---|---|---|
| Easy | 4-year-old | 663 | **65 %** | 15 % | 2 % | 11 % | 6 % | 1 % | 0 % | **53 %** |
| Easy | 6-year-old | 1205 | **50 %** | 28 % | 2 % | 13 % | 4 % | 2 % | 0 % | 42 % |
| Easy | casual adult | 642 | 45 % | 24 % | 3 % | 19 % | 5 % | 2 % | 1 % | 68 % |
| Normal | casual adult | 1080 | 44 % | 13 % | 4 % | 22 % | 10 % | 5 % | 2 % | 44 % |
| Hard | casual adult | 1548 | 39 % | 7 % | 4 % | 29 % | 9 % | 11 % | 1 % | 16 % |
| Hard | bot 1 | 51 | 0 % | 0 % | 0 % | 47 % | 8 % | 43 % | 2 % | – |

### Findings (baseline)

1. **Easy is not easy enough for a 4-year-old.** Only 2 % of runs finish Sunny Morning (median 19 s). The cause is clear: **65 % of the batteries are lost on the counter**, and half of all bumps happen in or just after an attention lapse. From mid-room, Biscuit hits the counter **≈0.6 s** after the last tap (gravity 1250, terminal 520). Every 1–2 s pause is one bounce, and when the 1.5 s blink ends mid-pause it costs a second battery. Refills don't save him: a 4-year-old collects 33 leaves a minute, which is about 2 refills, while losing about 9 batteries a minute.
2. **The 6-year-old is borderline on Easy.** 48 % reach Rainy Noon (target: usually). Again the counter is the top cause (50 %).
3. **Normal does not challenge a casual adult.** 94 % reach day 2 and the median is the 300 s cap. The adult loses 1.1 batteries a minute and gets **1.0 back**, so the leaf refills cancel almost every mistake.
4. **Hard is fair but soft for adults** (20 % reach day 2). Bots 0.5–0.85 behave sensibly.
5. **First 3 s are empty: yes.** The first obstacle enters the 2.2:1 phone view at **≥ 3.70 s** and the 16:9 frame at **≥ 4.27 s** (every seed, every difficulty).
6. **Nothing is impossible.** A no-hit path exists for 250 s on **24/24** seed × difficulty runs. The narrowest free band for Biscuit's centre is **178 px (Easy), 146 px (Normal), 119 px (Hard)**, against a 71 px hop rise. Even the tightest diagonal gate on Hard is 1.7 hops tall. The safe state set never drops below 421 distinct states. The few bumps of bot 1 (≤ 0.3/min, all on hanger heads or chains) come from its planner treating swinging hangers as frozen; a no-hit path exists in every one of those runs.
7. **Gusts and steam are fair.** The bump rate during a gust or ≤ 1.5 s after it equals the calm Windy rate: adult Normal 0.023 vs 0.022 /s, Hard 0.065 vs 0.068 /s, bot 1 0.008 vs 0.005 /s. The rate ≤ 1.5 s after leaving steam is at or below the overall rate (adult Normal 0.021 vs 0.019 /s, bot 0.85 Easy 0.000). No hits come right after a gust or steam.
8. **Exploits: none on the baseline.**
   - Spam-tapping and ceiling-hugging behave the same: Biscuit is pinned at the top and every hanger's chain catches him. 100 % of their bumps are chain/handle. He survives **22 s** on Easy and 17–19 s on Normal/Hard, scoring 5–8 against 440+ for skilled play.
   - The counter bounce can't be farmed: do-nothing lasts **5 s**.
   - Bumping through obstacles for leaves (reckless) lasts 26 s on Easy and scores 26.

## 3. Recommended changes (config only)

Every change goes in `BKF.DIFFICULTY` (or in the base `CONFIG` for Normal). I simulated them through the World `config` option, which merges on top of the difficulty, so the result is identical. Format: `key: old → new`.

**Easy** (`DIFFICULTY.easy`):
- `gravity: 1250 → 850`
- `flapVy: -420 → -350` (same hop: rise 70.6 px; apex 0.34 → 0.41 s: a floatier, more readable arc)
- `maxFall: 520 → 290` (a fall from a standstill at mid-room to the counter takes ≈0.85 s instead of ≈0.6 s, and ≈1.07 s from the top of a hop instead of ≈0.72 s)
- `tiltVyFull: 520 → 300` (looks only: keeps the same nose-down tilt at the new, slower fall speed)
- `hurtTime: 1.5 → 2.5` (a 1–2 s pause now costs one battery, not two)
- `counterBounceVy: -380 → -520` (the counter boing throws him ≈160 px back up, toward mid-room)
- `batteries: 3 → 4`, `maxBatteries: 3 → 4` (the HUD already loops over `maxBatteries`)
- `leavesPerBattery: 15 → 6`
- `scrollSpeed: 150 → 140`

**Normal** (base `CONFIG`, or `DIFFICULTY.normal`):
- `gapMin: 200 → 180`
- `leavesPerBattery: 15 → 25`

**Hard** (`DIFFICULTY.hard`):
- `leavesPerBattery: 15 → 30`

### Before / after (same seeds and models)

| difficulty | player | survival med | finishes Sunny | reach Rainy | reach Day 2 | score med | bumps/min | back/min |
|---|---|---|---|---|---|---|---|---|
| Easy | **4-year-old** | 19 → **108 s** | **2 % → 71 %** ✅ (target ≥ 60 %) | 2 → 71 % | 0 → 11 % | 14 → 122 | 9.1 → 8.3 | 0.9 → 6.4 |
| Easy | **6-year-old** | 56 → **300 s** | 48 → 99 % | **48 % → 99 %** ✅ (target: usually) | 4 → 99 % | 65 → 391 | 4.6 → 2.8 | 2.4 → 2.8 |
| Easy | casual adult | 300 → 300 s | 100 → 100 % | 100 → 100 % | 97 → 100 % | 442 → 414 | 0.7 → 0.5 | 0.6 → 0.4 |
| Easy | bot 0.3 | 142 → 300 s | 80 → 100 % | | 13 → 100 % | 191 → 409 | 3.8 → 2.1 | |
| Normal | **casual adult** | 300 → **197 s** (49–300) | 100 → 86 % | 100 → 86 % | **94 % → 44 %** ✅ (challenged) | 474 → 292 | 1.1 → 2.0 | 1.0 → 1.3 |
| Normal | bot 0.85 | 300 → 141 s | 95 → 90 % | | 55 → 15 % | 452 → 211 | 2.1 → 2.5 | 1.7 → 1.4 |
| Normal | bot 1 | 300 → 300 s | 100 → 100 % | | 100 → 100 % | 508 → 506 | 0.1 → 0.2 | |
| Hard | **casual adult** | 124 → **60 s** (27–160) | 73 → 50 % | | **20 % → 2 %** ✅ (hard) | 220 → 96 | 3.4 → 3.4 | 2.2 → 1.2 |
| Hard | bot 0.85 | 153 → 104 s | 93 → 83 % | | 28 → 3 % | 262 → 172 | 3.1 → 2.8 | 2.2 → 1.3 |
| Hard | bot 1 | 300 → 300 s | 100 → 100 % | | 100 → 100 % | 580 → 580 | 0.3 → 0.3 | |

Checks on the recommended config:
- **Still fair.** A no-hit path exists for 250 s on **24/24** seeds. The narrowest band is 178 px (Easy), **127 px (Normal, was 146)** and 119 px (Hard), all ≥ 1.7 hops. Bot 1 still survives 300 s everywhere (≤ 0.3 bumps/min).
- **First 3 s still empty:** the first obstacle enters the phone view at 3.69 s (Easy), 3.72 s (Normal) and 3.74 s (Hard).
- **Gusts and steam still fair:** 4-year-old on Easy: 0.140 /s in the gust window vs 0.142 /s calm, and 0.075 /s after steam vs 0.138 /s overall. Adult on Normal: 0.032 vs 0.032 /s.
- **Calmer thumbs:** taps per minute on Easy drop from ≈105 to ≈78 because the arc is floatier.
- **Spamming does not beat skilled play.** Spam and ceiling-hugging last 31 s on Easy (was 22 s; the longer blink helps a little), 18 s on Normal and 17 s on Hard, scoring 6–8 against 290–580 for skilled play. Do-nothing lasts 9 s on Easy (the counter bounce is still not a strategy).
- **Soft exploit introduced on Easy (accepted on purpose):** with a refill every 6 leaves, the **reckless leaf-chaser** who ignores obstacles lasts a median **182 s** (was 26 s). It scores **243 against ≈400** for careful play, so it never wins, and "chase the leaves, bonk, get a battery back" is a fine way for a 4-year-old to play. It doesn't work on Normal (17 s) or Hard (15 s). If you don't want it, the optional code change below fixes it.
- Battery refills on Easy for the 4-year-old went from 0.3 to **12.7 per run**. The "bonk → leaves → battery back" loop is now what keeps a little child going. That is on purpose: the HUD's refill moment becomes a frequent reward.

### Optional code change (not a config key today): a soft counter on Easy

**Idea:** on Easy, the counter only boings and costs no battery. This needs a new key, for example `counterCost: true` in CONFIG and `false` in `DIFFICULTY.easy`, checked in `_stepPlaying` where `cost` is computed. The harness emulated it (tag `code`) with the floaty physics above, but with **the original 3 batteries** and `leavesPerBattery: 10`:

| Easy | 4-year-old | 6-year-old | reckless leaf-chaser | do-nothing |
|---|---|---|---|---|
| finishes Sunny | 57 % (median 77 s) | 96 % reach Rainy | 27 % (median 40 s, score 42) | 2 % (20 s) |
| bumps/min | **4.6** (counter share 0 %) | 1.8 | 6.8 | 9.3 |

This halves the 4-year-old's bump rate and removes the reckless soft exploit. With 3 batteries it falls just short of the 60 % target. Adding it **on top of** the recommended config (4 batteries, refill every 6) should clear the target with a much smaller refill treadmill. I didn't simulate that exact mix; re-run `run.js` after adding the key.

## 4. If you apply the config changes

These unit tests hard-code today's numbers and will need new expected values (verified on a scratch copy: 24/27 pass, exactly these 3 fail):
- `tests/unit/run.js:81` asserts Easy has 3 batteries. Make it 4 on Easy, or test on Normal.
- `tests/unit/run.js:348–358`, "one back every 15 leaves" (on Normal). Expect `[[25, 2], [50, 3]]` with 75 leaves, or pass `{ leavesPerBattery: 15 }`.
- `tests/unit/run.js:407` asserts the Easy target speed is 150. Make it 140.

Also update the numbers in `docs/MECHANICS.md` §2 (flight table), §3 and §8, and the REQUIREMENT line "Start with 3 batteries (max 3); every 15 leaves" (Easy 4/6, Normal 3/25, Hard 3/30).

## 5. How to reproduce

```
cd projects/daily-game/pup-kitchen-flight
node tests/sim/run.js --quick            # ≈3 min, fewer seeds
node tests/sim/run.js --reach            # full: ≈25 min on 2 cores
node tests/sim/run.js --tags=base        # only the current game
```
To try other numbers, edit `REC` (or `CODE`) at the top of `tests/sim/run.js`. Player models live in `PLAYERS` in `tests/sim/harness.js`.
