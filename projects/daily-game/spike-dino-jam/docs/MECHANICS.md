# Spike's Dino Jam — Mechanics

Files: `game/js/rng.js` (`DJ.RNG`), `game/js/world.js` (`DJ.CONFIG`, `DJ.DIFFICULTY`, `DJ.BIOMES`, `DJ.World`),
`game/js/weather.js` (`DJ.Weather`), `game/js/bot.js` (`DJ.Bot`). Contract: `docs/DESIGN.md` §5.1–5.4.
Tests: `node tests/unit/run.js` (21 tests, about 8 s) · balance: `node tests/sim/run.js [N] [maxMin] [diffs]`.

## 1. Model and units
- Logical px (world coordinates are the logical canvas coordinates), seconds, radians. y points down, so a **positive** heading change turns Spike **clockwise** on screen (to his right).
- `update(dt)` takes any dt (for example 0.1 × 64 at high game speed). It runs fixed sub-steps of `cfg.step = 1/120 s` with an accumulator `w._acc` (0..step). Same seed + same inputs at the same sub-step → identical state, whatever the dt partition (tested).
- Each sub-step first saves `_px,_py` on the spike, every trail item, every note, every pillow (plus `_pcx,_pcy,_pz` for the flying pillow) and the boss. Renderer: `draw = _p + (now − _p) · (w._acc / w.cfg.step)`.
- Hot loop: the path history is a `Float64Array` ring buffer (`pathCap` 2048 points). The trail layout is one pass along it. No allocations per step, except new notes, pillows and events.

## 2. Spike
- **Speed**: target `v = min(speedMax, (speed0 + speedPerBiome·biome)·speedLapMul^lap + speedPerNote·trail)`, ×0.4 in ready/cleared, ×0.85 while dizzy. Speed eases toward the target at `speedAccel` (160 px/s²).
- **Steering**: the wished heading comes from `setDir`, or else from the pointer target (ignored within `targetDead` 24 px, so Spike never jitters around the finger). Desired turn rate = `clamp(err·turnGain, ±turnRate·auth)`. The angular velocity eases to it with `turnEase` 12/s, so the first step of a full turn is under 15 % of max and full rate comes after about 0.25 s. There is no snapping, and |Δheading| per step ≤ turnRate·h. Min radius = v/turnRate ≈ 36 px. Dizzy: auth = 0.35.
- **Lean** = ease(turn/turnRate · v/speed0) at 8/s, clamped to −1..1. + means leaning into a clockwise turn (renderer: about 0.25 rad × lean).
- **Wall slide** (playtest addition): within `wallSlide` 36 px of a bush, the part of the wish that points into that bush is dropped. Holding a key into an edge then glides Spike along it instead of looping him back into his own train. A wish straight into the bush slides the way he is already going.
- **Edge bounce** (`bounceHeading(h0, wx, wy, pref, x, y)`, public so the bot uses the same model):
  1. Mirror the position back inside and mirror the outward heading component.
  2. **Never straight back**: the new heading is kept ≥ `bounceSep` (60°) from the reversed incoming heading. A head-on hit glances off to the side of the player's wish. Near a corner it glances away from the other bush. In a corner, where only a 90° cone is left, the glance is limited to 30°.
  3. **No skimming**: the inward component is ≥ sin 15° for every bush that was hit.
  Then: speed × `bounceDip` 0.78, 0.15 s steering lock, `bounce` event (at most one per 0.08 s), turn × −0.5. Ten minutes of random steering stays inside the arena, never sticks, and never bonks (tested).
- **Kickflip**: `action()` when `flip ≥ 1` and on the ground. z = 4·H·u(1−u) with H = 28 px and u = jump/jumpTime (0.65 s). Charge refills linearly from take-off over `flipRecharge` (3 s). Events: `flip` → `land` → `flipready`.

## 3. Trail (melody train)
- A path point is recorded every `pathStep` 3 px. Trail note *i* sits at arc length `(i+1)·trailSpacing` (24 px) behind Spike, exactly on the path (tested to 1e-6 against `w.pathPoint(d)`).
- Bounce: `z = bounceAmp·(v/speed0)·|sin(hop − 0.7·i)|`, where `hop` advances 2.4 hops/s at speed0, so a wave runs down the train.
- A picked note **hops onto the end**: it flies from the pickup spot to its slot over `joinTime` 0.25 s (ease-out, +18 px hop). `pop` goes 1 → 0 for a scale pop. Joining notes never bonk.
- **Self-bonk**: Spike vs notes with index ≥ `safeNeck`, distance < `bonkR`. It is ignored while z > `airZ` (6 px), while `invuln`, and inside the **soft edge strip** (`edgeSafe` 36 px from the bush). The strip is a playtest addition: bounces fold the train back next to itself, and a bush should never cost a heart. A bonk costs −1 heart, gives invuln 1.5 s and dizzy 0.6 s, and cuts the trail at the hit index. Notes from there on become loose.
- **Song** = `trail.length` (the song *is* the train). A bonk or pillow lowers it until the loose notes are re-grabbed.

## 4. Notes
- `notesOnField` idle notes are kept on the field. A spawn spot must be ≥ 120 px from Spike (relaxed in a tiny arena), ≥ 40 px inside the arena, ≥ 30 px from any trail note, ≥ 70 px from other notes, and outside every `avoid` circle (+ noteR). Spawns use 3 passes of 30 tries with relaxing rules. 8 % are gold. `spawn` lasts 0.3 s, then `idle`. Pick radius = spikeR + 16 = 30 px. Pickups also work while airborne.
- Score: `(10 + 2 × trail length before the pickup) × (gold ? 3 : 1)`. A regrab gives 5 and emits both `regrab` and `note` (`regrab: true`).
- **Loose notes** scatter outward from the cut point (±0.6 rad, 70–140 px/s). They go ballistic in z (vz 150–230 px/s, g 700 → apex 16–38 px) with one small bounce (restitution 0.35), then slide to a stop (friction 5/s). They stay in the arena and can be re-grabbed after 0.35 s when z < 20. They blink in their last 1.2 s (renderer) and pop after `looseLife` 4 s (`loosegone`).

## 5. Mumbles and pillows
- `boss.next` counts down only while `playing`. The first visit comes at `bossFirst` 12 s, then a new visit starts every `bossEvery` 30 s (tested: 12 / 42 / 72 s). He enters from the side away from Spike.
- **Path** (6 s, one smooth function): `x = a + (b−a)·(u + 0.6·sin(2πu)/2π)` is fast at the edges and slow over the field. `y = lerp(top − 50, top + 0.22·H, sin πu) + 14·sin(2π·0.9t)·sin πu`. States by time: enter (0–1 s), hover (1–5 s), leave (5–6 s). frame = `throw` for 0.35 s after a throw, else fly1/fly2 at 4 flaps/s. On song done or game over he flies up and away (`_exit`).
- **Throws** happen at hover + 0.6 / 1.5 / 2.4 s. Pillow 1 lands **exactly** at `predictSpike(dur)` (linear prediction, clamped 30 px inside). Pillows 2 and 3 get ±`pillowSpread` (70 px).
- **Pillow flight**: the ground point goes linearly `(sx, sy) → (x, y)`, where (sx, sy) is the ground under Mumbles (his screen y + z0 70 px). Height: `z = z0 + vz0·t − ½g·t²`, with vz0 solved so z(dur) = 0 exactly. Draw the pillow at `(cx, cy − z)` and the shadow at `(x, y)`, scaled by `1 − z/zMax`.
- **Landing** within spikeR + 18: if airborne → `dodge` (+15). Else, if not invuln → `pillowhit`: dizzy 1 s, 3 notes off the **end** of the train go loose, no heart lost. Always `pillowland {x, y, hit}`. A landed pillow sits 1.5 s, then `pillowpuff` (cue for `weather.burst('feather', x, y)`).

## 6. Levels
- `startLevel(i)`: biome = i % 4, lap = ⌊i/4⌋, song = `songTargets[biome] + 2·lap` (cap 40). Spike goes back to the centre heading right, with a fresh straight path. `ready` lasts 1.2 s (`go`), then `playing`.
- Song done → `songdone` + `cleared {bonus = hearts·100}` → hearts +1 (cap). Notes and pillows are cleared and the boss leaves. After 2.4 s → `startLevel(level+1)` (`biome`).
- Last heart → `dead {score}`. Spike rolls to a stop.

## 7. Weather (`DJ.Weather`)
Fixed 1/60 s steps. It is deterministic for any dt partition. Catch-up is capped at 5 s per `update` call, since this layer is purely cosmetic. Counts scale with the canvas area (×0.6…×1.6) and the hard cap is 158 (tested for 6 sizes × 4 biomes, with bursts and biome hand-overs: max < 160).

| Biome | Emitters (at 960×540) | Motion |
|---|---|---|
| Fern Meadow | 4+2 butterflies, 8 petals, 3 leaves, 10 pollen dots | flutter (wander + bob, wing flap = \|flipX\| 0.25..1 + size wobble); pendulum drift (tilt follows swing, tumble) |
| Misty Swamp | 6+2 mist blobs, 10+4 fireflies, 6 dots | mist: slow drift, sin fade over a 9–15 s life, alpha ≤ 0.24; fireflies: wander + glow pulse |
| Red Rock Canyon | 12+3 dust wisps, 14 sand dots | gust: wind × (0.35 + 1.3·gust(t)), where gust = a smooth sum of sines, squared (long calms, sudden puffs) |
| Snowy Peaks | 26 dots / 18 flakes / 7 front flakes | fall in 3 depth layers (0.25/0.55/1): speed and wind ∝ depth, pendulum sway |

Extras: feathers drift from Mumbles while he visits (`env.boss`), sparkles fly under Spike while airborne (`env.spike.jump`), and `burst(sprite, x, y, n)` gives one-shot `'feather'` or `'sparkle'` puffs. `ambient`: meadow warm 0.04, swamp teal 0.06 + fog 0.08, canyon orange 0.06, snow lilac 0.05. `resize(w, h)` scales positions.

## 8. Bot (`DJ.Bot`)
It uses only `setDir`/`action`. It thinks every 0.05 s + (1−skill)·0.25 s.
1. **Target**: the lowest `d/v + |Δθ|/turnRate` (+ a loop penalty if the note is inside the turning circle). Loose notes count ×0.6 and are skipped if they would vanish first. There is 25 % hysteresis.
2. **Rollouts**: 7 turn rates (−1…+1 × turnRate) over 0.35 + 0.45·skill s. They use the world's eased turn, bounce lock and `bounceHeading`. Danger = a trail note (index ≥ safeNeck, outside the edge strip) within bonkR + margin, or standing under a landing pillow. Cost = closest approach to the target + a small turn penalty, + 1e5 if dangerous (earlier = worse).
3. **Kickflip**: if the best line still bonks within 0.32 s and a hop would clear it, or if a pillow lands on the predicted spot within 0.6·jumpTime. Noticing chance = 0.55 + 0.45·skill. Aim noise = 0.3·(1−skill) rad.

## 9. CONFIG (normal) and difficulty overrides
| Key | Normal | Easy | Hard | Why |
|---|---|---|---|---|
| speed0 / speedPerBiome / speedMax | 150 / 6 / 230 px/s | 120 / 5 | 185 / 7 / 260 | crossing the arena takes about 6 s; slower for little ones |
| speedLapMul / speedPerNote | 1.08 / 0.6 | | | endless laps get faster |
| turnRate / turnGain / turnEase | 4.2 rad/s / 9 / 12 | | | radius ≈ 36 px, carving feel |
| targetDead / wallSlide | 24 / 36 px | | | |
| bounceDip / bounceLock / bounceSep / bounceMinIn | 0.78 / 0.15 s / 60° / 15° | | | soft bushes, never back into the trail |
| trailSpacing / pathStep / pathCap | 24 / 3 px / 2048 | | | |
| safeNeck / bonkR / airZ / edgeSafe | 4 / 17 / 6 / 36 px | 6 / 14 / – / 40 | 3 / 18 / – / 12 | forgiving tail |
| heartsMax / invulnTime / healOnClear | 3 / 1.5 s / 1 | 5 / 1.8 | – / 1.2 / 0 | |
| dizzyBonk / dizzyPillow / dizzySteer / dizzySpeed | 0.6 / 1.0 s / 0.35 / 0.85 | | | |
| jumpTime / jumpHeight / flipRecharge | 0.65 s / 28 px / 3 s | 0.8 / – / 2.4 | | |
| notesOnField / pickPad / spawnMinDist / spawnEdge | 2 / 16 / 120 / 40 | | 1 | |
| songTargets / songPerLap / songMax | 10,14,18,22 / 2 / 40 | 8,11,14,17 | 12,16,20,24 | |
| goldChance / notePoints / notePerTrail / goldMul / regrabPoints / dodgePoints | 0.08 / 10 / 2 / 3 / 5 / 15 | | | |
| looseLife / looseMinAge / looseG / looseBounce | 4 s / 0.35 s / 700 / 0.35 | 5 | 3.5 | |
| bossFirst / bossEvery / bossVisit / bossThrowAt | 12 / 30 / 6 s / 0.6,1.5,2.4 | | – / 25 | |
| pillowDur / pillowZ0 / pillowG / pillowSpread / pillowHitPad / pillowKnock / pillowLife | 1.3 s / 70 / 420 / 70 / 18 / 3 / 1.5 s | 1.6 | 1.15 / – / – / 55 | |
| readyTime / clearTime / step | 1.2 / 2.4 / 1/120 s | | | |

## 10. Tuning results (`node tests/sim/run.js 30 10`, 10 min cap)
| Diff | Skill | Died ≤ 10 min | Levels (median) | Biome 1 s | s per level lap 1 (meadow/swamp/canyon/snow) | Bonks/min | Pillow hits/min |
|---|---|---|---|---|---|---|---|
| easy | 0.4 | 0/30 | 14 | 25 | 25 / 31 / 40 / 48 | 0.06 | 0.07 |
| easy | 1 | 0/30 | 16 | 21 | 21 / 29 / 34 / 41 | 0.01 | 0.00 |
| normal | 0.4 | 1/30 | 14 | 27 | 27 / 35 / 44 / 49 | 0.10 | 0.08 |
| normal | 0.7 | 0/30 | 15 | 24 | 24 / 32 / 41 / 46 | 0.04 | 0.01 |
| normal | 1 | 0/30 | 15 | 22 | 22 / 30 / 36 / 43 | 0.04 | 0.00 |
| hard | 0.4 | 12/30 | 9 | 41 | 41 / 49 / 60 / 73 | 0.21 | 0.15 |
| hard | 1 | 0/30 | 12 | 33 | 33 / 41 / 50 / 60 | 0.02 | 0.00 |

Full table: `tests/sim/results/latest.md`.
- The bot sees everything and reacts in ≤ 0.15 s, so a 6-year-old is roughly a skill-0.4 bot at about half its pace. On normal that gives about 45–100 s per level, and biome 1 is cleared 30/30 even by the weakest bot. Unit test: skill 1 clears biome 1 on normal in 50/50 seeds (median 22 s).
- Tuning history:
  - The first version reflected the heading like a mirror. A head-on bounce then sent Spike straight back into his own train, and skill-1 bots died on normal in 3 of 10 games. Fixes: the 60° glance (`bounceSep`), corner-aware deflection, wall slide and the soft edge strip. Normal skill 1 went from 6 bonks/game to 0.04/min.
  - Hard was then unlosable, so it got faster speed, a thinner edge strip (12), tighter pillows and Mumbles every 25 s.
- Pillows rarely hit a bot (it steers around the shadow), but a child going straight is hit by pillow 1 every visit unless they turn or kickflip. That makes the telegraph a real but harmless lesson.
- Known edge case: holding a key into a **corner** for many seconds makes Spike loop in the corner, and a long train can then bonk outside the soft strip. Sliding along a straight bush is safe (tested for 3 s).

## 11. Contract additions (beyond DESIGN §5.1)
- World: `w.arena {x0,y0,x1,y1}`, `w.avoid`, `w.levelsCleared`, `w.regrabs`, `w.levelInfo(i)`, `w.pathPoint(d, out)`, `w.predictSpike(t, out)`, `w.bounceHeading(...)`, `w.inEdgeZone(x, y)`, `w.getState()`, `w._acc`.
- `spike.happy`, `spike.lock`. Trail items: `pop` (1 → 0), `join` (0 → 1). Pillows: `cx, cy` (current ground point), `z0`, `zMax`, `vz0`, `spin`, `_pcx/_pcy/_pz`. Boss: `throws`, `side`.
- Events: `go {level}` (ready → playing), `loosegone {x,y}`, `pillowpuff {x,y}`. `throw` also carries `tx, ty`, `biome` carries `lap`, `note` carries `regrab`, and `flip`/`land` carry `x, y`. `bossin` carries `x, y`.
- Weather: `burst(sprite, x, y, n)`, `fullCount(b)`, `stats()`, `Weather.SPRITES`, `Weather.BIOMES`. Particles also carry `kind, biome, depth`.
