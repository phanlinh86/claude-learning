# Bao's Arctic Reel: mechanics

Files: `game/js/rng.js`, `world.js`, `weather.js`, `bot.js`. Contract: `docs/DESIGN.md` §5.
Tests: `node tests/unit/run.js` (23 tests, about 1.3 s). Pacing: `node tests/sim/pacing.js [seeds] [minutes]`.

All motion runs in fixed sub-steps of **1/120 s**. Every moving object stores `prevX/prevY` at the start of each step, and `world.alpha` (0..1) is the leftover fraction, so the renderer draws `lerp(prev, cur, alpha)`. A frame longer than 0.25 s is clamped, so a hidden tab never fast-forwards. With the same seed and the same `press`/`release` calls you get the same game, whatever the frame rate (a test checks this).

## 1. CONFIG: shared constants (`PR.CONFIG`)

| Key | Value | Unit | Why |
|---|---|---|---|
| `step` | 1/120 | s | A 300 px/s hook moves 2.5 px per step, so it can't tunnel through a 26 px gem |
| `surfaceY / waterTop` | 150 / 190 | px | DESIGN §2 |
| `floorPad / hookTopPad / hookBottomPad` | 34 / 14 / 22 | px | `floorY = H−34`, `minHookY = 204`, `maxHookY = floorY−22` |
| `bandSplits` | 0.36, 0.68 | frac | shallow / middle / deep, as fractions of `minHookY..maxHookY` |
| `hookR` | 11 | px | Hit radius around the hook's hit centre (`hook.x, hook.y` **is** the hit centre, svg (16,32)) |
| `airGravity` | 980 | px/s² | Free fall while the empty hook dangles in the hole |
| `sinkAccel` | 900 | px/s² | Weight minus buoyancy while held: reaches terminal speed in ≈0.35 s, so the hook feels heavy |
| `riseAccel` | 520 | px/s² | Buoyancy when released: weaker than the weight, so floating up is calmer than sinking |
| `limitBounce / limitRest` | 0.25 / 18 | — / px/s | A small "thunk" at the top and bottom limits; slow bounces are killed (no jitter) |
| `tiltMax / tiltRate` | 0.42 / 7 | rad / 1/s | The hook leans with its speed and eases to it, so it swings like it has inertia |
| `hangTime / hangAbove` | 0.35 / 22 | s / px | After a catch the empty hook hangs in the hole, then drops back in with a splash |
| `newLineAbove` | 30 | px | A new line after a snap drops in from here |
| `gemHang / attachTime` | 18 / 0.15 | px / s | A hooked gem hangs under the hook and slides onto it (no snapping) |
| `tugTime / slipTime` | 0.22 / 0.38 | s | Good tap: quick ease-out tug. Slip: slower ease-in-out sink |
| `wobbleDecay / tugDecay` | 3.2 / 4.5 | 1/s | Slip wobble (`hook.wob`) and rod bend (`reel.tug`) fade exponentially |
| `stepMinPx` | 26 | px | Smallest reel step |
| `zoneJumpMin / zoneEdge / zoneStartMin` | 0.22 / 0.04 / 0.35 | frac | The zone moves at least 0.22 after each tap, never touches the ends, and the first zone is ≥ 0.35 so there's time to aim |
| `catchFly / bucketDX / bucketDY` | 0.65 / −150 / −20 | s / px | Caught gem arcs from the hole to `(holeX−150, surfaceY−20)` |
| `maxLines` | 3 | — | Spools |
| `snapReset / invuln` | 1.0 / 1.5 | s | The hook is gone for 1 s, then puffers can't snap the new line for 1.5 s (`world.invuln` = 2.5 at the snap) |
| `puffTime / puffDrift / puffRise` | 0.28 / 42 / 16 | s / px/s | The puffer inflates first, then drifts away from the hole and floats up |
| `leaveSpeed` | 150 | px/s | On zone clear, puffers turn and swim off, harmless |
| `points / perfectBonus` | 10/20/30/50, 5 | pts | REQUIREMENT. Gold = 5 × amethyst |
| `goldChance / goldSpeed / goldNeedle` | 1/12, 1.6, 1.15 | — | Rare, drifts 60% faster, needle 15% faster |
| `depthSpeed / zoneSpeed` | 0.35 / 0.10 | × | Swimmers are 35% faster at the bottom than at the top, and 10% faster per zone |
| `loopSpeedUp / loopSpeedCap` | 0.08 / 1.4 | × | Endless mode: +8% per loop of 4 zones, capped at +40% |
| `maxGems / maxFish` | 4 / 8 | — | Keeps the sea readable for small kids |
| `gemBobAmp/Rate`, `pufferBobAmp/Rate` | 5, 1.9 / 10, 2.4 | px, rad/s | Gems bob gently and puffers "swim" more |
| `pufferSpeed / fishSpeed / fishEvery` | 28–46 / 55–95 / 2.5–5.5 | px/s, s | Puffers are slow and readable; fish are decoration only |
| `bandWeights` | see §3 | — | Deeper zones put more value deeper |
| `firstZoneGrace / zoneGrace` | 10 / 4 | s | No puffers in the first 10 s of zone 0, and a 4 s breather in every later zone |

### Per-difficulty presets (`CONFIG.difficulty.easy|normal|hard`). **main.js only maps its difficulty string onto `reset({difficulty})`.**

| Key | easy | normal | hard | Unit / meaning |
|---|---|---|---|---|
| `gemsNeeded` | 6 | 8 | 10 | gems per zone |
| `sinkTerm / riseTerm` | 190 / 125 | 230 / 150 | 265 / 170 | px/s terminal speeds (slow hook = easy to stop on a gem) |
| `gemR / pufferR` | 30 / 16 | 27 / 19 | 24 / 21 | px hit radii (easy: big gems, small puffers) |
| `gemEvery` | 3.0–4.4 | 3.0–4.4 | 2.8–4.2 | s between gem spawns |
| `gemSpeed` | 30–44 | 38–56 | 46–68 | px/s base drift |
| `reelWidth / reelWidthZone / reelWidthMin` | .38/.02/.30 | .30/.025/.20 | .24/.025/.15 | green zone (frac of the meter) and how much it shrinks per zone |
| `perfect` | 0.11 | 0.08 | 0.06 | gold-centre width (frac) |
| `needle / needleZone` | 0.50/0.04 | 0.65/0.07 | 0.85/0.09 | sweeps/s (0→1 is one sweep) and the increase per zone |
| `stepsFull` | 4 | 5 | 6 | Good taps needed from the deepest point (`stepPx = max(26, (maxHookY−waterTop)/stepsFull)`) |
| `maxSlips` | 3 | 3 | 3 | slips before the gem escapes |
| `pufferEvery / pufferMin / pufferGrow` | 24/10/.85 | 13/5/.82 | 8/3.2/.80 | s; spawn interval = `max(min, every·grow^level) / loopMult`, ±25% jitter |
| `pufferMax / pufferMaxCap` | 1 / 2 | 2 / 4 | 3 / 5 | puffers alive at once = `min(cap, max + ⌊level/2⌋)` |

Because `stepPx` scales with the water depth, a tall portrait screen (720×1600) needs the same number of taps as landscape.

## 2. Motion model

**Hook while roaming.** The hook moves only vertically at `holeX`. Semi-implicit Euler with quadratic drag:

```
held:      a = +sinkAccel − k_s · v·|v|     k_s = sinkAccel / sinkTerm²
released:  a = −riseAccel − k_r · v·|v|     k_r = riseAccel / riseTerm²
in air:    a = airGravity                   (above waterTop: after a catch or snap)
```

The drag always opposes motion, so letting go while sinking at full speed gives a short, smooth stop (about 0.13 s, 15 px of overshoot) before the hook floats up. It never reverses instantly. At `maxHookY`/`minHookY` the speed reflects at ×0.25, and below 18 px/s it stops. Tilt eases (rate 7/s) toward `clamp(v/vTerm) · 0.42 rad`. A `splash` event fires whenever the hook crosses `waterTop` going down (at the start, after a catch, after a new line).

**Hook while reeling.** Physics is off and the hook follows tweens. A Good/Perfect tap starts `easeOutCubic` from the current y to the new target over 0.22 s (a quick tug that slows at the end). A slip starts `easeInOutSine` half a step down over 0.38 s and sets `hook.wob = 1`. The wobble decays as e^(−3.2t) and shakes the gem sideways (`±7 px · wob`, 20 rad/s) and the tilt. The hooked gem eases onto the hook over 0.15 s, then rides at `(hook.x + wobble, hook.y + 18)`. When a target reaches `waterTop`, the last tug lifts the hook to `waterTop − 22`. At the end of that tug the catch happens: the gem arcs to the bucket (`y = lerp − sin(πk)·90`, 0.65 s), the empty hook hangs 0.35 s, then falls back in under gravity with a splash.

**Swimmers** (`gem`, `puffer`, `fish`) spawn just outside a random edge and move horizontally at `base · (1 + 0.35·depth) · (1 + 0.1·zone) · loopMult`, where depth is 0 at the top and 1 at the bottom. The y position is `by + sin(phase)·bobAmp`, and `by` is the depth line they travel along. Fish come in small schools (two to four in the kelp zone) and are never hit-tested. Swimmers are removed 90 px past the far edge.

**Escaped gem.** It rises with buoyancy (−60 px/s², drag 0.6/s) and drifts sideways at 55–85 px/s with a little wriggle. When it reaches the ice it slides along under it, and it is removed after 3 s or off screen.

**Puffed puffer.** It inflates over 0.28 s (`item.puff` 0→1, `r` grows to ×1.5) while barely moving, then drifts away from the hole at 42 px/s and floats up at 16 px/s. It stays under the ice and is removed after 7 s or off screen. **Leaving puffers** (zone clear) keep `state:'swim'` with `leaving:true`, accelerate to 150 px/s away from the hole, and are harmless.

**Collisions** happen in `roam` only, with the hook in the water and not `lost`: circle against circle, `|item − hook| < item.r + hookR`. If a puffer and a gem both touch the hook in the same step, the puffer wins (snap). If several gems overlap, the closest is hooked. During `reel`, `snap` and `over` nothing collides.

## 3. Spawn tables

Gem band weights (shallow amethyst / middle emerald / deep ruby) per zone:

| zone | shallows | kelp | twilight | aurora |
|---|---|---|---|---|
| weights | .62/.28/.10 | .42/.38/.20 | .30/.40/.30 | .24/.36/.40 |

- The gem y is uniform inside its band (shallow gems may sit right under the ice). A **golden gem** happens on 1 in 12 gem spawns, never twice in a row. Its band is random, it drifts ×1.6 faster, it has a ×1.05 radius, and a `golden` event fires on spawn.
- A gem spawns every `gemEvery` s (÷ loopMult) when fewer than 4 are swimming. The first zone starts with one gem already drifting in 260 px from the hole.
- Puffer y is uniform over the hook range. Spawn interval and maximum count per level (s / max alive):

| level (zone) | easy | normal | hard |
|---|---|---|---|
| 0 (shallows) | 24.0 / 1 | 13.0 / 2 | 8.0 / 3 |
| 1 (kelp) | 20.4 / 1 | 10.7 / 2 | 6.4 / 3 |
| 2 (twilight) | 17.3 / 2 | 8.7 / 3 | 5.1 / 4 |
| 3 (aurora) | 14.7 / 2 | 7.2 / 3 | 4.1 / 4 |
| 4 (loop 2, shallows) | 11.6 / 2 | 5.4 / 4 | 3.0 / 5 |
| 8 (loop 3) | 8.6 / 2 | 4.3 / 4 | 2.8 / 5 |

(The first puffer comes after the grace period plus about half an interval.)

## 4. Reel meter maths

- The needle phase `u` goes up at `speed` (sweeps/s) and wraps at 2. `needle = (1 − cos πu) / 2` and `dir = u<1 ? +1 : −1`. It is fastest in the middle (π/2 · speed) and slows at the ends like a pendulum. Each reel starts at `u = 0` (needle at 0).
- `speed = (needle + needleZone·zone) · loopMult · (gold ? 1.15 : 1)`.
- `width = max(reelWidthMin, reelWidth − reelWidthZone·zone − 0.02·loop)`, `perfect = min(diff.perfect, width/2)`.
- Tap with `d = |needle − zone|`. If `d ≤ perfect/2` it is **Perfect**: 2 steps and +5 points. Else if `d ≤ width/2` it is **Good**: 1 step. Otherwise it is a **Slip**: ½ step down, `slips+1`, and at 3 slips the gem escapes. After every tap that does not end the reel, the zone gets a new random centre at least 0.22 away (12 tries).
- `reel.steps = ceil((targetY − waterTop)/stepPx)` is the number of steps left (the HUD can show it). Landing happens when the target reaches the surface.
- Example, normal zone 0: speed 0.65 gives 1.54 s per there-and-back. Green is 0.30 wide. Near the middle the needle crosses the green in about 0.29 s and the gold in about 0.08 s. Easy zone 0: 0.38 wide at 0.5 sweeps/s, so about 0.48 s in the green at its fastest point.

## 5. Bot (`PR.Bot`)

`new PR.Bot(world, {skill, seed})`, then `bot.step(dt)` before each `world.update(dt)`. It is deterministic with its own RNG. `bot.stats {taps, presses, dodges, retargets}`, `bot.setSkill(s)`.

| Parameter | Formula | skill 0.5 | 0.75 | 0.95 |
|---|---|---|---|---|
| reaction floor | 0.10 + 0.30(1−s) s | 0.25 | 0.175 | 0.115 |
| tap timing error (Gaussian sd) | 0.008 + 0.30(1−s)^1.5 s | 0.114 | 0.046 | 0.011 |
| roam re-plan period | 0.06 + 0.30(1−s) s (±30%) | 0.21 | 0.135 | 0.075 |
| puffer foresight | 0.5 + 1.3s s | 1.15 | 1.48 | 1.74 |
| puffer clearance margin | 4 + 18s px | 13 | 17.5 | 21 |

- **Roam.** For every swimming gem that is coming toward the hole column, the bot predicts when it enters and leaves the column and its bobbing y at the middle of that window. It drops the gem if `travel = |dy|/vTerm + 0.25 + reaction` is longer than the window. Value is `points / (max(arrival, travel) + reelTime(depth))`, with a 15% bonus for the current target so it doesn't dither. With nothing worth chasing it waits in the middle of the shallow band. It steers with a braking lead (`y + vy·0.12` against the target ± a dead band of 3–9 px).
- **Puffer avoidance.** Each puffer that will reach the column within the foresight time blocks the band `by ± (bobAmp + r + hookR + margin)`. If the path from the hook to the target crosses any blocked band, the bot moves to the nearest free y it can reach without crossing a band (band edges, top, bottom). If none exists, it gets out of the way fastest.
- **Reel.** After every tap (new zone) the bot finds the next time the needle crosses the zone centre, at least one reaction time later (scanning `world.needleAfter(t)` at 1/480 s). It schedules the tap there plus a Gaussian error and fires `press()+release()` when the time arrives. At skill 1 this is about 98–100% Perfect.

## 6. Simulated pacing (960×540, bot at 60 fps, 8 seeds × 10 min: `node tests/sim/pacing.js`)

| diff | skill | zone 1 time (s) | mean zone time, zones 1–4 (s) | zones in 10 min | gems/min | snaps/zone | escapes/zone | Perfect % | game overs |
|---|---|---|---|---|---|---|---|---|---|
| easy | 0.50 | 40 | 42 | 14.0 | 8.7 | 0.03 | 0.12 | 39 | 0/8 |
| easy | 0.75 | 38 | 37 | 16.6 | 10.2 | 0.06 | 0.00 | 80 | 0/8 |
| easy | 0.95 | 37 | 37 | 17.1 | 10.6 | 0.08 | 0.00 | 100 | 0/8 |
| normal | 0.50 | 53 | 69 | 7.3 | 6.5 | 0.24 | 2.69 | 22 | 1/8 |
| normal | 0.75 | 47 | 48 | 12.0 | 10.0 | 0.11 | 0.01 | 54 | 0/8 |
| normal | 0.95 | 44 | 47 | 12.9 | 10.7 | 0.15 | 0.00 | 98 | 0/8 |
| hard | 0.50 | 88 | 135 | 3.1 | 4.0 | 0.92 | 15.7 | 15 | 2/8 |
| hard | 0.75 | 58 | 66 | 7.9 | 9.1 | 0.37 | 0.76 | 34 | 1/8 |
| hard | 0.95 | 54 | 54 | 10.4 | 10.9 | 0.39 | 0.00 | 83 | 1/8 |

How to read it:
- A decent player (0.75) on Normal clears a zone of 8 gems in about 48 s. A sloppier one (0.5) takes about 70 s. That is inside the 45–90 s target. The bot never waits or hesitates, so a real child will be slower than these numbers. Easy (6 gems) takes about 40 s per zone.
- At gem-catching speed (about 10 gems/min) the bot is limited by how often gems spawn and drift past, not by reeling. That is intended: zones are paced by the sea, not by the player's speed.
- Snaps are rare for a careful player. Hard punishes sloppy reeling (escapes) much more than puffers do. The game-overs on Hard come from loops 2–3, where up to 5 puffers are alive at once.
- Endless mode: loop *n* zone 0 is ×(1+0.08n) faster than loop 0 zone 0, but slower than the aurora zone just before it. That gives a short breather when the zones loop.
