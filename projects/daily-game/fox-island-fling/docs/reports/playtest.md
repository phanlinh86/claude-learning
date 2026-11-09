# Finn's Island Fling — high-speed playtest report

Playtester agent, 2026-11-09. Report-only: no game file was changed. Every number below comes from the headless,
deterministic `FIF.World` (loaded with `tests/unit/load.js`), played at full simulation speed.

**How to reproduce** (from `projects/daily-game/fox-island-fling/`):

| Command | What it does | Time |
|---|---|---|
| `node tests/sim/playtest.js --patch` | every section below, **before → after** the recommended patch | ≈ 12 min on 2 cores (split the sections into two processes to halve it) |
| `node tests/sim/playtest.js humans levels` | only some sections, current game | |
| `node tests/sim/tune.js current flutter flopRetry ranges easy gullSafe patch` | one change at a time (ablation) | ≈ 1 min per variant |
| `node tests/sim/unit-with-patch.js` | the existing unit suite (`tests/unit/run.js`, unchanged) against the patched world | 7 s |

`tests/sim/lib.js` holds the player models and the runner. `tests/sim/patch.js` holds the recommended patch as data,
including the exact source edits. They are applied only to an in-memory copy of `world.js`.

About **13 400 simulated games** went into the before/after playtest (bots 960, human models 5 600, time-per-level 1 200, night 2 240, hearts 620, exploit players 2 360, bullseye 400). About 17 000 more went into the ablation runs. Static checks covered ≈ 15 000 raft spawns and ≈ 6 300 leaves.

---

## 1. Players simulated

| Model | What it does |
|---|---|
| `FIF.Bot` skill 1 / 0.85 / 0.6 / 0.3 | the game's own autopilot |
| **kid4** (4–5 years) | thinks 2–5 s. Picks a random angle from 22° to 66°, and only 15 % of the time follows the leaf arc. Aims at where the raft is *now*, with a target error σ of 1.3 u (×1.6 / 1.3 / 1.1 on its first three shots) and a hand angle error σ of 7°. Its power error is 6 % plus 14 % × the part of the flight the preview does not show, and it reads only half of the preview. **22 % of pulls are weak** (45–80 % of what it meant). Taps 1–4 times at random in half of its flights. 10 % of drags are let go as a cancel. |
| **kid6** | the existing `tests/unit` kid model (≈ 6 years), kept for reference |
| **adult** (casual) | thinks 0.8–2 s and uses the full preview. Follows the leaf arc 60 % of the time and leads the drift halfway. Target error σ 0.45 u. Taps flutter to rescue a short shot 60 % of the time. |
| **spam** | the adult, but it hammers the screen during every flight |
| **fixed pull** | the best single memorised pull, found by grid search over 600 real raft spawns per island |
| **fixed pull + reroll** | the same pull, but it flops on purpose (a tiny fling) whenever the raft is not "in its usual spot" |
| **max pull** | always a full pull, steering only by angle (flat "line drives"). Adult-level eye. |
| **flop farmer** (oracle) | only weak flings that come down on the beach rock. It uses `predictShot` to pick the one that grabs the most low leaves. |

---

## 2. Headline numbers (current game)

### 2.1 Run until game over (real hearts, capped at 20 min)

| Player | Easy: run / islands / landings | Normal: run / islands / landings | Hard: run / islands / landings |
|---|---|---|---|
| bot 1 | never dies (20 min cap), 63 islands, 99.6 % | never dies, 63, 99.5 % | never dies, 62, 97.9 % |
| bot 0.85 (title demo) | 1200 s (28/40 alive), 55, 88.8 % | 268 s, 12, 86.3 % | 94 s, 4, 81.8 % |
| bot 0.6 | 149 s, 6, 73.3 % | 64 s, 3, 72.3 % | 48 s, 2, 67.4 % |
| bot 0.3 | 61 s, 2, 57.0 % | 33 s, 2, 54.8 % | 34 s, 2, 52.4 % |
| **kid4** | **86 s, island 1 (median), 43.4 %** | 40 s, 1, 38.4 % | 38 s, 1, 33.1 % |
| kid6 | 126 s, 3, 64.9 % | 62 s, 2, 63.7 % | 50 s, 2, 58.1 % |
| adult | 441 s, 15, 78.2 % | 120 s, 4, 79.7 % | 92 s, 4, 73.6 % |
| **spam flutter** | **28 s, 1, 7.0 %** | 17 s, 1, 5.2 % | 17 s, 1, 3.7 % |

All runs are medians. The full tables in Appendix A also give p10–p90, scores, bullseyes and hearts.

- **Score medians (easy):** kid4 31, kid6 120, adult 806, bot 0.85 3146. On normal: kid4 13, kid6 49, adult 205.
- **Time to first point:** bot 1.7 s, adult 2.6 s, kid6 4.3 s, kid4 6.7 s. That is fine: the first point always comes within one shot.
- **Islands a 4–5-year-old reaches on Easy before game over** (400 runs):

  | Island reached | 1 | 2 | 3 |
  |---|---|---|---|
  | Share of runs | **52.8 %** | 44.0 % | 3.3 % |

  More than half of the little kids never leave Sunny Cove. Their landing rate there is 41 % on shot 1, 40 % on shot 2 and 47–48 % after that.

### 2.2 Time per level (immortal, 15 min sessions; target ≈ 45–90 s)

| Player | Sunny Cove | Jungle Isle | Coral Lagoon | Lantern Bay |
|---|---|---|---|---|
| kid4 easy | 91 s (44 %) | 109 s (37 %) | 158 s (26 %) | **206 s (19 %)** |
| kid6 easy | 40 s (78 %) | 44 s (71 %) | 64 s (49 %) | 85 s (37 %) |
| kid6 normal | 42 s (74 %) | 53 s (60 %) | 74 s (43 %) | 108 s (29 %) |
| adult normal | 23 s (99 %) | 24 s (97 %) | 31 s (76 %) | 44 s (56 %) |
| bot 0.85 normal | 19 s | 21 s | 22 s | 25 s |

Each cell is the mean time, with the landing rate in brackets. Easy fits a 6-year-old. For a 4–5-year-old it runs 1.5–2.3 × too long, if they get there at all.

### 2.3 Night

The day cycle was frozen at day (dayT 0.3) and at night (0.85), and each island was played from its start. Cells show the landing rate by day → by night.

| Player (easy) | Sunny Cove | Jungle Isle | Coral Lagoon | Lantern Bay |
|---|---|---|---|---|
| kid4 | 46 → 41 % | 36 → 32 % | 26 → 25 % | 20 → 20 % |
| kid6 | 76 → 74 % | 69 → 64 % | 55 → 48 % | 38 → 36 % |
| adult | 100 → 100 % | 100 → 97 % | 84 → 76 % | 63 → 64 % |
| bot 0.85 | 99 → 99 % | 96 → 96 % | 89 → 89 % | 83 → 83 % |

Night costs 0–8 points of landing rate. It hurts most on the drifting islands, where the shorter preview hides the landing. Meanwhile moon leaves pay double, so on balance night is roughly neutral to slightly rewarding. 41 % of all shots in a 15-minute session happen at night. Caveat: the models still "see" the raft in the dark (it has a lantern). Real darkness may cost a real child more than the shorter preview alone. **No change recommended.**

### 2.4 Heart economy (15 min immortal sessions)

| Player | Hearts lost / min | Hearts earned / min | Net / min | Leaves / shot |
|---|---|---|---|---|
| kid4 easy | 4.48 | 0.50 | −3.98 | 1.48 |
| kid6 easy | 4.06 | 1.01 | −3.06 | 2.20 |
| adult easy | 2.24 | 1.87 | −0.36 | 3.06 |
| adult normal | 3.27 | 1.84 | −1.43 | 3.03 |
| bot 1 | 0.04 | 3.29 | +3.25 (capped) | 4.25 |
| bot 0.85 easy | 1.51 | 2.59 | +1.08 | 3.40 |

Hearts come back **almost never for the target audience**: a kid4 run earns 0.3 hearts. For strong players hearts are moot: bot 1 loses about 1 heart in 20 minutes. The `HEART_EVERY 20` rule is tuned for adults.

### 2.5 Bullseye (share of landings)

| Player | Cove | Jungle | Lagoon | Lantern |
|---|---|---|---|---|
| kid4 easy | 23 % | 26 % | 27 % | 23 % |
| adult easy | 56 % | 43 % | 33 % | 31 % |
| adult normal | 43 % | 34 % | 28 % | 28 % |
| bot 1 | 99.5–100 % | | | |

For kids the bullseye is luck: about the bull-to-deck width ratio. For adults it is earned and gets harder island by island. Bot 1 always hits it, which is fine for an autopilot. **No change recommended.**

### 2.6 Reachability: impossible rafts, unreachable leaves, gulls

The checks cover levels 1–4, 7–8 and 15–16, on Easy and Hard, with 40 shots each.

- **Unreachable leaves: 0 of ≈ 3 200** (bonus leaves included). Every leaf is collectable by some pull, with or without one flutter.
- **Impossible rafts: 0 %.** With a 1–3 s wait, a landing plan always exists. Releasing at 0.5 s, up to 12.5 % of shots on Hard Lantern Bay have no clean landing plan, because a gull sits in the way. Waiting a moment always opens a path. Gulls **never block every path**.
- **But the leaf arc often runs through a gull.** The "perfect" arc that collects all leaves passes a gull in 10–62 % of shots on gull islands: 62.5 % on Easy Lantern loop 2, 45–50 % on Hard Lagoon/Lantern. Following the leaves, which is what the game teaches, gets you bonked.

---

## 3. Exploits and degenerate strategies

| # | Exploit | Current game | Severity |
|---|---|---|---|
| E1 | **Tapping during flight ruins the shot.** `flutter()` adds `+3.2` to vy even while Finn is still rising, and the preview does not show it. A child who taps the screen a lot overshoots almost every time. | spam player lands **7 %** (easy) / 5 % / 4 %; game over in 17–28 s. kid4, who taps in half its flights, loses ≈ 3 points of landing rate. | **High.** Small children tap a lot. This is the biggest fun-killer. |
| E2 | **The flop is a free re-roll.** A tiny pull costs nothing: no heart, only the streak. A new shot then re-rolls the raft spot and the leaves. | (a) Endless, risk-free leaf farming: **10 pts/min forever, 0 hearts lost**. (b) "Memorised pull + flop until the raft is in the usual spot" takes the fixed-pull player from island 4 to island 12 (easy) and island 3 to island 8 (normal). | Medium. You *can* score forever without risk, just slowly. |
| E3 | **One memorised pull lands most of the time.** The raft spawn range is barely wider than the deck. | Best fixed pull lands **96 % on Easy Sunny Cove** (84 % normal). The best single pull for all four islands lands 77 / 74 / 71 % (easy / normal / hard). On Lantern Bay a fixed pull (79–81 %) **beats the casual adult (56–67 %)**. | Medium. Aiming stops mattering. |
| E4 | **Max-pull line drives.** A full pull at a flat angle flies 0.7 s and is fully shown by the preview, even at night. | Lands 87–92 % vs the adult's 73–79 %. It collects 0.5 leaves/shot vs 3.1. On Normal it **out-scores** the casual adult: 247 vs 199 points. | Low. It is a legitimate skill shot, but it should not pay more than playing the arcs. |
| E5 | **The leaf arc goes through gulls** (§2.6) | 10–62 % of shots on gull islands | Low–medium. Mixed message. |

Not exploits, checked and fine:
- Spamming taps after the first flutter does nothing (one flutter per flight).
- `MAX_FLIGHT` and the field edges end every flight.
- No leaf or raft is unreachable.
- Tiny pulls below `PULL_MIN` are a cancel and do not advance the game.

---

## 4. Recommended patch

Four small code edits in `game/js/world.js` and data changes in `DIFF` / `LEVELS`. F1–F3, D1 and D2 are the core. F4 is optional.
The exact replacement strings are in `tests/sim/patch.js` (`SRC.*`). They apply cleanly to today's `world.js`.

### F1: early taps are ignored, and do not use up the flutter (fixes E1)

```js
// World.prototype.flutter
    if (this.phase !== 'fly' || this.fluttered) return false;
    var fox = this.fox;
-   fox.vy = M.max(fox.vy, 0) + CONFIG.FLUTTER_VY;
+   if (fox.vy >= CONFIG.FLUTTER_VY) return false;                          // still shooting up: tap ignored, not used up
+   fox.vy = CONFIG.FLUTTER_VY;

// World.prototype.predictShot (keep the predictor identical)
- if (flutterAt !== undefined && flutterAt !== null && !fluttered && ft >= flutterAt) { f.vy = M.max(f.vy, 0) + C.FLUTTER_VY; fluttered = true; }
+ if (flutterAt !== undefined && flutterAt !== null && !fluttered && ft >= flutterAt && f.vy < C.FLUTTER_VY) { f.vy = C.FLUTTER_VY; fluttered = true; }
```

- On the way down, the result is exactly today's rescue, because `max(vy,0) + 3.2 = 3.2` when vy ≤ 0. So the bot and the "flutter extends the flight" unit test are unaffected.
- A spammer's flutter now fires just before the apex, where it changes almost nothing.
- Optional polish in `render.js`: show the "Tap to flutter higher!" hint only while `fox.vy < FLUTTER_VY`.

### F2: a flop is a retry of the *same* shot (fixes E2)

```js
// World.prototype._step, phase 'flop'
-      if (this.phaseT >= C.FLOP_T) this._newShot(false);
+      if (this.phaseT >= C.FLOP_T) this._retryShot();

// new method (next to _newShot)
  World.prototype._retryShot = function () {
    var C = CONFIG, fox = this.fox;
    this.phase = 'aim'; this.phaseT = 0; this.pull = null; this.fluttered = false; this._pulled = false;
    fox.x = fox.px = this.sling.x; fox.y = fox.py = this.sling.y;
    fox.vx = fox.vy = 0; fox.rot = fox.prot = 0; fox.spin = 0; fox.bonkT = 0; fox.flutT = 0; fox.flightT = 0; fox.state = 'sit';
    this._emit({ type: 'newShot', retry: true });
  };
```

- The raft keeps drifting, and the leaves Finn did not take stay where they are.
- It still never costs a heart, so it stays kid-friendly. The "Oops! Pull further" text fits even better.
- `main.js` already handles `newShot` (it clears the drag).

### F3: heart refill per difficulty

```js
// World.prototype._hit
- if (this.leafCount % C.HEART_EVERY === 0 && this.hearts < this.maxHearts) {
+ if (this.leafCount % (this.D.heartEvery || C.HEART_EVERY) === 0 && this.hearts < this.maxHearts) {
```

### F4 (optional): the leaf arc avoids gulls (E5)

In `_makeLeaves`, reject a solution arc that passes within `R_FOX + GULL_R + 0.2` of a gull, for a release 0.5–3 s from now. After 20 tries it accepts whatever it has.
The exact code is in `tests/sim/patch.js` → `SRC.gullSafeArc`: a new `_arcHitsGull(s)` method, plus one extra condition in the `while (!sol …)` loop.

### D1: wider raft spawn ranges in `LEVELS` (fixes E3)

| Zone | `x` now | `x` new |
|---|---|---|
| cove | [8.0, 12.5] | **[7.3, 13.8]** |
| jungle | [8.0, 13.5] | **[7.4, 14.0]** |
| lagoon | [8.5, 14.0] | **[7.8, 14.3]** |
| lantern | [9.0, 14.3] | **[8.3, 14.5]** |

- `levelParams` still clamps the range to `[SLING.x + MIN_RAFT_DX, FIELD_W − hw − 0.2]`. For example, cove on easy ends at 13.42.
- The nearest raft edge stays more than 0.3 u right of the beach rock (`ROCK_X` 4.6).

### D2: `DIFF` changes (Easy is for 4–5-year-olds)

```js
easy:   { hearts: 5, hwK: 1.4 /*1.15*/, bullK: 1.2, ampK: 0.5 /*0.7*/, previewK: 1.6 /*1.25*/, gullK: 0, gullSpeedK: 0.8, heartEvery: 12 /*new*/ },
normal: { ..., heartEvery: 20 /*new, = today*/ },
hard:   { ..., heartEvery: 25 /*new; today 20*/ }
```

`CONFIG` itself is unchanged: `HEART_EVERY 20` stays as the fallback.
Visual note: on Easy the raft art becomes 2·hw + 0.3 ≈ 5.1 u wide on Sunny Cove, up from 4.2. The visual tester should glance at it.

---

## 5. Before → after (re-simulated, same seeds)

### 5.1 The 4–5-year-old (kid4) on Easy

| Metric | Before | After |
|---|---|---|
| Run length (median, p10–p90) | 86 s (50–113) | **124 s (72–186)** |
| Islands reached (median) | 1 | **2** |
| Runs that never leave Sunny Cove | 52.8 % | **16.5 %** |
| Runs that reach island 3+ | 3.3 % | **32.5 %** |
| Landing rate (all / Sunny Cove from shot 3) | 43.4 % / 47 % | **51.5 % / 60 %** |
| Hearts won back per run | 0.3 | **1.5** |
| Score (median) | 31 | **62** |
| Time per level: cove / jungle / lagoon / lantern | 91 / 109 / 158 / 206 s | **69 / 76 / 104 / 135 s** |

### 5.2 Everyone else

| Metric | Before | After |
|---|---|---|
| kid6 easy: time per level | 40 / 44 / 64 / 85 s | 36 / 37 / 48 / 62 s |
| kid6 easy: run / islands | 126 s / 3 | 283 s / 7 |
| **kid6 normal: time per level** | 42 / 53 / 74 / 108 s | **41 / 53 / 68 / 93 s** (now about in the band) |
| adult normal: run / landings | 120 s / 79.7 % | 144 s / 81.2 % |
| adult hard: run / landings | 92 s / 73.6 % | 95 s / 76.7 % |
| adult easy: run | 441 s | 20-min cap (186/200 alive): Easy is now effectively endless for an adult. This is intended, since adults should play Normal. |
| bot 1 landings, easy / normal / hard | 99.6 / 99.5 / 97.9 % | 99.7 / 99.5 / 97.9 % (unchanged) |
| bot 0.85 landings, easy / normal / hard | 88.8 / 86.3 / 81.8 % | 92.2 / 87.2 / 84.3 % (still ≈ 85 % on normal) |
| Night penalty, kid6 (cove → lantern) | 2 / 5 / 7 / 2 points | 0 / 2 / 7 / 6 points (unchanged in kind) |

### 5.3 Exploits

| Exploit | Before | After |
|---|---|---|
| E1 spam flutter, easy: landings / run | **7.0 % / 28 s** | **82.5 % / 20 min cap** |
| E1 spam flutter, normal | 5.2 % / 17 s | 78.8 % / 105 s (about the same as a careful adult) |
| E2 flop farming | **10.1 pts/min forever, 0 risk** | **0 pts/min** |
| E2 memorised pull + flop re-roll (easy) | island 12, 312 pts | island 1, 10 pts. Retrying the same spot gains nothing. |
| E3 best fixed pull, Sunny Cove: easy / normal / hard | 96 / 84 / 72 % | 85 / **58** / **51** % |
| E3 best single pull for all islands: easy / normal / hard | 77 / 74 / 71 % | 78 / **61** / **56** % |
| E3 fixed pull forever, normal: run / islands | 54 s / 3 | 27 s / 2 |
| E4 line drives vs adult, normal score | 247 vs 199 (line drive wins) | 243 vs **352** (playing the arcs wins) |
| E5 leaf arc hits a gull: easy L8 / easy L15 / hard L4 | 62.5 / 40 / 50 % | 35 / 15 / 40 % (F4 helps most on Easy) |

On Easy, a fixed pull still lands 78–85 %. That is the price of a deck big enough for a 4-year-old, and a 4-year-old repeating a pull that works is a fine outcome there. It no longer works on Normal or Hard.

### 5.4 Ablation: what each piece does (`tests/sim/tune.js`)

| Metric | Current | F1 flutter only | F2 flop-retry only | D1 ranges only | D2 + F3 easy only | Full patch |
|---|---|---|---|---|---|---|
| kid4 easy: islands median / ≥ 3 | 1 / 3.7 % | 2 / 8.0 % | 1 / 4.0 % | 1 / 5.3 % | 2 / 24 % | 2 / 38 % |
| kid4 easy: cove landings | 45.7 % | 49.0 % | 46.0 % | 44.9 % | 53.9 % | 58.7 % |
| spam easy: landings | 6.7 % | 76.6 % | 6.7 % | 6.8 % | 15.3 % | 82.3 % |
| fixed pull, all islands, normal | 74 % | 74 % | 74 % | 61 % | 74 % | 61 % |
| flop farmer pts/min | 10.1 | 10.1 | 0.0 | 10.5 | 10.0 | 0.0 |

The "D2 + F3 easy only" column used `heartEvery 10` for Easy. The "Full patch" column is the final patch, with `heartEvery 12`.

---

## 6. Unit-test impact

Command: `node tests/sim/unit-with-patch.js`. Result: 23/27 pass. The four tests that fail all fail because a number they assert moved on purpose:

| Test | Why it fails | Suggested update |
|---|---|---|
| "a heart back every 20 leaves" | Easy now refills every 12 leaves | assert `W.DIFF.easy.heartEvery` instead of 20 |
| "game over after the last heart" | its "far too long" pull `{-1.8, -0.4}` can now land on Easy's wider raft | use a pull that surely overshoots, e.g. `{-1.8, -1.0}`, or clear the raft |
| "bot: skill 0.85 lands 80–90 %" | 91.2 % on those seeds: closer rafts are a bit easier. My 40-seed runs give 87.2 % on normal. | band 80–92 %, or bot `ANG_ERR` 25 → 27 |
| "casual kid: Sunny Cove easy 70–85 % from shot 3" | 87.2 %: Easy was widened on purpose | band 75–92 % |

Also update DESIGN.md §5 and MECHANICS.md §1/§2 for the new flutter rule ("ignored while vy ≥ FLUTTER_VY; then vy = FLUTTER_VY"), the flop retry, `heartEvery`, and the new ranges.

---

## Appendix A: full simulation output (`node tests/sim/playtest.js --patch`)

#### Part 1: bots, fixed pull, flop farming, reachability

#### Bots, real hearts, until game over (cap 20 min) — before

| player | run length med (p10–p90) | score med / p90 | landings | bull / landing | islands reached med (p10–p90) | first point | hearts gained / lost | still alive at cap |
|---|---|---|---|---|---|---|---|---|
| easy bot 1 | 1200 s (1200–1200) | 4643 / 4699 | 99.6 % | 99.6 % | 63 (62–63) | 1.7 s | 0.9 / 1.0 | 40/40 |
| easy bot 0.85 | 1200 s (550–1200) | 3146 / 3263 | 88.8 % | 43.1 % | 55 (25–57) | 1.7 s | 24.9 / 26.6 | 28/40 |
| easy bot 0.6 | 149 s (79–201) | 250 / 352 | 73.3 % | 27.0 % | 6 (3–8) | 1.8 s | 3.6 / 8.6 | 0 |
| easy bot 0.3 | 61 s (46–125) | 63 / 149 | 57.0 % | 23.3 % | 2 (2–4) | 2.2 s | 1.3 / 6.3 | 0 |
| normal bot 1 | 1200 s (1200–1200) | 4613 / 4667 | 99.5 % | 99.7 % | 63 (62–63) | 1.7 s | 1.4 / 1.4 | 40/40 |
| normal bot 0.85 | 268 s (88–529) | 683 / 1293 | 86.3 % | 36.9 % | 12 (4–24) | 1.7 s | 6.1 / 9.1 | 0 |
| normal bot 0.6 | 64 s (27–109) | 98 / 177 | 72.3 % | 26.6 % | 3 (1–4) | 1.8 s | 1.3 / 4.3 | 0 |
| normal bot 0.3 | 33 s (16–65) | 35 / 75 | 54.8 % | 26.7 % | 2 (1–3) | 2.2 s | 0.3 / 3.4 | 0 |
| hard bot 1 | 1200 s (1200–1200) | 4357 / 4456 | 97.9 % | 98.9 % | 62 (61–63) | 1.7 s | 5.3 / 5.3 | 40/40 |
| hard bot 0.85 | 94 s (72–270) | 185 / 646 | 81.8 % | 33.2 % | 4 (3–12) | 1.7 s | 3.1 / 6.1 | 0 |
| hard bot 0.6 | 48 s (20–84) | 70 / 128 | 67.4 % | 24.5 % | 2 (1–4) | 1.8 s | 1.1 / 4.1 | 0 |
| hard bot 0.3 | 34 s (13–59) | 32 / 66 | 52.4 % | 22.3 % | 2 (1–2) | 2.1 s | 0.3 / 3.3 | 0 |

_(bots: 126.5 s)_

#### Exploit: one fixed pull every shot — before

| diff | best fixed pull land % (cove / jungle / lagoon / lantern) | best one pull for all 4 islands | run: cove pull forever | run: all-round pull forever | run: all-round pull + deliberate flop when raft is off |
|---|---|---|---|---|---|
| easy | 96% / 83% / 79% / 79% | 77% (70°, 1.43 u) | 50 s, isl 4, 85 pts | 86 s, isl 4, 92 pts | 418 s, isl 12, 312 pts, alive 0/60, flops 48.2 % |
| normal | 84% / 81% / 78% / 81% | 74% (67°, 1.34 u) | 31 s, isl 3, 51 pts | 54 s, isl 3, 66 pts | 266 s, isl 8, 230 pts, alive 0/60, flops 50.5 % |
| hard | 72% / 76% / 76% / 81% | 71% (66°, 1.33 u) | 24 s, isl 2, 36 pts | 39 s, isl 2, 40 pts | 164 s, isl 4, 111 pts, alive 0/60, flops 55.4 % |

_(fixed: 9.9 s)_

#### Exploit: tiny pulls / flop farming (20 min cap, real hearts) — before

| diff | oracle flop farmer (weak flings that grab the low leaves) | naive tiny pull spam |
|---|---|---|
| easy | 10.1 pts/min, hearts lost 0.0, alive 10/10, 20-min score 202 | 0.0 pts/min, hearts lost 0.0, alive 10/10 |
| hard | 9.8 pts/min, hearts lost 0.0, alive 10/10, 20-min score 197 | 0.0 pts/min, hearts lost 0.0, alive 10/10 |

_(flop: 156.2 s)_

#### Reachability: leaves and landing plans — before

| level | shots | no landing plan at 0.5 s | no plan even waiting 1–3 s | gull sits on the leaf arc | leaves | unreachable leaves | bonus leaves |
|---|---|---|---|---|---|---|---|
| easy L1 cove | 40 | 0.0 % | 0.0 % | 0.0 % | 180 | 0.0 % | 40 (0 unreachable) |
| easy L2 jungle | 40 | 0.0 % | 0.0 % | 0.0 % | 189 | 0.0 % | 41 (0 unreachable) |
| easy L3 lagoon | 40 | 0.0 % | 0.0 % | 12.5 % | 207 | 0.0 % | 41 (0 unreachable) |
| easy L4 lantern | 40 | 0.0 % | 0.0 % | 12.5 % | 198 | 0.0 % | 36 (0 unreachable) |
| easy L7 lagoon | 40 | 0.0 % | 0.0 % | 10.0 % | 204 | 0.0 % | 47 (0 unreachable) |
| easy L8 lantern | 40 | 0.0 % | 0.0 % | 62.5 % | 200 | 0.0 % | 44 (0 unreachable) |
| easy L15 lagoon | 40 | 0.0 % | 0.0 % | 40.0 % | 195 | 0.0 % | 33 (0 unreachable) |
| easy L16 lantern | 40 | 0.0 % | 0.0 % | 40.0 % | 202 | 0.0 % | 46 (0 unreachable) |
| hard L1 cove | 40 | 0.0 % | 0.0 % | 0.0 % | 184 | 0.0 % | 40 (0 unreachable) |
| hard L2 jungle | 40 | 0.0 % | 0.0 % | 0.0 % | 190 | 0.0 % | 33 (0 unreachable) |
| hard L3 lagoon | 40 | 2.5 % | 0.0 % | 45.0 % | 195 | 0.0 % | 39 (0 unreachable) |
| hard L4 lantern | 40 | 12.5 % | 0.0 % | 50.0 % | 201 | 0.0 % | 40 (0 unreachable) |
| hard L7 lagoon | 40 | 0.0 % | 0.0 % | 27.5 % | 199 | 0.0 % | 43 (0 unreachable) |
| hard L8 lantern | 40 | 12.5 % | 0.0 % | 42.5 % | 209 | 0.0 % | 48 (0 unreachable) |
| hard L15 lagoon | 40 | 7.5 % | 0.0 % | 45.0 % | 206 | 0.0 % | 42 (0 unreachable) |
| hard L16 lantern | 40 | 0.0 % | 0.0 % | 27.5 % | 189 | 0.0 % | 36 (0 unreachable) |

_(reach: 46.3 s)_

#### Bots, real hearts, until game over (cap 20 min) — after

| player | run length med (p10–p90) | score med / p90 | landings | bull / landing | islands reached med (p10–p90) | first point | hearts gained / lost | still alive at cap |
|---|---|---|---|---|---|---|---|---|
| easy bot 1 | 1200 s (1200–1200) | 4745 / 4776 | 99.7 % | 99.6 % | 63 (63–64) | 1.7 s | 0.8 / 0.8 | 40/40 |
| easy bot 0.85 | 1200 s (1200–1200) | 3413 / 3526 | 92.2 % | 41.4 % | 58 (57–59) | 1.7 s | 21.5 / 21.6 | 40/40 |
| easy bot 0.6 | 401 s (168–879) | 707 / 1622 | 74.6 % | 26.1 % | 16 (7–35) | 1.8 s | 18.9 / 23.7 | 2/40 |
| easy bot 0.3 | 105 s (66–284) | 128 / 384 | 62.7 % | 18.1 % | 4 (2–10) | 2.3 s | 5.1 / 10.1 | 0 |
| normal bot 1 | 1200 s (1200–1200) | 4714 / 4785 | 99.5 % | 99.7 % | 63 (63–64) | 1.7 s | 1.3 / 1.3 | 40/40 |
| normal bot 0.85 | 331 s (82–684) | 861 / 1817 | 87.2 % | 37.3 % | 15 (4–32) | 1.8 s | 8.1 / 11.1 | 0 |
| normal bot 0.6 | 66 s (25–95) | 96 / 167 | 71.9 % | 26.0 % | 3 (1–4) | 1.9 s | 1.4 / 4.3 | 0 |
| normal bot 0.3 | 32 s (16–72) | 31 / 84 | 54.5 % | 24.3 % | 2 (1–3) | 2.5 s | 0.4 / 3.4 | 0 |
| hard bot 1 | 1200 s (1200–1200) | 4485 / 4553 | 97.9 % | 98.7 % | 62 (61–63) | 1.7 s | 4.9 / 5.0 | 40/40 |
| hard bot 0.85 | 169 s (76–314) | 414 / 811 | 84.3 % | 34.9 % | 8 (4–15) | 1.8 s | 3.6 / 6.6 | 0 |
| hard bot 0.6 | 48 s (20–76) | 60 / 121 | 69.5 % | 28.8 % | 2 (1–3) | 1.9 s | 0.8 / 3.8 | 0 |
| hard bot 0.3 | 32 s (17–66) | 32 / 69 | 54.9 % | 22.6 % | 2 (1–3) | 2.2 s | 0.3 / 3.3 | 0 |

_(bots: 136.7 s)_

#### Exploit: one fixed pull every shot — after

| diff | best fixed pull land % (cove / jungle / lagoon / lantern) | best one pull for all 4 islands | run: cove pull forever | run: all-round pull forever | run: all-round pull + deliberate flop when raft is off |
|---|---|---|---|---|---|
| easy | 85% / 81% / 76% / 77% | 78% (62°, 1.25 u) | 61 s, isl 4, 112 pts | 93 s, isl 4, 117 pts | 1200 s, isl 1, 10 pts, alive 60/60, flops 99.6 % |
| normal | 58% / 66% / 66% / 66% | 61% (50°, 1.16 u) | 18 s, isl 1, 18 pts | 27 s, isl 2, 38 pts | 1200 s, isl 1, 5 pts, alive 60/60, flops 99.8 % |
| hard | 51% / 61% / 63% / 65% | 56% (50°, 1.14 u) | 13 s, isl 1, 11 pts | 20 s, isl 1, 28 pts | 1200 s, isl 1, 0 pts, alive 60/60, flops 99.9 % |

_(fixed: 15.5 s)_

#### Exploit: tiny pulls / flop farming (20 min cap, real hearts) — after

| diff | oracle flop farmer (weak flings that grab the low leaves) | naive tiny pull spam |
|---|---|---|
| easy | 0.0 pts/min, hearts lost 0.0, alive 10/10, 20-min score 0 | 0.0 pts/min, hearts lost 0.0, alive 10/10 |
| hard | 0.0 pts/min, hearts lost 0.0, alive 10/10, 20-min score 0 | 0.0 pts/min, hearts lost 0.0, alive 10/10 |

_(flop: 167.1 s)_

#### Reachability: leaves and landing plans — after

| level | shots | no landing plan at 0.5 s | no plan even waiting 1–3 s | gull sits on the leaf arc | leaves | unreachable leaves | bonus leaves |
|---|---|---|---|---|---|---|---|
| easy L1 cove | 40 | 0.0 % | 0.0 % | 0.0 % | 188 | 0.0 % | 41 (0 unreachable) |
| easy L2 jungle | 40 | 0.0 % | 0.0 % | 0.0 % | 196 | 0.0 % | 47 (0 unreachable) |
| easy L3 lagoon | 40 | 0.0 % | 0.0 % | 5.0 % | 191 | 0.0 % | 34 (0 unreachable) |
| easy L4 lantern | 40 | 0.0 % | 0.0 % | 7.5 % | 195 | 0.0 % | 40 (0 unreachable) |
| easy L7 lagoon | 40 | 0.0 % | 0.0 % | 0.0 % | 186 | 0.0 % | 39 (0 unreachable) |
| easy L8 lantern | 40 | 2.5 % | 0.0 % | 35.0 % | 188 | 0.0 % | 42 (0 unreachable) |
| easy L15 lagoon | 40 | 0.0 % | 0.0 % | 15.0 % | 196 | 0.0 % | 43 (0 unreachable) |
| easy L16 lantern | 40 | 0.0 % | 0.0 % | 12.5 % | 191 | 0.0 % | 33 (0 unreachable) |
| hard L1 cove | 40 | 0.0 % | 0.0 % | 0.0 % | 200 | 0.0 % | 51 (0 unreachable) |
| hard L2 jungle | 40 | 0.0 % | 0.0 % | 0.0 % | 187 | 0.0 % | 39 (0 unreachable) |
| hard L3 lagoon | 40 | 2.5 % | 0.0 % | 22.5 % | 195 | 0.0 % | 33 (0 unreachable) |
| hard L4 lantern | 40 | 7.5 % | 0.0 % | 40.0 % | 204 | 0.0 % | 45 (0 unreachable) |
| hard L7 lagoon | 40 | 0.0 % | 0.0 % | 12.5 % | 196 | 0.0 % | 36 (0 unreachable) |
| hard L8 lantern | 40 | 12.5 % | 0.0 % | 47.5 % | 197 | 0.0 % | 45 (0 unreachable) |
| hard L15 lagoon | 40 | 2.5 % | 0.0 % | 40.0 % | 198 | 0.0 % | 40 (0 unreachable) |
| hard L16 lantern | 40 | 0.0 % | 0.0 % | 20.0 % | 199 | 0.0 % | 43 (0 unreachable) |

_(reach: 53.1 s)_

_total 711 s_

#### Part 2: human models, time per level, night, hearts, max pull, bullseye

#### Human models, real hearts, until game over (cap 20 min) — before

| player | run length med (p10–p90) | score med / p90 | landings | bull / landing | islands reached med (p10–p90) | first point | hearts gained / lost | still alive at cap |
|---|---|---|---|---|---|---|---|---|
| easy kid4 | 86 s (50–113) | 31 / 66 | 43.4 % | 27.1 % | 1 (1–2) | 6.7 s | 0.3 / 5.3 | 0 |
| easy kid6 | 126 s (88–158) | 120 / 168 | 64.9 % | 33.5 % | 3 (2–4) | 4.3 s | 1.6 / 6.6 | 0 |
| easy adult | 441 s (239–700) | 806 / 1287 | 78.2 % | 41.7 % | 15 (8–24) | 2.6 s | 9.3 / 14.3 | 0 |
| easy spam | 28 s (27–34) | 2 / 5 | 7.0 % | 0.0 % | 1 (1–1) | 7.8 s | 0.0 / 5.0 | 0 |
| normal kid4 | 40 s (26–72) | 13 / 34 | 38.4 % | 25.2 % | 1 (1–2) | 6.6 s | 0.0 / 3.0 | 0 |
| normal kid6 | 62 s (31–94) | 49 / 88 | 63.7 % | 30.5 % | 2 (1–3) | 4.3 s | 0.5 / 3.5 | 0 |
| normal adult | 120 s (86–268) | 205 / 496 | 79.7 % | 37.2 % | 4 (3–10) | 2.6 s | 2.2 / 5.2 | 0 |
| normal spam | 17 s (16–22) | 1 / 4 | 5.2 % | 0.0 % | 1 (1–1) | 7.3 s | 0.0 / 3.0 | 0 |
| hard kid4 | 38 s (24–67) | 11 / 28 | 33.1 % | 25.3 % | 1 (1–1) | 6.8 s | 0.0 / 3.0 | 0 |
| hard kid6 | 50 s (26–79) | 35 / 70 | 58.1 % | 28.0 % | 2 (1–2) | 4.3 s | 0.4 / 3.4 | 0 |
| hard adult | 92 s (70–138) | 143 / 230 | 73.6 % | 33.7 % | 4 (3–5) | 2.6 s | 1.3 / 4.3 | 0 |
| hard spam | 17 s (16–19) | 1 / 3 | 3.7 % | 0.0 % | 1 (1–1) | 7.6 s | 0.0 / 3.0 | 0 |


kid4 easy, islands reached at game over (400 runs): island 1: 52.8 %, island 2: 44.0 %, island 3: 3.3 %
kid4 easy Sunny Cove landing by shot #: #1 40.8 %, #2 39.8 %, #3 46.5 %, #4+ 48.0 %
_(humans: 9.9 s)_

#### Time per level (immortal, 15 min from island 1; mean s and landing %) — before

| player | Sunny Cove | Jungle Isle | Coral Lagoon | Lantern Bay | Cove loop 2+ | Lantern loop 2+ |
|---|---|---|---|---|---|---|
| kid4 easy | 91 s (44%) | 109 s (37%) | 158 s (26%) | 206 s (19%) | 94 s (43%) | 94 s (18%) |
| kid4 normal | 106 s (38%) | 123 s (33%) | 176 s (23%) | 267 s (15%) | 106 s (37%) | > (12%) |
| kid4 hard | 122 s (33%) | 150 s (27%) | 255 s (15%) | 273 s (12%) | 124 s (28%) | — |
| kid6 easy | 40 s (78%) | 44 s (71%) | 64 s (49%) | 85 s (37%) | 47 s (65%) | 97 s (31%) |
| kid6 normal | 42 s (74%) | 53 s (60%) | 74 s (43%) | 108 s (29%) | 50 s (60%) | 113 s (26%) |
| kid6 hard | 45 s (69%) | 71 s (45%) | 108 s (29%) | 156 s (20%) | 65 s (47%) | 155 s (17%) |
| adult easy | 23 s (100%) | 24 s (99%) | 28 s (85%) | 36 s (67%) | 26 s (90%) | 44 s (54%) |
| adult normal | 23 s (99%) | 24 s (97%) | 31 s (76%) | 44 s (56%) | 27 s (87%) | 53 s (45%) |
| adult hard | 24 s (98%) | 26 s (92%) | 45 s (54%) | 57 s (43%) | 32 s (73%) | 70 s (35%) |
| bot0.85 easy | 19 s (100%) | 20 s (95%) | 21 s (90%) | 23 s (87%) | 20 s (94%) | 25 s (78%) |
| bot0.85 normal | 19 s (100%) | 21 s (93%) | 22 s (87%) | 25 s (82%) | 21 s (92%) | 27 s (74%) |
| bot0.85 hard | 20 s (94%) | 21 s (93%) | 25 s (79%) | 28 s (72%) | 23 s (84%) | 30 s (67%) |

_(levels: 37.6 s)_

#### Day vs night (day cycle frozen, start on each island; landing % — night/day) — before

| player (easy) | Sunny Cove day → night | Jungle Isle | Coral Lagoon | Lantern Bay |
|---|---|---|---|---|
| kid4 | 46% → 41% | 36% → 32% | 26% → 25% | 20% → 20% |
| kid6 | 76% → 74% | 69% → 64% | 55% → 48% | 38% → 36% |
| adult | 100% → 100% | 100% → 97% | 84% → 76% | 63% → 64% |
| bot0.85 | 99% → 99% | 96% → 96% | 89% → 89% | 83% → 83% |

Share of shots taken at night in a 15-min kid6 session: 41.3 %
_(night: 33.5 s)_

#### Heart economy (15 min immortal sessions: hearts per minute; leaves per shot) — before

| player | hearts lost / min | hearts earned / min | net / min | leaves / shot |
|---|---|---|---|---|
| kid4 easy | 4.48 | 0.50 | -3.98 | 1.48 |
| kid4 normal | 4.82 | 0.50 | -4.32 | 1.49 |
| kid6 easy | 4.06 | 1.01 | -3.06 | 2.20 |
| kid6 normal | 4.88 | 0.97 | -3.91 | 2.13 |
| adult easy | 2.24 | 1.87 | -0.36 | 3.06 |
| adult normal | 3.27 | 1.84 | -1.43 | 3.03 |
| bot1 easy | 0.04 | 3.29 | 3.25 | 4.25 |
| bot1 normal | 0.06 | 3.22 | 3.16 | 4.15 |
| bot0.85 easy | 1.51 | 2.59 | 1.08 | 3.40 |
| bot0.85 normal | 2.03 | 2.54 | 0.51 | 3.35 |
| bot0.6 easy | 4.11 | 1.88 | -2.23 | 2.55 |
| bot0.6 normal | 4.66 | 1.89 | -2.77 | 2.54 |

_(hearts: 29.3 s)_

#### Exploit: max pull every time, steer by angle only (line drives) vs casual adult — before

| diff | max pull (land, leaves, run, score) | casual adult |
|---|---|---|
| easy | 91.8 %, 0.51 leaves/shot, 237 s, 533 pts | 78.6 %, 3.06 leaves/shot, 479 s, 883 pts |
| normal | 90.8 %, 0.53 leaves/shot, 110 s, 247 pts | 78.5 %, 3.13 leaves/shot, 119 s, 199 pts |
| hard | 87.1 %, 0.54 leaves/shot, 63 s, 116 pts | 72.9 %, 3.07 leaves/shot, 91 s, 137 pts |

_(maxpull: 5.6 s)_

#### Bullseye share of landings, per island (immortal 10 min) — before

| player | Sunny Cove | Jungle Isle | Coral Lagoon | Lantern Bay |
|---|---|---|---|---|
| kid4 easy | 23.1 % | 26.4 % | 26.6 % | 23.2 % |
| kid4 normal | 24.9 % | 25.4 % | 20.9 % | 27.5 % |
| adult easy | 56.3 % | 43.1 % | 33.3 % | 30.5 % |
| adult normal | 43.3 % | 34.2 % | 28.0 % | 27.8 % |
| bot1 easy | 99.5 % | 99.8 % | 99.7 % | 99.4 % |
| bot1 normal | 100.0 % | 100.0 % | 100.0 % | 99.4 % |
| bot0.85 easy | 52.1 % | 40.3 % | 35.3 % | 36.8 % |
| bot0.85 normal | 41.9 % | 38.4 % | 29.8 % | 30.7 % |

_(bull: 12.2 s)_

#### Human models, real hearts, until game over (cap 20 min) — after

| player | run length med (p10–p90) | score med / p90 | landings | bull / landing | islands reached med (p10–p90) | first point | hearts gained / lost | still alive at cap |
|---|---|---|---|---|---|---|---|---|
| easy kid4 | 124 s (72–186) | 62 / 104 | 51.5 % | 22.4 % | 2 (1–3) | 6.3 s | 1.5 / 6.5 | 0 |
| easy kid6 | 283 s (139–481) | 304 / 537 | 69.0 % | 31.5 % | 7 (3–12) | 4.3 s | 7.0 / 12.0 | 0 |
| easy adult | 1200 s (1200–1200) | 2487 / 2602 | 86.0 % | 43.1 % | 44 (42–45) | 2.7 s | 22.4 / 23.3 | 186/200 |
| easy spam | 1200 s (554–1200) | 2359 / 2507 | 82.5 % | 44.2 % | 42 (20–44) | 2.7 s | 26.6 / 28.4 | 153/200 |
| normal kid4 | 43 s (26–74) | 15 / 39 | 41.2 % | 24.5 % | 1 (1–2) | 6.6 s | 0.1 / 3.1 | 0 |
| normal kid6 | 69 s (34–108) | 60 / 113 | 66.4 % | 30.5 % | 2 (1–3) | 4.3 s | 0.7 / 3.6 | 0 |
| normal adult | 144 s (89–287) | 255 / 566 | 81.2 % | 36.5 % | 5 (4–11) | 2.7 s | 2.5 / 5.5 | 0 |
| normal spam | 105 s (81–213) | 180 / 396 | 78.8 % | 38.7 % | 4 (3–8) | 2.7 s | 1.8 / 4.8 | 0 |
| hard kid4 | 38 s (24–66) | 12 / 31 | 35.1 % | 25.3 % | 1 (1–1) | 6.7 s | 0.0 / 3.0 | 0 |
| hard kid6 | 50 s (29–80) | 38 / 73 | 60.4 % | 27.8 % | 2 (1–2) | 4.3 s | 0.2 / 3.2 | 0 |
| hard adult | 95 s (70–173) | 156 / 300 | 76.7 % | 33.5 % | 4 (3–7) | 2.7 s | 1.2 / 4.2 | 0 |
| hard spam | 85 s (63–105) | 132 / 171 | 74.7 % | 35.7 % | 3 (3–4) | 2.7 s | 0.9 / 3.9 | 0 |


kid4 easy, islands reached at game over (400 runs): island 1: 16.5 %, island 2: 51.0 %, island 3: 26.5 %, island 4: 5.5 %, island 5: 0.5 %
kid4 easy Sunny Cove landing by shot #: #1 54.0 %, #2 48.3 %, #3 59.5 %, #4+ 60.4 %
_(humans: 28.5 s)_

#### Time per level (immortal, 15 min from island 1; mean s and landing %) — after

| player | Sunny Cove | Jungle Isle | Coral Lagoon | Lantern Bay | Cove loop 2+ | Lantern loop 2+ |
|---|---|---|---|---|---|---|
| kid4 easy | 69 s (57%) | 76 s (52%) | 104 s (39%) | 135 s (30%) | 73 s (53%) | 137 s (27%) |
| kid4 normal | 104 s (38%) | 113 s (35%) | 171 s (24%) | 214 s (18%) | 106 s (37%) | > (20%) |
| kid4 hard | 120 s (33%) | 147 s (27%) | 233 s (17%) | 269 s (14%) | 126 s (28%) | — |
| kid6 easy | 36 s (85%) | 37 s (84%) | 48 s (65%) | 62 s (51%) | 41 s (76%) | 74 s (42%) |
| kid6 normal | 41 s (76%) | 53 s (59%) | 68 s (47%) | 93 s (34%) | 50 s (61%) | 113 s (26%) |
| kid6 hard | 43 s (71%) | 70 s (45%) | 104 s (30%) | 138 s (23%) | 62 s (48%) | 144 s (21%) |
| adult easy | 23 s (100%) | 23 s (99%) | 25 s (93%) | 30 s (78%) | 25 s (92%) | 33 s (73%) |
| adult normal | 24 s (99%) | 24 s (97%) | 31 s (77%) | 39 s (62%) | 27 s (87%) | 50 s (48%) |
| adult hard | 24 s (98%) | 26 s (91%) | 40 s (60%) | 51 s (48%) | 32 s (75%) | 65 s (37%) |
| bot0.85 easy | 19 s (100%) | 20 s (97%) | 20 s (97%) | 21 s (93%) | 20 s (96%) | 22 s (86%) |
| bot0.85 normal | 19 s (98%) | 20 s (94%) | 21 s (90%) | 25 s (80%) | 21 s (92%) | 25 s (77%) |
| bot0.85 hard | 20 s (95%) | 21 s (93%) | 22 s (86%) | 28 s (71%) | 23 s (85%) | 30 s (67%) |

_(levels: 41.7 s)_

#### Day vs night (day cycle frozen, start on each island; landing % — night/day) — after

| player (easy) | Sunny Cove day → night | Jungle Isle | Coral Lagoon | Lantern Bay |
|---|---|---|---|---|
| kid4 | 55% → 52% | 48% → 44% | 36% → 34% | 28% → 25% |
| kid6 | 83% → 83% | 80% → 78% | 68% → 61% | 55% → 49% |
| adult | 100% → 100% | 100% → 100% | 94% → 92% | 82% → 78% |
| bot0.85 | 100% → 100% | 100% → 100% | 91% → 91% | 91% → 90% |

Share of shots taken at night in a 15-min kid6 session: 41.3 %
_(night: 33.2 s)_

#### Heart economy (15 min immortal sessions: hearts per minute; leaves per shot) — after

| player | hearts lost / min | hearts earned / min | net / min | leaves / shot |
|---|---|---|---|---|
| kid4 easy | 3.74 | 0.58 | -3.16 | 1.66 |
| kid4 normal | 4.61 | 0.56 | -4.05 | 1.61 |
| kid6 easy | 3.02 | 1.08 | -1.94 | 2.33 |
| kid6 normal | 4.79 | 1.05 | -3.74 | 2.30 |
| adult easy | 1.14 | 1.99 | 0.85 | 3.21 |
| adult normal | 3.39 | 1.91 | -1.49 | 3.14 |
| bot1 easy | 0.02 | 3.41 | 3.39 | 4.37 |
| bot1 normal | 0.05 | 3.37 | 3.32 | 4.32 |
| bot0.85 easy | 0.91 | 2.72 | 1.81 | 3.52 |
| bot0.85 normal | 1.87 | 2.67 | 0.80 | 3.50 |
| bot0.6 easy | 3.23 | 1.96 | -1.27 | 2.62 |
| bot0.6 normal | 4.51 | 1.96 | -2.55 | 2.64 |

_(hearts: 29.2 s)_

#### Exploit: max pull every time, steer by angle only (line drives) vs casual adult — after

| diff | max pull (land, leaves, run, score) | casual adult |
|---|---|---|
| easy | 93.7 %, 0.63 leaves/shot, 552 s, 1364 pts | 85.8 %, 3.23 leaves/shot, 1200 s, 2496 pts |
| normal | 90.9 %, 0.61 leaves/shot, 110 s, 243 pts | 80.3 %, 3.17 leaves/shot, 185 s, 352 pts |
| hard | 87.8 %, 0.64 leaves/shot, 66 s, 122 pts | 75.4 %, 3.14 leaves/shot, 96 s, 155 pts |

_(maxpull: 11.4 s)_

#### Bullseye share of landings, per island (immortal 10 min) — after

| player | Sunny Cove | Jungle Isle | Coral Lagoon | Lantern Bay |
|---|---|---|---|---|
| kid4 easy | 22.4 % | 21.9 % | 23.6 % | 22.4 % |
| kid4 normal | 20.5 % | 24.5 % | 31.2 % | 20.8 % |
| adult easy | 59.0 % | 47.7 % | 38.8 % | 30.5 % |
| adult normal | 45.5 % | 32.6 % | 27.7 % | 23.7 % |
| bot1 easy | 100.0 % | 100.0 % | 100.0 % | 98.9 % |
| bot1 normal | 100.0 % | 99.8 % | 99.8 % | 98.9 % |
| bot0.85 easy | 49.0 % | 42.1 % | 35.7 % | 32.0 % |
| bot0.85 normal | 44.3 % | 36.7 % | 35.8 % | 30.2 % |

_(bull: 12.8 s)_

_total 285 s_

## Appendix B: ablation (`node tests/sim/tune.js …`)

| metric | current | flutter | flopRetry | ranges |
|---|---|---|---|---|
| kid4 easy run | 81 s | 88 s | 82 s | 82 s |
| kid4 easy islands med / ≥3 | 1 / 3.7 % | 2 / 8.0 % | 1 / 4.0 % | 1 / 5.3 % |
| kid4 easy land (cove) | 43.4 % (45.7 %) | 46.0 % (49.0 %) | 43.6 % (46.0 %) | 43.3 % (44.9 %) |
| kid4 easy hearts +/run | 0.3 | 0.4 | 0.3 | 0.3 |
| kid4 easy s/level | 88/118/160/192 | 82/105/143/188 | 87/118/158/188 | 93/118/155/169 |
| kid6 easy s/level | 41/47/66/80 | 39/45/61/76 | 41/47/64/77 | 42/48/64/78 |
| kid6 normal s/level | 43/57/79/99 | 41/55/76/90 | 43/57/78/106 | 44/55/78/98 |
| kid6 easy run / islands | 126 s / 3 | 130 s / 3 | 123 s / 3 | 124 s / 3 |
| adult easy run / land / alive@20min | 467 s / 78.7 % / 0 | 467 s / 78.7 % / 0 | 451 s / 78.9 % / 0 | 456 s / 78.6 % / 0 |
| adult normal run / land / alive@20min | 125 s / 79.5 % / 0 | 125 s / 79.5 % / 0 | 128 s / 79.8 % / 0 | 183 s / 80.3 % / 0 |
| adult hard run / land / alive@20min | 93 s / 73.9 % / 0 | 93 s / 73.9 % / 0 | 93 s / 74.1 % / 0 | 95 s / 74.4 % / 0 |
| spam easy land / run | 6.7 % / 29 s | 76.6 % / 320 s | 6.7 % / 29 s | 6.8 % / 29 s |
| fixed pull best: easy cove / easy all / normal all | 96% / 77% / 74% | 96% / 77% / 74% | 96% / 77% / 74% | 66% / 65% / 61% |
| flop farmer pts/min | 10.1 | 10.1 | 0.0 | 10.5 |
| reroll exploit (normal): alive@20min / score med | 0/20 / 333 | 0/20 / 333 | 20/20 / 6 | 0/20 / 326 |
| hard lantern: leaf arc hits a gull | 47.5 % | 47.5 % | 47.5 % | 47.0 % |

| metric | easy | gullSafe | patch |
|---|---|---|---|
| kid4 easy run | 114 s | 81 s | 134 s |
| kid4 easy islands med / ≥3 | 2 / 24.0 % | 1 / 3.7 % | 2 / 43.7 % |
| kid4 easy land (cove) | 48.6 % (53.9 %) | 43.5 % (45.7 %) | 51.5 % (58.8 %) |
| kid4 easy hearts +/run | 1.7 | 0.3 | 2.3 |
| kid4 easy s/level | 77/94/122/168 | 88/118/160/189 | 67/80/106/151 |
| kid6 easy s/level | 40/40/56/65 | 41/47/66/80 | 37/38/48/58 |
| kid6 normal s/level | 43/57/79/99 | 43/57/79/99 | 41/53/72/89 |
| kid6 easy run / islands | 266 s / 6 | 126 s / 3 | 333 s / 8 |
| adult easy run / land / alive@20min | 1200 s / 81.9 % / 138 | 547 s / 81.5 % / 7 | 1200 s / 86.4 % / 148 |
| adult normal run / land / alive@20min | 125 s / 79.5 % / 0 | 184 s / 80.8 % / 0 | 197 s / 81.7 % / 0 |
| adult hard run / land / alive@20min | 93 s / 74.9 % / 0 | 96 s / 75.7 % / 0 | 96 s / 76.4 % / 0 |
| spam easy land / run | 15.3 % / 32 s | 6.7 % / 29 s | 82.5 % / 1200 s |
| fixed pull best: easy cove / easy all / normal all | 100% / 87% / 74% | 96% / 77% / 74% | 85% / 78% / 61% |
| flop farmer pts/min | 10.0 | 10.1 | 0.0 |
| reroll exploit (normal): alive@20min / score med | 0/20 / 333 | 1/20 / 411 | 20/20 / 6 |
| hard lantern: leaf arc hits a gull | 47.5 % | 34.0 % | 29.5 % |

`allB` = the final patch (Easy `heartEvery` 12); `patch` here = the same with Easy `heartEvery` 10, and the first gull-arc check (0.8–2.4 s).

| metric | easyD | allB |
|---|---|---|
| kid4 easy run | 120 s | 127 s |
| kid4 easy islands med / ≥3 | 2 / 25.7 % | 2 / 38.0 % |
| kid4 easy land (cove) | 48.4 % (53.9 %) | 52.2 % (58.7 %) |
| kid4 easy hearts +/run | 1.1 | 1.7 |
| kid4 easy s/level | 77/94/122/168 | 67/80/106/143 |
| kid6 easy s/level | 40/40/56/65 | 37/38/48/58 |
| kid6 normal s/level | 43/57/79/99 | 41/53/72/89 |
| kid6 easy run / islands | 204 s / 5 | 296 s / 7 |
| adult easy run / land / alive@20min | 1200 s / 81.9 % / 137 | 1200 s / 86.2 % / 142 |
| adult normal run / land / alive@20min | 125 s / 79.5 % / 0 | 204 s / 81.5 % / 0 |
| adult hard run / land / alive@20min | 93 s / 73.9 % / 0 | 97 s / 76.0 % / 0 |
| spam easy land / run | 15.1 % / 38 s | 82.3 % / 1200 s |
| fixed pull best: easy cove / easy all / normal all | 100% / 87% / 74% | 85% / 78% / 61% |
| flop farmer pts/min | 10.0 | 0.0 |
| reroll exploit (normal): alive@20min / score med | 0/20 / 333 | 20/20 / 6 |
| hard lantern: leaf arc hits a gull | 47.5 % | 31.5 % |
