# Clover's Farm Hop — Mechanics

Owner: mechanics engineer. Files: `game/js/world.js` (FH.World), `game/js/weather.js` (FH.Weather), `game/js/bot.js` (FH.Bot), `tests/unit/run.js`.
Contract: `docs/DESIGN.md` §5.1–§5.3. Run the tests from the project folder with `node tests/unit/run.js` (29 tests, about 1.3 s).

Units are **u** (1 u = 1 metre on the HUD) and seconds. `y` grows upward, and `hero.y` is Clover's **feet** (her body centre is `hero.y + 0.55`).

## 1. CONFIG (world.js)

| Key | Value | Unit | Why |
|---|---|---|---|
| `step` | 1/120 | s | Fixed sub-step. A 12 u/s bounce moves 0.1 u per step, so landings are exact. Same steps for any frame rate (tested). |
| `COLW` | 12 | u | Column width. The renderer fits 12.8 u across a portrait phone. |
| `heroR`, `wallBounce` | 0.55, −0.35 | u, × | Soft fence-post walls: the hero centre is clamped, `vx *= −0.35`, event `wall` (0.3 s cooldown, only when \|vx\| > 1.2). |
| `g` | 26 | u/s² | With `bounceV` 12.4 u/s: **apex = v²/2g = 2.96 u**, rise 0.48 s, hop 0.95 s. That is a quick, springy "boing" (Doodle Jump's ratio), not a floaty moon jump. |
| `bounceV` | 12.4 | u/s | See above. |
| `springK` | 1.6 | × | 19.8 u/s, apex **7.57 u** (skips 3–4 rows). |
| `rescueK` | 1.45 | × | 18 u/s, apex 6.2 u: high enough to get back up among the platforms. |
| `maxFall` | 16 | u/s | Terminal speed, so a long fall stays readable. |
| `maxVx`, `accel`, `drag` | 6.5, 34, 8 | u/s, u/s², 1/s | Full speed in 0.19 s (responsive for small fingers). On release, vx decays as e^(−8t), which drifts at most 0.8 u. Precise, not icy. Air control is full. |
| `landPad` | 0.22 | u | A landing counts while \|hero.x − p.x\| < w/2 + 0.22 (her toes). |
| `springPad` | 0.45 | u | The spring fires only within this distance of the bale centre. |
| `squashT` | 0.18 | s | Squash is set to 1 on every bounce, then falls linearly to 0 in 0.18 s. |
| `stretchRate` | 14 | 1/s | Stretch eases toward clamp((vy − 2)/10, 0, 1) while rising, toward clamp((−vy − 8)/16, 0, 0.5) while falling fast, and is multiplied by (1 − squash). |
| `tiltMax`, `tiltRate` | 0.22, 10 | rad, 1/s | Lean eases (exponentially) toward clamp(vx/maxVx, −1, 1)·0.22. |
| `crouchT`, `ouchT`, `happyT` | 0.1, 0.7, 1.0 | s | Moods: `crouch` after each bounce → `up` while vy > 0 → `fall` when vy < −3. `ouch` on a rescue or game over, `happy` on level up. |
| `startDelay` | 0.6 | s | Clover sits (`idle`) in the farmyard before her first hop off the ground. |
| `camLead`, `camRate` | 4.2, 6 | u, 1/s | The camera bottom eases toward hero.y − 4.2, upward only (lag ≈ 0.17 s). |
| `genAhead`, `removeBelow`, `fallLine` | 24, 2, 1.2 | u | Platforms exist up to camY + 24 (a portrait screen shows ≈ 20 u). Platforms below camY − 2 are dropped. hero.y < camY − 1.2 counts as a fall. |
| `catchR`, `bodyY` | 0.8, 0.55 | u | Firefly catch radius around her body centre (generous for kids). |
| `lanternSize` | 20 | fireflies | A full lantern gives +1 heart (events `lantern` + `heartGain`). |
| `flyAmp`, `flyPeriod` | 0.15, 1.5 | u, s | Figure-eight bob: x = 0.15·sin φ, y = 0.09·sin 2φ. |
| `flyWind`, `flyHome` | 0.8, 0.6 | u/s, 1/s | Fireflies drift with the wind and spring softly back home (drift clamped to ±2.5 u). |
| `comboT` | 1.2 | s | Catches less than 1.2 s apart count up `combo` (twinkle pitch). |
| `firstGust` | 6 | s | First wind warning, 6 s into a run. |
| `gustInK`, `gustOutK` | 0.4, 0.5 | s | Strength smooth-steps in over 0.4 s and out over the last 0.5 s. |
| `windOverK` | 0.35 | × | While blowing, vx may exceed maxVx by windAx·0.35. Above the cap it relaxes back at `accel` (it never snaps). |
| `flipChance` | 0.7 | p | Each gust flips the previous direction with probability 0.7 (tested at 50–90 % over 40+ gusts). |
| `rescueY`, `rescueHeroY`, `rescueW` | 0.6, −0.4, 3.0 | u | Trampoline at camY + 0.6. Clover is placed at camY − 0.4 with vy = 18 u/s, rises through it and lands on it. |
| `rescueT`, `rescueLife`, `rescueAfter` | 1.2, 2.0, 0.5 | s | While `rescueT` > 0, steering and wind are ignored and she is eased over the mat. The mat is removed 0.5 s after its bounce, or after 2 s unused. |
| `invuln` | 1.6 | s | Blink time after a rescue (renderer only). |
| `puffT`, `puffRegrow` | 0.35, 3.5 | s | A puff poofs on its first bounce and is removed 0.35 s later. **It grows back after 3.5 s** (see §4). |
| `sideChance`, `sideDx` | 0.35, [3, 6] | p, u | Extra side platforms (never carts). |
| `springChance`, `springFrom` | 0.08, 20 | p, u | Springs on hay bales, never in the first 20 m. |
| `maxGap`, `loopGap` | 2.7, 0.08 | u | Gap ranges grow by 0.08 per loop and never exceed 2.7 u. |
| `reachSafety` | 0.8 | × | A path step uses at most 80 % of the horizontal reach (the margin covers wind and late reactions). |
| `edgeMargin` | 0.3 | u | Platform edges stay this far inside the column. |
| `widths` | hay 2.4, plank 1.7, cart 2.3, puff 2.1 | u | × difficulty `widthK`. |
| `meterEvery`, `levelBonus` | 25, 100 | m, pts | `meter` event every 25 m. Level bonus = 100·(zone+1)·(loop+1). |
| `goal` | easy **115**, normal 140, hard 160 | u | Climb per level, × (1 + 0.1·loop). |

**Difficulty**

| | hearts | gap (u) | maxDx (u) | widthK | windK | warnT (s) | cartSpeed × | flyEvery (u) |
|---|---|---|---|---|---|---|---|---|
| easy | 5 | 1.3–2.0 | **3.0** | **1.35** | 0.6 | 2.0 | 0.7 | 5–7 |
| normal | 3 | 1.5–2.4 | 4.0 | 1.0 | 1.0 | 1.6 | 1.0 | 6–9 |
| hard | 3 | 1.7–2.6 | 4.6 | 0.88 | 1.25 | 1.3 | 1.25 | 7–10 |

**Zones** (the wind's `ax` is multiplied by windK and by (1 + 0.1·loop). Carts have peak speed = zone cartSpeed × difficulty cartSpeed × (1 + 0.1·loop) and a half range in cartRange.)

| zone | kinds | wind every / blow (s) | ax (u/s²) | cart peak (u/s) | cart half range (u) |
|---|---|---|---|---|---|
| 0 sunny | hay .6, plank .4 | 11–15 / 2.2–3.0 | 5 | 1.0 | 0.8–1.2 |
| 1 rain | hay .35, plank .25, cart .22, puff .18 | 8–12 / 2.5–3.5 | 7 | 1.1 | 0.8–1.3 |
| 2 wind | hay .3, plank .2, cart .28, puff .22 | 5–8 / 3.0–4.5 | 10 | 1.3 | 0.9–1.4 |
| 3 snow | hay .3, plank .3, cart .2, puff .2 | 7–10 / 2.5–4.0 | 8 | 1.2 | 0.9–1.4 |

The wind is an acceleration, never a teleport. Released, Clover drifts at most ax/drag. On Normal in the wind zone that is 1.25 u/s, so a 3–4 s gust carries her 2–4 u if she does nothing. Counter-steering always wins: the strongest wind (Hard, wind zone, loop 1, 13.75 u/s²) is well below `accel` 34 (tested). On Easy sunny the wind is a gentle 3 u/s².

**Motion details**
- Exact ballistic integration: y += ½(v₀ + v₁)·dt, so the apex is exactly v²/2g and matches the bot's and the tests' maths.
- Carts: x = xm + hr·sin φ, φ̇ = speed/hr. The peak speed is in the middle, and the ends are eased (sine). The hero does not ride carts (bouncing is instant).
- Fireflies hover in a 1:2 Lissajous (figure eight) around (bx + wind drift, by).

## 2. Generation guarantees (tested over 2000 u, 3 seeds × 3 difficulties, including loops 1–3)

The generator builds one **path** of platforms (`p.path = true`) with `rng.fork('plat')`. Side platforms and fireflies (`rng.fork('fly')`) come on top of it.
1. The vertical gap between consecutive path platforms is in the difficulty's range (+0.08 per loop) and **≤ 2.7 u**. The apex is 2.96 u, so every step can be climbed without a spring.
2. **Horizontally reachable in the worst case.** With xm the centre of a cart's range and hr its half range (0 for static platforms):
   `|xmA − xmB| + hrA + hrB ≤ min(maxDx, 0.8·reachX(dy) + ½(wA/2 + wB/2))`.
   Here `reachX(dy)` is the distance a hop from vx = 0 covers before the feet come back down through dy:

   | dy (u) | 0 | 1.3 | 1.65 | 2.0 | 2.4 | 2.6 | 2.7 |
   |---|---|---|---|---|---|---|---|
   | reachX (u) | 5.58 | 4.80 | 4.54 | 4.24 | 3.82 | 3.56 | 3.39 |

   The unit test checks the result independently with a numeric hop simulation. The distance still needed after using both landing pads (from the edge of A to B's landing window) must be ≤ 95 % of the simulated reach.
3. Every platform (including a cart's whole range) stays inside `[w/2 + 0.3, COLW − w/2 − 0.3]`.
4. A puff is never two path platforms in a row (and never the first). Springs only on hay above 20 m. The sunny levels only have hay and planks.
5. **Zone by height.** Levels are measured in climb, so the generator knows which future height belongs to which level (`_levelAt`). Platforms generated ahead already use the next weather's kinds.
6. A firefly arc (3–5 flies) is placed between two path platforms every `flyEvery` u, 1.1 u above the line plus a sin bulge of 0.6–1.1 u, which lies along the hop path.
7. The arrays stay small: < 40 platforms and < 60 fireflies (tested).

## 3. Bot (bot.js)

Every 0.08 s the bot re-plans:
- For each landable platform it solves the gravity arc for the time T at which the feet come down through its top (including terminal speed). It skips tops within 0.12 u of the apex.
- It predicts where each cart will be at T (`world.platXAt`).
- It tabulates how far left and right Clover can still get by T with full steering, including walls and the current or announced wind.
- It scores the reachable platforms: 2·height, + 0.6·(best next step reachable from there), + 3 for a spring, + up to 1 for fireflies on the way, + spare margin.
- Penalties: −1.2 for a puff (only when a non-puff alternative at a similar height exists), −2.5 for a dead end, −1.5·n after n repeated bounces on the same platform.
- It keeps the current target unless a new one is clearly better.

Steering is a release-point controller. It aims at the side of the platform nearest the next hop (a person walking to the edge of a step). It holds toward that point until letting go would stop her over it (drift vx/drag plus wind drift), with a dead zone.

Skill s: reaction delay (1 − s)·0.3 s on the steer output, aim noise N(0, (1 − s)·0.4) u held for each target (so |noise| ≲ (1 − s)·0.8), and a (1 − s)·0.1 chance per decision of a bad pick (any platform in view).

**Results** (`dt` 1/60, 600 s per run, 5 seeds. Hearts are unlimited for the rate columns. The last column is a separate run with real hearts):

| difficulty | skill | falls/min | climb (u/s) | s per level (mean) | level 1 (s) | sunny / rain / wind / snow (s) | fireflies/min | real hearts: game overs in 10 min |
|---|---|---|---|---|---|---|---|---|
| easy | 1 | 0.00 | 2.35 | 53 | 47 | 53 / 54 / 54 / 52 | 58 | 0/5 |
| easy | 0.7 | 0.04 | 2.30 | 54 | 51 | 55 / 55 / 53 / 52 | 63 | 0/5 |
| easy | 0.5 | 1.56 | 1.43 | 84 | 80 | 91 / 83 / 77 / 85 | 44 | 0/5 |
| normal | 1 | 0.00 | 2.68 | 57 | 55 | 56 / 58 / 57 / 55 | 58 | 0/5 |
| normal | 0.7 | 0.10 | 2.55 | 59 | 57 | 59 / 60 / 60 / 59 | 59 | 0/5 |
| normal | 0.5 | 3.18 | 1.51 | 96 | 95 | 97 / 99 / 87 / 97 | 37 | 5/5 (mean 116 s) |
| hard | 1 | 0.00 | 3.03 | 57 | 55 | 57 / 57 / 58 / 57 | 57 | 0/5 |
| hard | 0.7 | 0.38 | 2.72 | 63 | 59 | 63 / 63 / 64 / 64 | 56 | 0/5 |
| hard | 0.5 | 3.82 | 1.60 | 103 | 101 | 105 / 104 / 99 / 100 | 34 | 5/5 (mean 79 s) |

Survival check: skill 1 over 10 min × 10 seeds had 0 falls on Easy and Normal (11 / 10 levels each) and 2 falls in 100 min on Hard.

**Reading the numbers**
- **Easy is for a 6-year-old.** Casual skills 0.5–0.7 spend ≈ 51–80 s on level 1 and ≈ 54–84 s per level overall (target 50–80). A 0.5 player falls about 1.5 times a minute but gains hearts back from the lantern (≈ every 27 s of catching) and every level. None of the 5 runs ended within 10 minutes.
- Normal and Hard punish a 0.5 player (3–4 falls/min against 3 hearts) but are comfortable at 0.7.
- The climb speed is set by the bounce (one hop is ≈ 0.95 s for ≈ 1.75 u average gap → ≈ 2.3–3.0 u/s for a perfect player). Bigger gaps on Hard make perfect play faster, while casual play there is slower.

## 4. Deviations from DESIGN.md (all documented names still work)

1. **`fireflies` is both an array and a count.** DESIGN uses `fireflies` for the live array and for the caught count. `world.fireflies` is the **array** (render it). Its `valueOf()`/`toString()` return the caught count, so `+world.fireflies`, `${world.fireflies}` and `world.fireflies > 0` read as the count. The plain numbers are `world.fireflyCount`, `stats.fireflies` and `getState().fireflies`. `world.flies` is an alias of the array.
2. **Puffs grow back** 3.5 s after poofing, as a new platform object (new id, `t = 0`, `state 'live'`, `regrown: true`) at the same spot. Without this, a used puff on the path leaves a > 2.7 u gap and the player can be stuck forever bouncing below it (found by the bot).
3. **Easy tuning:** goal 115 (DESIGN 110), widthK 1.35 (1.25), maxDx 3.0 (3.2). These bring casual times into 50–80 s and make the first level easier for a 6-year-old.
4. Extra platform fields: `xm, hr, om, ph` (cart centre, half range, angular speed, phase), `path` (part of the guaranteed path), `lvl` (generated for level). Extra hero field: `started`. Extra wind field: `ax` (current acceleration u/s²). Extra statics: `FH.World.reachX(dy)`, `FH.World.pathLimit(...)`, `FH.World.landable(p)`, `world.platXAt(p, t)`.
5. Rescue mat after its bounce: it is no longer landable but stays drawn for 0.5 s (mat wobble). `state` stays `'live'` until removal, so check `bounces > 0` to fade it.
6. `gotoLevel(i)` emits `levelUp` with `bonus: 0` (no points for the test hook), but still gives +1 heart.
7. **Weather particles** have `ar` (height/width; raindrop 4, gust 1/3, otherwise 1), and `size` is the drawn **width** in px. Butterflies have `flap` (0.25–1, wing opening; squash x by it). Snowflakes have `depth` 0–2. There is a no-op `setHorizon()` for the sister games' main.js. `update(dt, climbVy)` takes the camera speed in px/s (+ = climbing).
