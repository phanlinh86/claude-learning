# Ember's Glow Castle: mechanics

Files: `game/js/rng.js`, `world.js`, `weather.js`, `bot.js`. Contract: `docs/DESIGN.md` §5.
Tests: `node tests/unit/run.js` (29 tests, about 1.7 s, including 10 simulated minutes of bot play in about 0.25 s).

Everything runs in fixed sub-steps of **1/120 s**. Every moving thing (items, Ember, Boo) stores `prevX/prevY` at the start of each step, and `world.alpha` (0..1) is the leftover fraction, so the renderer draws `lerp(prev, cur, alpha)`. A frame longer than 0.25 s is clamped, so a hidden tab never fast-forwards. The same seed plus the same `aim`/`drop` calls gives the same game. The board result doesn't even depend on the frame rate (a test checks this). Only spawns and the choice of rising-pumpkin columns use the world RNG. `simulate()` never touches it.

## 1. CONFIG (`EG.CONFIG`, top of `world.js`)

Physics constants are tuned for a 55 px cell and multiplied by `cell/55` ("×sc"). So a 104 px iPad cell falls in exactly the same time and bounces to the same fraction of a cell.

| Key | Value | Unit | Why |
|---|---|---|---|
| `step / maxFrame` | 1/120, 0.25 | s | 1400 px/s is 12 px per step (< ¼ cell), so there's no tunnelling. A hidden tab doesn't fast-forward |
| `cols / rows` | 5 / 7 | — | DESIGN §2. Hard uses `difficulty.hard.rows = 6` |
| `topLandscape/Portrait`, `padLandscape/Portrait`, `sideMargin`, `maxCell`, `minCell` | 128/190, 22/60, 40, 104, 16 | px | DESIGN §2 layout formula |
| `emberAbove / holdBelow / itemFrac` | 0.95 / 0.55 / 0.86 | cells | Ember's body centre, the held light under her paws, and the drawn light size |
| `gravity` | 2600 ×sc | px/s² | A full-height drop (6.9 cells from Ember's paws) takes **0.54 s** and lands at 1400 px/s. That feels heavy, not floaty |
| `restitution` | 0.25 | — | One soft bounce: 25 % of the speed, so about 6 % of the drop height (24 px) and 0.27 s in the air |
| `bounceMin` | 140 ×sc | px/s | Slower touch-downs don't bounce (no jitter). A one-row cascade hop (535 px/s) still gives a 3 px "tick" |
| `glideRate` | 18 | 1/s | A light released before Ember was centred eases sideways onto its column while it falls |
| `squashPerSpeed / squashMin / squashMax` | 1/2600, 0.06, 0.5 | — | Landing squash = speed/2600 (scaled), clamped. A full drop squashes 50 % wide |
| `bounceSquash` | 0.45 | × | The touch-down after the bounce adds 45 % of the speed-based amount |
| `squashOmega / squashZeta` | 30 rad/s, 0.38 | — | Damped spring on `squash`: wide → about 13 % narrow → still in about 0.3 s (a jelly "boing") |
| `mergeTime / mergeShrink` | 0.18 s, 0.85 | — | Members slide into the anchor with ease-in (t²: slow start, quick snap) and shrink to 85 % |
| `popTime / popFrom / popPeak / popPeakAt` | 0.26 s, 0.6, 1.15, 0.45 | — | The new light pops 0.6 → 1.15 (ease-out, at 45 %) → 1 (ease-in-out) |
| `basePoints / groupStep / comboStep / comboCap` | 5, 0.5, 0.1, 10 | — | Points = `5·2^(t−1) × (1 + 0.5·(size−2)) × (1 + 0.1·min(comboBefore, 10))` |
| `emberOmega` | 14 | rad/s | Critically damped spring: 1 column in about 0.2 s, 4 columns in about 0.35 s, no overshoot |
| `emberTiltMax / emberTiltSpeed / emberTiltRate` | 0.32 rad, 650 ×sc px/s, 10/s | — | She leans into the flight (peak speed for 2 columns is about 570 px/s, which gives about 0.2 rad) and eases back |
| `emberBobOmega / emberKick` | 12 rad/s, 90 ×sc px/s | — | A small upward bob when she lets go of the light |
| `dropSnap / dropWait` | 6 px, 0.18 s | — | Contract: released within 6 px of the column centre, or after 0.18 s at the latest |
| `animTime` | drop 0.3, happy 0.7, oops 0.6 | s | Pose duration before `idle` |
| `helperEvery / helperCarry / helperPoints` | 5, 3, 5 | — | Contract |
| `helperMaxTier` | 3 | tier | **Boo only carries pumpkins and fireflies (tiers 1–3).** See §4 |
| `booSpeed / booMinFlight / booMaxFlight / booArc / booHover / booPause` | 620 ×sc, 0.3, 0.8, 0.28, 0.6 cells, 0.12 s | — | Each hop is a quadratic Bézier with the control point raised 28 % of the distance, eased in-out. He hovers just above the item and pauses briefly |
| `carryLife / carryAccel` | 0.9 s, 520 ×sc | — | Carried items rise (accelerating), sway and fade |
| `pumpkinPoints / rollSpeed / rollHop / rollLife` | 10, 240 ×sc, 330 ×sc, 1.6 s | — | A woken pumpkin hops up, rolls off the nearer side (rotation = distance / radius) and falls out under gravity |
| `goals / loopGoal` | [5,6,7,8] / 8 | tier | Candle, lantern, star, moon. Loops stay on the moon |
| `goalTime / goalBonus` | 1.2 s / 100 | — | The goal light accelerates up off the screen in 1.2 s. Bonus = `100·(zone+1)·(loop+1)` |
| `tidyTime` | 0.7 s | — | Level-up tidy-up: tier-1 lights fly up 2.2 cells and fade |
| `riseTime / riseSquash` | 0.32 s / 0.14 | — | Night creeps: the column eases up one cell (ease-out cubic), the new pumpkin fades in from below, and the pushed lights squash a little when they stop |
| `riseLoopStep / riseMin` | 1 / 3 | drops | Each castle loop rises 1 drop sooner and lifts 1 more pumpkin, but never more often than every 3 drops |
| `dangerFrom / dangerStep` | 0.5 / 0.25 | — | `danger` = board fill above 50 %, in quarter steps (emitted only when it changes) |

### Per-difficulty presets (`CONFIG.difficulty.easy|normal|hard`)

`spawn[zone]` = weights for tiers 1..4. At spawn time they are cut to tiers ≤ `max(2, boardMax − 1)` and renormalised. "units/drop" = mean tier-1 equivalents per light, `Σw·2^(t−1)/Σw` before the cap.

| | zone 0 courtyard | zone 1 cellar | zone 2 library | zone 3 tower | pumpkins (zone 0..3) | rows |
|---|---|---|---|---|---|---|
| easy | 3,2,0,0 (1.40) | 5,4,1,0 (1.70) | 4,4,2,0.5 (2.29) | 3,3,2.5,1.2 (2.95) | 0, 0, 0, 0 | 7 |
| normal | 5,3,1,0 (1.67) | 5,3,1.5,0.3 (1.98) | 4,3,2,0.8 (2.49) | 3,3,2.5,1.5 (3.10) | 0, .06, .08, .10 | 7 |
| hard | 6,3,1,0 (1.60) | 5,3,1,0.3 (1.87) | 5,3,2,0.5 (2.19) | 4,3,2,1 (2.60) | 0, .14, .18, .22 | 6 |

Easy zone 0 spawns only tiers 1–2 and never pumpkins (a 6-year-old's first place). No difficulty drops pumpkins in zone 0.

**Night creeps** (rising pumpkins: the loss pressure, §2.1). From level `riseFrom`, every `riseEvery[zone]` drops `riseCount[zone]` sleepy pumpkins rise from the bottom of distinct seeded columns. In loop *n*: `riseEvery − n` (min 3) and `riseCount + n` (max 4).

| | riseFrom | riseEvery (zone 0..3) | riseCount (zone 0..3) |
|---|---|---|---|
| easy | level 2 | 9, 9, 5, 4 | 1, 1, 2, 2 |
| normal | level 1 | 5, 4, 4, 3 | 1, 2, 3, 3 |
| hard | level 1 | 5, 5, 4, 4 | 1, 2, 2, 3 |

The zone-0 value only applies to loops (level 4, 8…). Easy's courtyard and cellar, and Normal's and Hard's courtyard, have no pressure.

## 2. Turn flow and phases

```
aim ──drop(col)──▶ drop ──(Ember within 6 px or 0.18 s)──▶ fall ─┐
 ▲                                                               │ all items at rest
 │        ┌──────────────── merge (0.18 s) ◀── groups? ◀─────────┘◀──────────┐
 │        └─▶ new lights pop, pumpkins wake, gravity → fall ─────────────────┘
 │  no groups → helper pending? → Boo (helper) → gravity → … (cascades again)
 │           → goal ascending? wait (phase 'goal') → levelUp + tidy-up → gravity → …
 └── ready: comboBreak/combo reset if this drop merged nothing · danger
          · night creeps due? → pumpkins rise, columns pushed up (0.32 s) → resolve (cascades) → ready again
          · game over check · buffered drop
```

- `phase` is computed every step with the priority `over > goal > helper > merge > drop > fall > aim`. `goal` lasts while the goal light ascends (cascades can still finish underneath). `helper` lasts while Boo is coming in or carrying. While he flies away (`boo.state 'out'`) gravity already runs (phase `fall`).
- **Buffering:** `drop()` while busy stores only the latest column (`-1` = "where Ember aims") and runs it when the board is ready. `aim()` while Ember is carrying a light to its column is applied right after the release.
- **Refuse:** `drop(col)` into a column that can't take the light emits `refuse`, sets Ember to `oops` and leaves everything else unchanged. The light stays in her paws.
- **Game over** is checked every time the board becomes ready: if no column can take the held light → `phase 'over'`, `gameOver`. It also happens when the night must rise but every column is full. Input is ignored after that.

### 2.1 Night creeps (rising pumpkins)
- `world.riseIn` (drops left, for a HUD counter) counts down at every release. When the drop's resolution is done and `riseIn` is 0, it restarts at `riseEvery`. Then `riseCount` pumpkins rise, each in a different seeded random **non-full** column, emitting `{type:'rise', col, item}` per pumpkin. If every column is full: `gameOver`.
- In the chosen column every item moves up one row: `row+1`, and `y` eases from its old position to the new cell over 0.32 s (ease-out cubic; `prevY` keeps lerping). Each gets a small squash at the end. The pumpkin starts one cell below the board (`rowY(−1)`, alpha 0→1) and settles in row 0. Everything pushed is dirty: when the push brings a light next to a twin in the next column, it merges and cascades as usual. Those merges add to the combo and can wake the riser.
- The counter restarts at every level-up (a short breather) and on `gotoLevel`. A rise that is due when a goal is made is skipped by that level-up.
- Why it works: a single riser is woken by the next merge beside it about 80 % of the time. Several risers at once fill the bottom row, and only merges right next to them clear it. A player who merges low and near the pumpkins keeps the board alive. A careless one gets pushed up to the top. (Wider spawns were tried first: they add supply and make the game *easier*, so the spawn tables stay at tiers 1–4.)

### Falling light (semi-implicit Euler)
`vy += g·h; y += vy·h; x += (colX − x)(1 − e^(−18h))`. At the first touch-down (y ≥ cell centre): `land {speed}`, squash = speed/2600 (clamped 0.06..0.5), and if speed > 140·sc: `vy = −0.25·speed`. At the second touch-down: `bounce`, extra squash, rest. Measured (960×540): land at 0.55 s, bounce apex 24 px, back down at 0.82 s.

### Merge resolution
1. Only **dirty** lights start a search: the one that just landed, newly created lights, and anything that moved. Their 4-connected same-tier group (lights only) needs size ≥ 2.
2. **Anchor** = the dirty member in the lowest row, then the leftmost column. A light dropped onto a full column whose top matches sits in an overflow row above the grid. Its anchor is the column's top light, so the result stays on the board.
3. All groups found in one pass merge at the same time (members `state 'merging'`, `mergeTo` = anchor id). After 0.18 s, each group gives ONE light of tier+1 in the anchor cell (`popping`, scale 0.6→1.15→1). Tier 8 + 8 is a super moon: both vanish, `merge {tier: 8, super: true}`, points `2·value(8)` × group and combo factors.
4. Per group: `combo++` (points use the combo **before** this merge, so a first merge is ×1.0), `merge {cascade}` (0 = direct, 1+ = cascade round), `combo` when combo ≥ 2, `newTier` the first time in the run, pumpkins 4-adjacent to any member wake (`pumpkinWake`, `state 'rolling'`, +10), and crossing a multiple of 5 queues Boo.
5. If the new tier ≥ `goalTier` (once per level), it leaves the board at once (`state 'ascending'`, +bonus, `goal`).
6. Gravity: each column is a stack, so removing items compacts it. Every item whose row changed becomes `falling` from rest (vy 0) and is dirty. Then the process repeats.

## 3. Spawns and goals
- `held`/`next` come from the seeded RNG when a light is released. The new `next` is a pumpkin with `pumpkinChance[zone]`, but never right after a pumpkin (`held`). Otherwise a tier from the zone weights, capped by the board's current max tier.
- Goal tiers by level: 5, 6, 7, 8, then 8 forever. After the 1.2 s ascend and a quiet board: `levelUp {level, zone}`, the next goal, `maxTier` = board max, and all tier-1 lights fly up (tidy-up). Everything else stays.
- `gotoLevel(i)` lifts every board item away, resets the combo, Boo and the buffer, sets the level, respawns `held`/`next` and emits `levelUp`.

## 4. Boo (helper)
On a quiet board after combo 5/10/15…: `helper {combo}`. Boo enters from the top corner away from Ember (off-screen, y = −0.8 cell). Targets (up to 3) are pumpkins first, then the lowest tiers (higher rows first, then left), **only lights of tier ≤ 3**. He flies a curved hop to just above each one, picks it up (`helperCarry`, +5, the item rises and fades), pauses 0.12 s, and goes on. After the last pick-up: `helperDone`, gravity runs, and Boo flies out to the other top corner (`boo.active` turns false off-screen). The combo is not reset. With nothing small on the board he does a friendly fly-by over the board (no carry).

Why the tier cap: without it, the pacing sim showed **Boo destroying 57 % of all dropped light units** for a good player. A good player merges on almost every drop, so combo 5 comes often, and on a tidy board the "smallest" lights are candles and lanterns. With the cap Boo takes 5 %, and he really is a helper.

## 5. Simulation for the bot
`simulate(col)` = `simBoard(world._tiers(), held, col, world._simCtx())`. It is a pure, instant copy of the same rules: the same `findGroups`/anchor, pumpkin wake, super moon, goal leaving, Boo's targets, and tidy-up after a goal. It makes no events, doesn't advance the RNG, and doesn't touch state. It returns `{ok, merges, points, maxTier, heights[], holes, gameOver, board, combo, goal, boos, woken, pumpkins, rise}`. `woken` = pumpkins this drop wakes, `pumpkins` = pumpkins left on the board, and `rise` = a night creep follows this drop. The rise itself is not simulated: its column is a seeded random pick, and simulate must not advance the RNG. `holes` counts covered pumpkins and smaller lights under bigger ones. `gameOver` = after this drop nothing can take `next`. A test (with rises switched off) drops up to 150 lights across 6 bot games and checks that the real board, points, merges and game over match the prediction exactly.

## 6. Weather (`EG.Weather`)
`update(dt, rect)` takes the board rectangle (`world.layout` works as is). The **calm band** is the board ± 30 px, extended up 2 cells over Ember's strip. Front-layer *ambient* particles never enter it: fireflies are pushed back to the nearest edge and turn around, and leaves and pages respawn at the top of a side gap. Merge bursts are effects and are drawn where they happen. Caps: 139 total, 48 burst, 22 trail, 12 splash. Ambient targets: courtyard 24 fireflies + 10 leaves, cellar 9 drips + 22 crystal sparkles, library 42 dust motes + 2 pages, tower 48 stars + shooting stars.

- **Fireflies:** heading = `ph + 1.7·sin(t·f + φ) + 0.7·sin(2.3·t·f + ph)` (a smooth "Perlin-ish" wander), speed breathing ±30 %, glow pulse.
- **Leaves and pages:** pendulum fall. They sink fastest at the bottom of the swing, the rotation follows the swing, and pages flip (`flipX`) as they tumble.
- **Drips:** grow on the ceiling for 0.4–2.4 s, fall at 900 px/s², and splash into 3 tiny drops.
- **Crystals and stars:** cubic twinkle.
- **Dust:** Brownian drift, brightest on the centre line of a diagonal light shaft.
- **Shooting star:** every 6–10 s (first one 2–5 s after entering the tower), 560–760 px/s across the upper sky, leaving `star` trail particles that fade in 0.35–0.55 s.
- Surplus particles fade out over 1.2 s on a place change, and the ambient glow crossfades in about 2 s.

## 7. Bot (`EG.Bot`)
When `phase === 'aim'` it picks a column at once and **aims Ember there** (she flies over like a moving finger). It then drops after a reaction time of `0.25 + 0.45·(1−skill)` s (±20 %). Column score:

```
points + 30·merges + 12·(same-tier neighbours of the landing cell) + 4·(sits on tier+1)
− 0.9·Σheight² − 25 (if any column ≥ rows−1) − 7·holes + 250·goal − 5000·gameOver
+ skill·(45·woken − 10·pumpkins on board − 0.6·Σheight² if a rise follows)
+ 0.5 · best follow-up score with `next` (one-step lookahead, skill ≥ 0.8)
```

The pumpkin terms are what separates good from careless play under the night creep.

The choice is a soft-max with temperature `3 + 160·(1−skill)²` (skill 1 ≈ argmax, skill 0 ≈ random). `bot.stats {drops, thinks, lookaheads, refused, bestPicks}`. It never drops into a refusing column.

## 8. Simulated pacing and survival (960×540, bot at 60 fps, 16 seeds, each game capped at 15 min)

Level times are seconds per level, averaged over the seeds that got there (count in brackets when not all 16 did). L4 = from the star to the **moon**. "final level" is the level the game ended on (or reached at 15 min).

| diff | skill | L1 | L2 | L3 | L4 moon | game overs | median survival | final level, median (min–max) | reached L2 | reached moon |
|---|---|---|---|---|---|---|---|---|---|---|
| easy | 0 (random) | 42 | 65 | 100 | 155 (15) | 3/16 | > 15 min | 7 (3–9) | 16/16 | 15/16 |
| easy | 0.3 | 35 | 60 | 89 | 147 (15) | 5/16 | > 15 min | 7 (3–8) | 16/16 | 15/16 |
| easy | 0.5 | 34 | 52 | 90 | 131 | 7/16 | > 15 min | 7 (6–8) | 16/16 | 16/16 |
| easy | 0.8 | 23 | 46 | 71 | 110 | 0/16 | > 15 min | 8 (7–9) | 16/16 | 16/16 |
| easy | 0.95 | 23 | 47 | 71 | 105 | 2/16 | > 15 min | 8 (6–10) | 16/16 | 16/16 |
| normal | 0 (random) | 40 | 66 | 89 (15) | 110 (4) | 16/16 | 5.1 min | 3 (2–5) | 16/16 | 4/16 |
| normal | 0.3 | 35 | 52 | 89 | 90 (5) | 16/16 | 4.7 min | 3 (3–6) | 16/16 | 5/16 |
| normal | 0.5 | 29 | 49 | 75 | 117 (4) | 16/16 | 4.4 min | 3 (3–6) | 16/16 | 4/16 |
| **normal** | **0.8** | **21** | **51** | **67** | **120 (10)** | 15/16 | **8.9 min** | **6 (3–9)** | 16/16 | **10/16** |
| normal | 0.95 | 21 | 45 | 65 | 109 (13) | 16/16 | 9.5 min | 6 (3–7) | 16/16 | 13/16 |
| hard | 0 (random) | 39 | 63 | 106 (14) | 117 (3) | 16/16 | 5.4 min | 3 (2–5) | 16/16 | 3/16 |
| hard | 0.3 | 34 | 57 | 96 | 126 (4) | 16/16 | 5.1 min | 3 (3–6) | 16/16 | 4/16 |
| hard | 0.5 | 28 | 60 | 89 | 113 (6) | 16/16 | 4.8 min | 3 (3–5) | 16/16 | 6/16 |
| hard | 0.8 | 21 | 49 | 90 | 137 (7) | 16/16 | 5.7 min | 3 (3–7) | 16/16 | 7/16 |
| hard | 0.95 | 21 | 43 | 93 | 98 (9) | 16/16 | 8.6 min | 5 (3–6) | 16/16 | 9/16 |

How to read it:
- **Progress is supply-bound.** A goal of tier *g* needs 2^(g−1) tier-1 "units" on the board at once. Each drop adds 1.4–3.1 units (the zone weights), and units leak through 3-merges (one member is lost, about 15–22 %), Boo (about 5 %) and tidy-ups. So level *times* come from the spawn weights. *Survival* comes from the night creep.
- **Normal, decent player (0.8):** 21 / 51 / 67 / 120 s, mean 65 s per level, inside the 45–90 s target. They reach the moon in 10 of 16 runs (about 4½ min of play), then usually fall in the first loop, where rises come faster and bigger. Median survival is 9 min.
- **Normal, casual (0.3):** always reaches the lantern (level 2). It usually gets stuck in the tower (level 3) and loses at about 4–5 min. Random play loses at a median of 5 min, and only a few lucky runs reach the moon.
- **Easy** is pressure-free until the library (level 2), so 0.3 reaches level 2 in 16/16 runs. Losses only start late (loops, 10+ min) and come mostly from sloppy play.
- **Hard** (6 rows, 14–22 % dropped pumpkins plus the night creep) ends most games in the tower at about 5 min. Only good players reach the moon: 0.8 in 7/16 runs, 0.95 in 9/16.
- The bot drops about 35–43 lights a minute. A real child is about half as fast, so all times are roughly ×2 for a child (the night creep counts drops, not seconds, so survival in *drops* is the same).

## 9. Contract notes / deviations
- New item state **`'rolling'`** (a woken pumpkin rolling off). It also uses `item.vx` and `item.rot` (rotation in rad). Other extra item fields: `sv` (squash velocity), `popT`, `touch`, `life`, `acc`, and `_riseT`/`_ry0` (the push-up animation). Ember also has `vy` (the release bob).
- `merge` for 8 + 8 is `{tier: 8, super: true, …}`, since there is no tier 9 picture.
- Boo only carries pumpkins and tiers ≤ 3 (`helperMaxTier`), and does a fly-by when there is nothing to carry (`helper` + `helperDone` still fire). `helperDone` fires when he starts to fly away, which is when gravity resumes.
- Overflow drop (full column, matching top): the anchor is the column's top light, not the landed one (which is above the grid).
- The points combo factor uses the combo *before* the merge.
- `bounce` fires at the touch-down after the bounce. `land` fires at the first touch-down. A light that lands too slowly emits `land` only.
- `simulate()` returns extra fields (`board, combo, goal, boos`). `world.simBoard(board, held, col, ctx)` is public for the bot's lookahead. Also exposed: `world.isBusy()`, `world.colX(c)`, `world.rowY(r)`, `EG.World.points/value/goalFor/goalBonus`.
- `setLayout` drops exit animations (carried / ascending / rolling items) instead of rescaling them, and snaps falling items straight to rest (no `land` event).
- `boardX` uses `Math.round((w − boardW)/2)` exactly as written, which gives 343 at 960 wide (§2 says 342).
- **Night creeps** (added after the first playtest pass, not in DESIGN §5.1): event `{type:'rise', col, item}`, `world.riseIn` / `riseEvery`, `stats.rises`, presets `riseFrom/riseEvery/riseCount`. A rise lifts `riseCount` pumpkins (in distinct columns), not always one. A rise due when every column is full is a game over.
- Weather: bursts are exempt from the front-layer avoidance (they are the merge effects themselves). The calm band also covers Ember's strip above the board.
