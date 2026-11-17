# Dottie's Reef Parade — Mechanics

Files: `game/js/rng.js` (`RP.RNG`), `game/js/world.js` (`RP.CONFIG`, `RP.DIFFICULTY`, `RP.BIOMES`, `RP.World`),
`game/js/weather.js` (`RP.Weather`), `game/js/bot.js` (`RP.Bot`). Contract: `docs/DESIGN.md` §5.1–5.4.
Tests: `node tests/unit/run.js` (24 tests, about 6 s). Balance: `node tests/sim/players.js quick [N] [maxMin]` (kid / casual / spam player models) and `node tests/sim/run.js [N] [maxMin]` (bots). Results go to `tests/sim/results/`.

Internal names kept from the scaffold: `w.hero` = Dottie, `w.notes` / `note` events = sea stars, `w.trail` = the parade, `biome` = season. **There is no boss and no pillows any more**: `w.boss`, `w.pillows`, `pillowHits`, `dodges`, `predictSpike` and every `boss*` / `pillow*` / `dodgePoints` key are gone (not stubbed).

## 1. Model and units
- Logical px (world coordinates = logical canvas coordinates), seconds, radians. y points down, so a **positive** heading change turns Dottie **clockwise** on screen.
- `update(dt)` takes any dt (for example 0.1 × 64 at high game speed) and runs fixed sub-steps of `cfg.step = 1/120 s` with an accumulator `w._acc`. Same seed + same inputs at the same sub-step → identical state, whatever the dt partition (tested).
- Each sub-step first saves `_px,_py` on Dottie, every parade star and every note (the golden star too). Renderer: `draw = _p + (now − _p) · (w._acc / w.cfg.step)`.
- Hot loop: the path history is a `Float64Array` ring buffer (`pathCap` 2048 points); the parade layout is one pass along it. No allocations per step except new stars and events. 10 simulated minutes (world + bot at 60 fps) run in about 0.9 s.

## 2. Dottie
- **Speed**: target `v = min(speedMax, (speed0 + speedPerBiome·season)·speedLapMul^lap + speedPerNote·parade)`, ×0.4 in ready/cleared, ×0.85 while dizzy, eased at `speedAccel` (160 px/s²).
- **Steering**: the wished heading comes from `setDir`, or from the pointer target (ignored within `targetDead` 48 px, so she never orbits the finger). Desired turn rate = `clamp(err·turnGain, ±turnRate·auth)`; the angular velocity eases to it with `turnEase` 12/s (no snapping; |Δheading| per step ≤ turnRate·h). Min radius = v/turnRate ≈ 36 px. Dizzy: auth = 0.35.
- **Lean** = ease(turn/turnRate · v/speed0) at 8/s, −1..1, + = leaning into a clockwise turn.
- **Wall slide**: within `wallSlide` 36 px of the coral, the part of the wish pointing into it is dropped, so holding a direction into an edge glides along it.
- **Edge bounce** (`bounceHeading(h0, wx, wy, pref, x, y)`, public so the bot uses the same model): mirror the outward component; keep the new heading ≥ `bounceSep` (60°) from straight back (a head-on hit glances off; near a corner it glances away from the other wall; in a corner the glance is limited to 30°); inward component ≥ sin 15°. Then speed × `bounceDip` 0.78, 0.15 s steering lock, `bounce` event (≤ 1 per 0.08 s), and `bounceGrace` 0.8 s without self-bonks (the fold-back after a bounce is never the child's fault). Ten minutes of random steering stays inside, never sticks, never bonks (tested).
- **Flip** (`action()`): when `flip ≥ 1` and not already flipping. z = 4·H·u(1−u) with H = 28 px, u = jump/jumpTime (0.65 s). Recharges linearly over `flipRecharge` (3 s). Events `flip` → `land` → `flipready`.

## 3. Parade
- A path point is recorded every `pathStep` 3 px. Parade star *i* sits at arc length `(i+1)·trailSpacing` behind Dottie, exactly on her path (tested to 1e-6).
- Bob: `z = bounceAmp·(v/speed0)·|sin(hop − 0.7·i)|`; `hop` advances 2.4 bobs/s at speed0, so a wave runs down the parade.
- A picked star **hops onto the end** over `joinTime` 0.25 s (ease-out, +18 px hop; `pop` 1 → 0). Joining stars never bonk.
- **Self-bonk**: Dottie vs parade stars with index ≥ `safeNeck`, distance < `bonkR`; ignored while z > `airZ` (6 px), while `invuln`, during `bounceGrace`, and inside the soft edge strip (`edgeSafe` from the coral). A bonk: −1 heart, invuln, dizzy 0.6 s, the parade is cut at the hit index and the rest goes loose.
- Every parade item carries **`worth`** (1, or 5 for a golden star). **`w.song` = sum of worth over the parade**, capped at `songTarget` (the song *is* the parade): a bonk lowers it, regrabs restore it.

## 4. Sea stars
- `notesOnField` normal stars stay on the sand. A spawn spot is ≥ `spawnMinDist` from Dottie (capped at 0.4 × the short arena side + 40, so tiny arenas still work), ≥ 40 px inside, ≥ 30 px from the parade, ≥ 70 px from other stars, and outside every `avoid` circle. 3 passes × 30 tries with relaxing rules. `spawn` lasts 0.3 s, then `idle`. Pick radius = heroR + 16 = 30 px (also while flipping). `goldChance` = 0: normal stars are never gold.
- **Points**: star = `10 + 2 × parade length before the pickup`; golden star ×`goldMul` (5); regrab = 5; season clear = hearts × 100.
- **Loose stars** (cut off by a bonk) scatter outward (±0.6 rad, 70–140 px/s), hop ballistically (vz 150–230, g 700, apex 16–38 px) with one small bounce (restitution 0.35), slide to a stop (friction 5/s), stay inside the arena, can be re-grabbed after 0.35 s when z < 20, blink in their last 1.2 s and pop after `looseLife` (`loosegone`). They keep `gold` and `worth`, so a cut-off golden star re-grabbed is worth 5 again (for 5 points, and it is not counted as a new golden star).

## 5. The golden sea star (the twist)
A `notes` item with `gold: true`, `worth: 5`, internal flag `_g`; `w.goldStar()` returns it (or null), `w.goldNow()` spawns one now if none is out (test hook). **At most one at a time.**
- **Timing**: `w._goldNext` counts down only while `playing` and none is out: first at `goldFirst` 10 s of play per level, then `goldEvery` 18 s after the previous one was **caught or finished hiding**. Never during `ready` / `cleared`. Tested: 10 s, then exactly +18 s after each end.
- **Spawn**: ≥ `goldMinDist` 160 px from Dottie, ≥ `goldEdge` 60 px inside the arena, outside the avoid circles; event `goldspawn {x, y, id}`. It starts heading away from Dottie ±1.2 rad.
- **States**: `spawn` (0.4 s, pops out of the sand, does not move, catchable) → `flee` → after `goldLife` (9 s; Easy 11, Hard 7; counted from spawn) `hide` (0.5 s burrow, keeps gliding to a stop, **not** catchable) → removed. Event `goldhide {x, y, id}` at the start of the burrow, `w.goldMissed++`. The renderer blinks it when `life < goldBlink` (2 s).
- **Steering** (everything eased, so it reads as a shy little creature, not a cursor):
  - desired direction D = wander heading (drifts with two slow sines) + **flee** `3·(1 − d/goldFear)` away from Dottie when she is within `goldFear` + **walls** an inward push `2.2·(1 − dw/goldWall)²` per wall in the 80 px band + the same push out of the avoid circles (flip button);
  - **slide**: within 40 px of a wall the component of D pressing into it fades to 0, so it glides along the wall;
  - **corner escape**: when scared (fear > 0.25) and the walls cancel the flee (≥ 2 walls near, or |D| < 0.7) it **darts sideways** perpendicular to Dottie's approach, on the side with more room / against her motion, for `goldDartTime` 0.8 s at `goldDart` ×1.3 speed (side latched: no dithering);
  - heading turns toward atan2(D) + a wobble (`goldWobble` 0.35 rad, two sines) with a turn rate capped at `goldTurn` 2.6 rad/s (×1.4 while darting), eased at `goldTurnEase` 5/s;
  - speed eases (`goldAccel` 120 px/s²) toward `goldSpeed × level speed × (goldCalm … 1 by fear)` (× goldDart while darting): Normal 28–63 px/s vs Dottie's 150; Easy 15–34 px/s vs 105;
  - position clamped to the arena (margin `goldR` 18) and pushed out of avoid circles; the heading is never snapped. `vx, vy` = the actual motion (for the renderer and the bot).
  - Tested: 10 min of random play with a star always out → never outside the arena or under the flip button, 0 stalls, speed / turn caps and easing hold; parked Dottie in each corner's mouth → it escapes the corner in < 3.5 s; a close Dottie → it swims away.
- **Catch** (within heroR + `goldPickPad`, 34 px; Easy 38, Hard 30): one golden star (worth 5) joins the parade, song += 5 (capped), points = (10 + 2 × parade) × 5, `w.golds++`, events `note {gold: true, worth: 5, points, …}` then `gold {x, y, points, worth, id}`. If it completes the song: `songdone` + `cleared` as usual.

## 6. Levels
- `startLevel(i)`: season = i % 4 (`RP.BIOMES` = Spring Bloom, Summer Shallows, Autumn Kelp, Winter Glow), lap = ⌊i/4⌋, song = `songTargets[season] + songPerLap·lap` (cap 40). Dottie back at the centre heading right; gold timer reset to `goldFirst`. `ready` 1.2 s → `go` → `playing`.
- Song done → `songdone` + `cleared {bonus = hearts·100, level}` → hearts + `healOnClear`; all stars removed. After 2.4 s → next level (`biome` event).
- Last heart → `dead {score}`; Dottie glides to a stop.

## 7. Weather (`RP.Weather`)
Fixed 1/60 s steps, deterministic for any dt partition, catch-up capped at 5 s per call. Counts scale with the canvas area (×0.6…×1.6); rays and jellies scale only a little with width. Hard cap 158 (fx ≤ 30, fish ≤ 12); tested for 6 sizes incl. 720×1600 × 4 seasons with bursts and season switches back and forth: max < 160. Depth d ∈ (0, 1] gives parallax: far = small, faint, slow.

| Season | Emitters at 960×540 | Motion |
|---|---|---|
| Spring Bloom | 16 + 4 front `spawn` specks, 10 pink `dot`s, 2 `fish` schools (3–6 fish) | specks: buoyant rise eased to a terminal speed ∝ depth (drag), pendulum sway, slow spin; schools: a gentle sine path across the screen at 34–52 px/s, loose formation with per-fish lag, wobble and tail wiggle, `flipX` = swim direction, pause 2–6 s off-screen between crossings |
| Summer Shallows | 4 `ray` shafts, 10 + 3 front `bubble`s, 8 motes, 1 school | rays hang from the surface (64×256 sprite, size grows with tall canvases), slow sway of position and slant, caustic shimmer, alpha ≤ 0.2; bubbles: buoyancy + drag → terminal rise that grows by 60 % toward the top while the bubble expands 25 %, zig-zag wobble + shape wobble |
| Autumn Kelp | 9 + 3 front `kelp` leaves, 14 amber motes | the **current** `wx.current` changes slowly (0–47 px/s, smooth sines, water inertia 0.5/s); leaves are near-neutrally buoyant (sink 3–8 px/s), carried by the current, pendulum swing + tumbling rotation and flip that speed up when the current is strong; they enter from the upstream side |
| Winter Glow | marine snow 26 `dot` / 16 `snow` / 6 front `snow`, 2 + 1 front `jelly` | snow: 3 depth layers, fall 7–12 / 12–20 / 22–32 px/s, size ∝ depth, sway, parallax drift; jellies: pulse every 2.2–3 s — the bell squeezes (`flipX` → 0.78, size +8 %), a thrust kicks it up, drag slows it, it sinks a little until the next pulse, glow brightens on each pulse |

Extras: Dottie leaves bubbles while she flips (10/s) or turns hard (|turn| > 3 rad/s, 4/s) — `env.hero`; `burst(sprite, x, y, n ≤ 12)` with `'bubble'` (rises fast, wobbles, pops), `'sand'` (puffs out, heavy drag, settles, fades) or `'sparkle'`. `ambient`: spring pink 0.05 / fog 0.03, summer aqua 0.045 / 0.02, autumn amber 0.055 / 0.04, winter blue 0.06 / 0.05, blended during the 2 s hand-over.

## 8. Bot (`RP.Bot`)
Uses only `setDir` / `action`; thinks every 0.05 s + (1 − skill)·0.25 s.
1. **Target**: lowest `d/v + |Δθ|/turnRate` (+ a loop penalty if the star is inside the turning circle). Loose stars ×0.6 (skipped if they would vanish first). **The golden star comes first** (×0.3) when it can be reached before it hides: its position is predicted along `vx, vy` for the travel time (2 fixed-point passes), and the bot aims a quarter of the travel time ahead. 25 % hysteresis.
2. **Rollouts**: 7 turn rates over 0.35 + 0.45·skill s with the world's eased turn, bounce lock and `bounceHeading`; danger = a parade star (index ≥ safeNeck, outside the edge strip) within bonkR + margin; cost = closest approach to the (moving) target + a small turn penalty, + 1e5 if dangerous.
3. **Flip**: if the best line still bonks within 0.32 s and a flip would clear it (noticed with chance 0.55 + 0.45·skill). Aim noise 0.3·(1 − skill) rad.
`bot.stats`: thinks, flips, trailFlips, notes, bonks, golds, goldMissed, goldChases, levels, maxLevel.

## 9. CONFIG (normal) and difficulty overrides
| Key | Normal | Easy | Hard | Why |
|---|---|---|---|---|
| speed0 / speedPerBiome / speedMax / speedLapMul | 150 / 6 / 230 px/s / 1.08 | 105 / 4 | 185 / 7 / 330 / 1.15 | ≈ 6 s to cross on Normal; slow for little ones; Hard laps get much faster |
| turnRate / turnGain / turnEase | 4.2 rad/s / 9 / 12 | | 3.6 | radius ≈ 36 px; Hard turns wider |
| targetDead / wallSlide / bounceGrace | 48 / 36 px / 0.8 s | | – / – / 0 | |
| trailSpacing / safeNeck / bonkR / edgeSafe | 22 / 6 / 14 / 36 px | 22 / 7 / 12 / 40 | 26 / 3 / 18 / 0 | forgiving tail; Hard has no soft strip |
| heartsMax / invulnTime / healOnClear | 3 / 1.5 s / 1 | 5 / 1.8 | – / 1.2 / 0 | |
| jumpTime / jumpHeight / flipRecharge | 0.65 s / 28 px / 3 s | 0.8 / – / 2.4 | | |
| notesOnField / spawnMinDist | 2 / 200 px | – / 160 | 1 / 200 | REQUIREMENT: 2 stars; each one is a real swim (the golden star adds 5, so seasons were too short at 120) |
| songTargets / songPerLap / songMax | 10, 12, 14, 16 / 2 / 40 | 8, 10, 12, 14 | 16, 20, 24, 28 / 3 | REQUIREMENT on Normal |
| notePoints / notePerTrail / goldMul / regrabPoints / clearBonusPerHeart | 10 / 2 / 5 / 5 / 100 | | | REQUIREMENT |
| looseLife | 4 s | 5 | 3.5 | |
| goldFirst / goldEvery | 10 / 18 s | | | REQUIREMENT |
| goldLife / goldBlink / goldSpawnTime / goldHideTime | 9 / 2 / 0.4 / 0.5 s | 11 | 7 | REQUIREMENT 9 s (Easy 11) |
| goldSpeed / goldCalm / goldFear | 0.42 × level speed / 0.45 / 170 px | 0.32 / – / 140 | 0.5 / – / 200 | catchable by a 5-year-old on Easy |
| goldAccel / goldTurn / goldTurnGain / goldTurnEase / goldWobble | 120 px/s² / 2.6 rad/s / 4 / 5 /s / 0.35 rad | | | gentle, creature-like curves |
| goldWall / goldDart / goldDartTime / goldR / goldEdge / goldMinDist | 80 px / 1.3 / 0.8 s / 18 / 60 / 160 px | | | wall-aware, never pinned |
| goldPickPad / goldWorth | 20 px / 5 | 24 | 16 | |
| readyTime / clearTime / step | 1.2 / 2.4 / 1/120 s | | | |

## 10. Tuning results
Player models (`node tests/sim/players.js quick 30 8`, landscape 960×540, 8 min cap; see the header of `tests/sim/players.js`): **kid** = 5–6-year-old (finger on the nearest star, the golden one 80 % of the time, 350–600 ms reaction, ±25° aim, notices the parade 35 % of the time); **casual** = casual adult (200 ms, plans around the parade); **spam** = casual + flip every frame.

| Diff | Model | Died ≤ 8 min | Clear season 1 / 2 / 3 / 4 | s per season (median) spring / summer / autumn / winter | Bonks/min | Golden stars caught |
|---|---|---|---|---|---|---|
| easy | kid | 0/30 | 100 / 100 / 100 / 100 % | 18 / 30 / 34 / 40 | 0.13 | 85 % (≈ all it chases) |
| easy | casual | 0/30 | 100 % all | 14 / 17 / 21 / 26 | 0.01 | 99 % |
| normal | kid | 0/30 | 100 % all | 26 / 30 / 40 / 37 | 0.05 | 79 % |
| normal | casual | 0/30 | 100 % all | 14 / 18 / 22 / 25 | 0.00 | 99 % |
| hard | kid | 30/30 | 97 / 57 / 30 / 3 % | 62 / 55 / 66 / 82 | 0.92 | 58 % |
| hard | casual | 6/30 | 100 % all | 33 / 35 / 42 / 52 | 0.20 | 96 % |
| any | spam | same as casual | | | | flip spam gives no advantage (pickups don't need it; it only wastes the flip) |

Bots (`node tests/sim/run.js 20 10`, 10 min cap): easy and normal 0/20 deaths for skill 0.4–1, season 1 in 16–19 s; hard skill 0.4: 6/20 died, 39 / 49 / 59 / 64 s per season; hard skill 0.7 / 1: 0/20, 37–60 s per season, about 0.02 / 0.00 bonks per min.

- **Pacing**: the models play about 1.5–2× faster than real children (they never look away or lose the finger), so a real 6-year-old on Normal should take roughly 40–80 s per season and a casual adult on Hard 45–90 s. Season 1 on Normal is cleared 30/30 by the kid model (median 26 s), with almost no bonks.
- **Golden star**: on Easy the kid model catches it every time it decides to chase it (85 % overall with 20 % ignored on purpose). It is shy but slow: on Easy 15–34 px/s against Dottie's 105.
- **Hard**: a real challenge for children (kid model 0/30 survive 8 min) and casual adults (6/30 die). The skill-1 bot (sees everything, reacts in 50 ms, 0.8 s look-ahead) still never dies, and it didn't in the boss version either (0/30). Wider turns, faster laps, a longer parade with bigger gaps, no soft edge and tighter bonk radii were all tried (`tests/sim/sweep.js`, 25-min runs too). None of them made it lose without making Hard unfair for people.
- History: removing the boss made Normal about 20 % faster and safer; `spawnMinDist` 120 → 200 (Normal / Hard) gives back the swim time the golden star's +5 takes away.

## 11. Contract additions (beyond DESIGN §5.1)
- World: `w.arena {x0,y0,x1,y1}`, `w.avoid`, `w.levelsCleared`, `w.regrabs`, `w.levelInfo(i)`, `w.pathPoint(d, out)`, `w.bounceHeading(...)`, `w.inEdgeZone(x, y)`, `w.goldStar()`, `w.goldNow()`, `w._goldNext` (s until the next golden star while none is out), `w.getState()` (adds `golds, goldMissed, gold {x,y,state,life} | null, goldNext`), `w._acc`.
- `hero.happy`, `hero.lock`. Parade items: `worth`, `gold`, `pop` (1 → 0), `join` (0 → 1). Notes: `worth`, `heading`; the golden star also has `speed`, `turn`, `vx, vy` (its actual motion).
- Events: `go {level}`, `loosegone {x,y}`, `goldspawn {x,y,id}`, `goldhide {x,y,id}`, `gold {x,y,points,worth,id}`; `note` carries `gold, worth, regrab, song, index`; `regrab` carries `gold, worth`; `biome` carries `lap`; `flip` / `land` carry `x, y`.
- Weather: `burst(sprite, x, y, n)`, `current {x, y}`, `schools[]`, `fullCount(b)`, `stats()`, `Weather.SPRITES`, `Weather.BIOMES`, `Weather.MAX`. Particles also carry `kind, biome, depth` (fx particles have `biome −1`); the kinds are `rise, bubble, ray, fish, tumble, drift, sink, jelly, bubblefx, sand, sparkle`.
