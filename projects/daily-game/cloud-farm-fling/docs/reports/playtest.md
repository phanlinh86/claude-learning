# Nubi's Farm Fling — high-speed playtest

Date 2026-11-24. Report only: nothing in `game/` was edited. Every number below comes from the headless `CFF.World` +
`CFF.Bot` run in a node vm at 60 fps (1/120 s physics sub-steps), about 2 000× real time.
In total that is about 5 000 games, baseline and patch together.

| Script | What it does |
|---|---|
| `node tests/sim/playtest.js [bots humans spring growth reach preview exploits pacing] [--patch \| --after] [--n=K]` | the full report; `--patch` runs before → after |
| `node tests/sim/tune.js [variant …]` | ablation of each patch piece |
| `node tests/sim/unit-with-patch.js` | runs the unchanged unit suite against the patch, in memory |
| `tests/sim/patch.js` | the recommended patch as data (exact source replacements + CONFIG/DIFF values) |
| `tests/sim/lib.js` | the player models, the game runner and the stats |

The old fox-game sim files in `tests/sim/` were rewritten for Nubi.

## Player models

- **Bots**: `CFF.Bot` at skill 1, 0.85 and 0.6.
- **Humans** (`tests/sim/lib.js → MODELS`): they aim with the game's **own on-screen preview** (`world.preview()`).
  - If the dots reach the landing, they read the landing x off the last dot.
  - Otherwise they extrapolate the visible arc: a *naive* parabola with g = 9 (a kid who ignores the size), or *fit*, with gravity read from the curve of the last dots (an adult).
  - On top of that comes hand error (target, power, angle). The first 3 shots are clumsier.

| Model | Profile |
|---|---|
| `kid` (≈ 5 y) | thinks 2–4.5 s, drags 0.8–1.6 s; target σ 1.0 u, power σ 7 %, angle σ 6°; lets go early 12 % of the time (60–85 % of the pull); taps once in 12 % of flights; cancels 5 %; naive extrapolation, no lead for the rolling wagon |
| `kid4` (≈ 4 y, sensitivity check) | σ 1.35 u, power σ 10 %, lets go early 20 % |
| `adult` (casual) | thinks 0.8–1.8 s; follows the firefly arc half the time; half-leads the rolling wagon; σ 0.45 u; uses a smart rescue puff 60 % of the time |
| `spam` | thinks 0.15–0.3 s, drags 0.12–0.25 s, σ 0.7 u, puffs every frame of every flight |
| `farmer` / `farmerMax` | an adult who sits in the aim phase until size ≥ 1.42 / 1.69 (gives up after 130 s) |
| `flopFarmer` | weak flings onto the hay bale (a free retry; Nubi keeps growing) until big, then plays like the adult |

## Verdict

The core works well. The physics are clean: **0 NaN, 0 stuck flights, 0 size-out-of-range** in every run. Spring on Easy is right for a 5-year-old. Puffs cannot be abused. Max size never makes a wagon unreachable. There are four things to fix, in this order:

1. **P1 — Seasons are too short for anyone but a small kid.** Adults and bots clear a season in **24 s** on every difficulty (target 45–90 s). Fix: a number of waterings per difficulty.
2. **P2 — The growth twist is barely felt.** Raining keeps only 40 % of the extra size, so Nubi lives at 1.1–1.25 at release and ≈ 1.36 at touchdown. A size of 1.55–1.7 is seen in **< 0.1 %** of natural shots, and only the farmers ever reach max. Fix: `RAIN_KEEP` 0.4 → 0.5.
3. **P2 — Waiting in the aim phase is a slow but real exploit on Hard.** After 117 s Nubi is 1.7 for free, and the farmer then lands **99–100 %** and never dies. Fix: the mist growth stops at `MIST_CAP` 1.3; only fireflies make Nubi Big.
4. **P3 — Crows sit on the "perfect" firefly arc.** In Autumn/Winter, 22–49 % of the solution arcs pass through a crow, because the crow check gives up after 12 tries in more than half of the shots. Fix: a narrower release window and more tries.

## 1. Survival and score (before)

Mortal games, cap 900 s. "Capped" = still alive at 900 s.

| Player | Diff | Land | Land spr/sum/aut/win | Survive s p10/50/90 | Score p10/50/90 | Pts/min | 1st point s |
|---|---|---|---|---|---|---|---|
| bot 1 | easy / normal / hard | 100 / 99 / 97 % | 94–100 % everywhere | all capped | ≈ 3 550 / 3 550 / 3 270 | — | 1.7 |
| bot 0.85 | easy | 89 % | 95 / 90 / 91 / 81 % | 11/12 capped | 2125 / 2264 / 2308 | — | 1.7 |
| bot 0.85 | normal | 85 % | 90 / 90 / 84 / 77 % | 175 / 287 / 468 | 367 / 668 / 1183 | — | 1.8 |
| bot 0.85 | hard | 83 % | 89 / 88 / 77 / 74 % | 81 / 185 / 252 | 188 / 390 / 605 | — | 1.8 |
| bot 0.6 | easy / normal / hard | 70 / 67 / 61 % | | 169 / 43 / 30 (median) | 240 / 61 / 35 (median) | — | 1.9 |
| kid | easy | 68 % | 74 / 75 / 61 / 58 % | 144 / 238 / 389 | 87 / 210 / 341 | 47 | 6.0 |
| kid | normal | 62 % | 59 / 78 / 50 / — | 25 / 68 / 137 | 1 / 36 / 117 | 33 | 6.0 |
| kid | hard | 58 % | | 25 / 48 / 105 | 1 / 31 / 111 | 31 | 6.0 |
| kid4 | easy | 58 % | 62 / 51 / 63 / 56 % | 108 / 167 / 260 | 30 / 80 / 147 | 29 | 7.7 |
| adult | easy | 93 % | 95 / 94 / 93 / 90 % | all capped | 2017 / 2129 / 2216 | 141 | 2.7 |
| adult | normal | 89 % | 96 / 95 / 88 / 77 % | 108 / 509 / 635 | 200 / 1066 / 1328 | 130 | 2.7 |
| adult | hard | 84 % | 96 / 96 / 79 / 65 % | 87 / 133 / 225 | 188 / 271 / 513 | 118 | 2.7 |
| spam | easy | 77 % | 91 / 83 / 78 / 59 % | 144 / 255 / 413 | 393 / 581 / 1002 | 147 | 1.0 |
| spam | normal / hard | 75 / 75 % | Winter 39–71 % | 61 / 55 (median) | 136 / 134 (median) | 148 / 139 | 1.0 |

- **The difficulty ladder is good.** Every step costs 3–6 points of landing rate. The losses come from Autumn/Winter (crows, the smallest wagon, short previews), not from Spring.
- **Time to the first point is fast.** It is 1–3 s for adults and 6 s for a kid (most of it is the kid's think time).
- **The spam exploiter is not a winner.** It scores about the same points per minute as the adult (147 vs 141) because it fires twice as often. But it lands 15 points less often and dies 2–8× sooner on Normal/Hard, because a fast, sloppy aim costs hearts.

## 2. Spring on Easy for a 5-year-old — yes

Kid model, first season only, 60 games.

| Model | Diff | Finishes Spring | Game over in Spring | Time to finish med (p90) | Land shot 1/2/3/4/5/6 | Net hearts lost |
|---|---|---|---|---|---|---|
| kid | **easy** | **100 %** | 0 % | 47 s (62) | 75 / 67 / 73 / 73 / 92 / 78 % | 0.9 of 5 |
| kid | normal | 50 % | 50 % | 48 s (57) | 57 / 52 / 67 / 61 / 77 / 59 % | 2.1 of 3 |
| kid4 | easy | 90 % | 10 % | 71 s (93) | 60 / 62 / 65 / 58 / 63 / 68 % | 2.0 |
| kid4 | normal | 15 % | 85 % | 57 s | 40–52 % | 2.7 |

- A 5-year-old lands 3 of 4 shots from the very first one: the 54-dot preview shows the whole flight, and the wagon is 4.5 u wide and parked. They never lose the game in Spring.
- Easy is the default (`main.js` settings), which is right: Normal is too hard for a kid.
- Over a whole game, the 5-year-old lasts 4 minutes (median 238 s) and reaches Autumn/Winter.

## 3. Pacing (before): too fast for anyone but kids

Immortal, 720 s. The cells show seconds per season, median (p10–p90), and the number of shots.

| Player | Diff | Spring | Summer | Autumn | Winter |
|---|---|---|---|---|---|
| kid | easy | 51 (37–63, 6.8) | 57 (37–77, 7.5) | 61 (50–79, 8.6) | 72 (48–110, 10.1) |
| kid4 | easy | 81 | 83 | 95 | 130 |
| adult | easy | **24** (5.3 shots) | 25 | 25 | 29 |
| adult | normal | **24** | 25 | 26 | 34 |
| adult | hard | **25** | 29 | 35 | 46 |
| bot 0.85 | normal | **22** | 22 | 24 | 25 |
| bot 0.6 | normal | 33 | 33 | 34 | 40 |

One shot cycle for a capable player is about 4.7 s: think 1.3 + drag 0.6 + flight 1.6 + rain 1.2. Five waterings therefore take 24 s whatever the difficulty. The seasons fly by: an adult sees all 4 seasons in 100 s and is on loop 3 after 5 minutes.

## 4. Growth twist

### Size matters, mildly and always in the player's favour

Fixed-size experiment: the size is forced at every new shot, all 4 seasons, 2 880 shots per cell.

| Player | Diff | Size 1 | 1.2 | 1.4 | 1.55 | 1.7 |
|---|---|---|---|---|---|---|
| bot 0.85 | normal | 85 %, 8.6 pt | 87 %, 10.1 | 90 %, 11.4 | 89 %, 11.2 | 92 %, 12.0 |
| bot 0.6 | normal | 59 %, 5.4 pt | 61 %, 6.1 | 63 %, 7.0 | 67 %, 7.7 | 67 %, 7.6 |
| adult | normal | 91 %, 9.4 pt | 90 %, 11.1 | 93 %, 12.1 | 93 %, 12.0 | 93 %, 12.4 |
| kid | easy | 64 %, 5.4 pt | 69 %, 6.4 | 69 %, 7.4 | 70 %, 7.4 | 69 %, 7.6 |
| bot 1 | any | 100 %, 14.4 pt | | | | 100 %, 16.5 |

(Cells: landing rate, points per shot.)

- Big Nubi is **slightly easier**: +2–8 points of landing rate from the wider rain pad (+0.35 u each side) and the bigger pickup. It also earns **+30–45 % points per shot** (Big Shower +2, more fireflies).
- It is **not too easy**: no player model gains more than 8 points.
- It is **never harder**: the floatier, shorter arc is fully shown by the size-aware preview, and the bot solves it exactly.

### Is the preview misleading at max size?

The test uses random pulls that land 7–15 u. The cells give the mean |estimated − true landing|, in u.

| Diff / season | Dots | Landing visible (s 1 / 1.7) | Naive error s 1 → 1.7 | Fit error s 1 → 1.7 |
|---|---|---|---|---|
| easy spring | 54 | 100 / 100 % | 0.19 → 0.13 | 0.19 → 0.13 |
| easy winter | 21 | 13 / 4 % | 0.16 → 0.15 | 0.16 → 0.27 |
| hard autumn | 14 | 0 / 0 % | 0.31 → 0.38 (p90 0.69) | 0.31 → 0.61 |
| hard winter | 10 | 0 / 0 % | 0.39 → **0.59** (p90 1.13) | 0.39 → 0.75 |

- The preview itself is exact: it is the same step function, and the unit tests show it matches the flight to 1e-9.
- On **Easy it is never misleading**: the error is below 0.3 u against a 2.2 u+ half-wagon.
- On **Hard Autumn/Winter at size 1.7**, the 10–14 visible dots end long before the drag bends the arc. Anyone extrapolating overshoots by 0.6 u on average (1.1 u p90), which is about one hard winter half-wagon (1.02 u).
- That is acceptable "Hard" behaviour and is rarely met in play: release sizes at 1.55+ are below 0.1 % of shots. No change is recommended. An optional fix: scale the preview dots with `1 + (size − 1)`.

### In natural play the twist is invisible (before)

Release-size buckets over all natural shots (bot 0.85, adult, kid):

| Size at release | Share of shots |
|---|---|
| 1–1.1 | 9 % |
| 1.1–1.25 | **83 %** |
| 1.25–1.4 | 4 % |
| ≥ 1.4 | 0.3 % |

The size at touchdown averages **1.32–1.38** (p90 1.47–1.51). Each landing rains 60 % of the extra size away, so Nubi pulses between about 1.15 and 1.4 and never "slowly grows bigger".

Switching growth off entirely changes the landing rate by only 1–4 points. It costs 10–60 % of the score: mostly Big Showers, plus the kid's longer survival from a bigger pickup radius.

### Reach: max size never makes a wagon unreachable

- A full pull at size 1.7 comes down at **x 16.5**. That is **3.45–5.7 u** past the near edge of the farthest wagon, on every difficulty and every loop up to the cap.
- The arc generator always finds fireflies: **0 % fallback** (no-firefly) shots at sizes 1, 1.35 and 1.7.
- The perfect pull collects all of them and lands in **100 %** of Spring/Summer shots.
- In Autumn/Winter it does not, because of crows (§6).

## 5. Exploits

| Strategy | Before | Verdict |
|---|---|---|
| **Puff spam** (every frame of every flight) | landing 87 / 76 / 63 %, the same as never puffing (88 / 76 / 62 %); a smart rescue puff gives 93 / 87 / 77 % | **Safe.** The `vy ≤ PUFF_VY` rule means a spammed puff fires at the apex, where it adds nothing. The puff only pays off as a deliberate late rescue: +5–15 points of landing rate. |
| **Tap spam + instant release** (`spam`) | 147 pts/min vs the adult's 141, but dies 2–8× sooner | **Safe.** Speed and accuracy trade off. |
| **Wait in the aim phase to grow** (`farmer` to 1.42) | 24 pts/min (adult 141), landing 89–93 %, survives 900 s on Hard | Not worth it for points. |
| **Wait to max size** (`farmerMax`) | **99–100 % landing on all difficulties, never dies**, Big Shower every shot, but 10 pts/min (117 s per shot) | **A real but slow exploit.** On Hard a patient high-score hunter becomes immortal (the adult dies at 133 s). It also teaches kids that "doing nothing" is a strategy. |
| **Flop farming** (weak lobs onto the bale to grow without losing a heart) | 96 % flops, 10 pts/min; growth during flops is the same mist rate as waiting | Same as waiting, no faster. The flop retry itself cannot loop: it is the same shot, with no heart lost and no reroll. |

## 6. Stuck states, soft-locks and NaN

- **0 bad states** in all runs: no NaN in Nubi / wagon / score, no size outside [1, 1.7], no flight longer than `MAX_FLIGHT` + 1 s.
- No involuntary flop loops: non-farmer models flop on only 0–7 % of shots, and a flop is a retry of the same shot.
- **Fireflies blocked by crows.** For a release at the expected 1 s, the perfect firefly pull bumps a crow in 22 % (Autumn) to 35–49 % (Winter) of arcs.
  - **Why:** `_arcHitsCrow` demands a clear path for every release time from 0.5 to 3 s. With 2–3 crows almost no arc passes that check. After try 12 the check is skipped, which happened in **53 % (Autumn Hard) and 64 % (Winter Hard)** of shots.
  - **Impact:** this is not a soft-lock. The wagon is still reachable and the player can time the crow: 86–89 % of arcs are clean for some release within 6 s. But Winter is where every player loses most of their landings: bot 0.85 lands 74–81 % there.

## 7. Recommended patch (exact; proven by re-simulation)

All pieces are in `tests/sim/patch.js` (`PATCH`) and were simulated on an in-memory patched copy.

### S1 — waterings per season by difficulty (P1)

**`world.js`**, in `_step`, land phase:
```js
// before
        if (this.levelLandings >= C.LANDINGS_PER_LEVEL) this._setLevel(this.level + 1, false);
// after
        if (this.levelLandings >= (this.D.landings || C.LANDINGS_PER_LEVEL)) this._setLevel(this.level + 1, false);
```

**`DIFF`**: add `landings`.

| | easy | normal | hard |
|---|---|---|---|
| `landings` | 6 | 9 | 10 |

**`render.js`** (HUD pips, around line 474) must read the same number. Widen the pill, because 10 pips do not fit in `tw + 110`:
```js
const per = w.D.landings || CFF.World.CONFIG.LANDINGS_PER_LEVEL;   // and: const pw = tw + 60 + per * 11
```

### S2 — a narrower crow-check window for firefly arcs, more tries (P3)

All three edits are in **`world.js`**.
```js
// _arcHitsCrow
      for (w = 0.5; w <= 3.01; w += 0.5) for (i = 0; i < path.length; i++) {     // before
      for (w = 0.5; w <= 1.51; w += 0.5) for (i = 0; i < path.length; i++) {     // after
// _makeFlies
    for (var tries = 0; tries < 16 && !best; tries++) {                           // before
    for (var tries = 0; tries < 32 && !best; tries++) {                           // after
      if (tries < 12 && this._arcHitsCrow(sol.pull, s0, g0)) continue;            // before
      if (tries < 28 && this._arcHitsCrow(sol.pull, s0, g0)) continue;            // after
```

### S3 — mist growth cap (P2 exploit)

**`CONFIG`**: `MIST_CAP: 1.3` (new).

**`world.js`** `growSize`:
```js
    if (rate) f.goal = M.min(C.SIZE_MAX, f.goal + rate * h);                                   // before
    if (rate && f.goal < C.MIST_CAP) f.goal = M.min(C.MIST_CAP, f.goal + rate * h);            // after
```

**`world.js`** `_makeFlies`, the expected size at release:
```js
    var wait = C.ARC_WAIT, g0 = M.min(C.SIZE_MAX, n0.goal + C.GROW_RATE * wait);                                          // before
    var wait = C.ARC_WAIT, g0 = n0.goal < C.MIST_CAP ? M.min(C.MIST_CAP, n0.goal + C.GROW_RATE * wait) : n0.goal;       // after
```

`growSize` is shared by the flight, the preview, `sizeAfter` (the bot) and the predictor, so they all stay identical.

### S4 — `CONFIG.RAIN_KEEP` 0.4 → 0.5 (P2 twist)

| Variant | Adult normal: Big Shower / landing | Size at landing mean / p90 | Kid easy: Big Shower | Landing |
|---|---|---|---|---|
| 0.4 (now) | 39 % | 1.37 / 1.50 | 27 % | 88 % / 66 % |
| **0.5** | **69 %** | **1.45 / 1.60** | **40 %** | 87 % / 65 % |
| 0.55 | 83 % | 1.50 / 1.65 | 51 % | 89 % / 64 % |
| 0.65 | 96 % | 1.60 / 1.69 | 76 % | 88 % / 66 % |

- 0.5 makes the growth visible: about a third of release sizes are 1.25–1.4, and touchdowns at 1.5–1.6 are common.
- It does not change landing rates.
- Big Showers stay a reward rather than happening every time (0.65 makes them routine and pins Nubi at max).

## 8. Before → after (same seeds)

| Metric | Before | After |
|---|---|---|
| Season length, adult easy / normal / hard (Spring median) | 24 / 24 / 25 s | **28 / 44 / 51 s** (Winter 35 / 62 / 84) |
| Season length, bot 0.85 normal / hard | 22 / 23 s | **40 / 47 s** (Winter 49 / 62) |
| Season length, bot 0.6 normal / hard | 33 / 33 s | 59 / 69 s |
| Season length, kid easy (spr / sum / aut / win) | 51 / 57 / 61 / 72 s | **60 / 59 / 66 / 88 s** |
| Season length, kid4 easy | 81–130 s | 100–133 s (slightly above 90 at the top end) |
| Spring Easy, 5-year-old: finishes / game over / time | 100 % / 0 % / 47 s | **100 % / 0 % / 57 s**; land shot 1 = 75 % (unchanged) |
| Spring Easy, 4-year-old: finishes | 90 % | 85 % (one more watering to survive) |
| Landing rate, adult easy / normal / hard | 93 / 89 / 84 % | 93 / **90 / 88 %** |
| Winter landing, adult normal | 71–77 % | **78–84 %** |
| Landing rate, bot 0.85 easy / normal / hard | 89 / 85 / 83 % | 91 / 87 / 85 % |
| Big Shower per landing, adult normal / kid easy / bot 1 | 39 / 27 / 68 % | **69 / 40 / 94 %** |
| Release size 1.25–1.4 (share of shots) | 4 % | **39 %** |
| Survival median, adult normal / hard | 509 / 133 s | 557 / 187 s |
| Survival median, kid easy | 238 s | 243 s |
| Points per minute, adult easy / normal / hard | 141 / 130 / 118 | 148 / 139 / 137 |
| Clean perfect firefly arcs (release at 1 s), Autumn+Winter Hard at size 1.35 | 55 % | **69 %** |
| Clean perfect firefly arcs, all seasons, sizes 1 / 1.35 / 1.7, Hard | 83 / 78 / 78 % | 88 / 84 / 80 % |
| Crow check skipped (Winter Hard) | 64 % | 39 % |
| `farmerMax` (sits to max size), Hard | 100 % landing, immortal | **Exploit gone**: waiting stops at 1.30; the farmer gains nothing for sitting (max size is now reached only by gulping fireflies) |
| Flop farming | grows to 1.7 for free | capped at 1.30 like waiting |
| Puff spam | no gain | no gain (unchanged) |
| NaN / stuck / size out of range | 0 | 0 |

The unit suite against the patch (`node tests/sim/unit-with-patch.js`) passes **27/29**. Both failures are the intended behaviour changes, and the tests need updating with the patch:

- `growth: slow growth while aiming …`: it expects the *mist* to carry Nubi from 1.39 past 1.4 and from 1.69 to 1.7. With `MIST_CAP` 1.3, test those crossings with a firefly (`goal += GROW_FLY`), or assert that mist stops at `MIST_CAP`.
- `level up after 5 landings`: it hard-codes 5. Use `W.DIFF.normal.landings` (9).

The performance test passes when run alone: 10 simulated minutes in 2.2 s.

Docs to update with the patch:

- MECHANICS §2: add `MIST_CAP`; `RAIN_KEEP` becomes 0.5.
- MECHANICS §3: `LANDINGS_PER_LEVEL` is now the fallback, plus the `DIFF.landings` table.
- DESIGN §5: "Level up after `DIFF.landings`".
- REQUIREMENT: "Levels (6/9/10 waterings each)".

## 9. Smaller notes (no patch)

- Adults on Easy still clear a season in about 28 s. Easy is tuned for kids, and the How-to-Play could suggest Normal for grown-ups.
- A kid on Normal or Hard takes 100–260 s per season and loses most games in Spring. That is fine, because Easy is the default, but do not let a kid's profile default to Normal.
- On Hard, the preview at sizes 1.55 and above under-shows the drag bend (§4). This is optional: preview dots × `(1 + (size − 1))`.
- Crow bumps are still the main reason for Winter misses: bot 0.85 lands 66–85 % in Winter after the patch. If Winter feels unfair in real play, the next lever is `LEVELS[3].crows` 2 → 1 on Easy only (`DIFF.easy.crowK: -1`). That was not simulated here.
