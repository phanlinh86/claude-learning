# Mochi's Fairy Bounce — mechanics

Files: `game/js/rng.js`, `world.js`, `weather.js`, `bot.js`; tests: `tests/unit/run.js` (`node tests/unit/run.js`, add `--stats` for the bot report).
Contract: `docs/DESIGN.md` §2 and §5. Units: **u** and seconds, **y up**, ground y 0, field x 0…16, ceiling 8.6, bounce line 1.35.

## 1. Rules

| Thing | Rule |
|---|---|
| Phases | `serve` (ball on the cap; tap or auto-serve after 3 s) → `play` → `clear` (2 s, no ball) → next season's `serve`; `over` at 0 hearts |
| Serve | 8–22° off vertical, random side, plus 0.08 × paddle vx (±1 u/s) |
| Cap bounce | only while the ball moves down and its bottom crosses y 1.35 within x ±(w/2 + r) of the cap centre. `off = (x − paddle.x)/(w/2 + r)` → angle from vertical `off·60° + clamp(1.2°·vx, ±12°)`, clamped to ±60°. Centre = straight up, edge = 60° |
| Speed | `DIFF.ballSpeed × (1 + 4 %·zone + 6 %·min(loop, 3))`, × (1 + 1 % per 8 cap hits, max +15 %, reset when the ball is lost); max 16 u/s |
| Never sideways | after every bounce `|vy| ≥ 0.38·speed` (speed is kept) |
| Blocks | bud 1 hit, tough 2 hits (`hp` 2 → 1 = cracked), star block 1 hit and always drops a star; a bud drops a star with `DIFF.budStar` (15/10/8 %). On round ≥ 2 each bud becomes tough with 15 %·loop (max 45 %) |
| Combo | `combo` = block hits since the ball last touched the cap. Hits 3, 4, 5… get +5. `combo` event at 3, 5, 8, 12, 16… |
| Stars | pop up 1.4 u/s, relax to a 2.4 u/s fall, sway 0.35–0.7 u/s (2.5–3.5 s period), spin 1.2–2.6 rad/s. Caught when the centre is in x ±(w/2 + 0.25), y 0…1.7 |
| Hoot | x = 8 + 4.2 sin(0.21t) + 1.4 sin(0.53t) (+ push spring), clamped 2…14; y = 8.0 ± 0.15 (2.2 s bob); flap phase 0…1 at 2.2 Hz (×2.5 while throwing/giggling). Hit circle r 0.55: true circle reflection, +30, `giggle` 1.2 s, a sideways shove (2.2 u/s into a critically damped spring). The 3rd hit in a season = tickled (+100, drops a star). A re-hit during the first 0.3 s of a giggle bounces but scores nothing |
| Pillows | every `DIFF.pillowEvery` s (35/30/25) while serving or playing; Hoot shows `throw` 0.6 s. Tossed up at 0.9 u/s, gravity 3 u/s² with linear drag k = 3/3.2 → terminal 3.2 u/s, sideways drag, sway ±0.3 u/s, tumbling spin 1.5–3.5 rad/s. Aimed 0.5–1.5 u beside Mochi (random side, never at him). `landX` = the exact ground x (simulated with the same step code) for the shadow. Touching Mochi/cap (x ±w/2, y 0…1.6) → `sleepy = DIFF.sleepyTime` (1.6/2.0/2.4 s): 40 % speed, softer spring; **never a heart**. The ball pops it (+10) and keeps going |
| Vine | `net.saves` = `DIFF.netSaves` (2/1/0) per season; the vine catches the ball at y 0.3 and flicks it up 5–25° toward the middle |
| Hearts | start 3, max 5. −1 when the ball's centre falls below −0.3 (then `serve`). +1 every 10 stars, +1 per season cleared |
| Season clear | when a hit breaks the last block: +100 + 20 × hearts (before the season heart), +1 heart, `clear` 2 s, falling stars stay catchable, pillows pop (0 pts). Then `level++`, new layout, `levelUp`. After winter: round 2 (loop 1) |
| Anti-stall | no block hit for 12 s → each cap bounce aims halfway toward the nearest block (until one is hit) |
| Mochi face | `oops` (1 s after a lost ball) > `sleepy` > `cheer` (0.8 s per star, 2 s on clear) > `left`/`right` (|vx| > 1.5 u/s) > `idle` |

Layouts (10 columns, `b` bud, `t` tough, `s` star block):

| Spring Meadow — flower (34) | Summer Glade — sun (40) | Autumn Hollow — acorn (34) | Winter Glow — fir tree (32) |
|---|---|---|---|
| `..b.bb.b..`<br>`.bbbbbbbb.`<br>`.bbtsstbb.`<br>`.bbbbbbbb.`<br>`..s.bb.s..`<br>`....bb....` | `b...bb...b`<br>`..bbbbbb..`<br>`.bbsbbsbb.`<br>`bbbbttbbbb`<br>`.bbbbbbbb.`<br>`..s.bb.s..` | `....ss....`<br>`..bttttb..`<br>`.bbbbbbbb.`<br>`.bbsbbsbb.`<br>`..bbbbbb..`<br>`...bbbb...` | `....ss....`<br>`....bb....`<br>`...bbbb...`<br>`..bsbbsb..`<br>`.bbbbbbbb.`<br>`bbbtbbtbbb` |

Grid: column c centre x = 8 + (c − 4.5)·1.48 (blocks 1.4 u + 0.08 gap → x 0.64…15.36); row r centre y = 7.2 − 0.6·r (0.5 u + 0.1 gap).

## 2. Input
- `setPaddleTarget(x)` (pointer): critically damped spring, ω = 18 /s (`a = ω²(target − x) − 2ω·vx`), |vx| ≤ 20 u/s. Settles in ≈ 0.25 s with no overshoot. Sleepy: ω × 0.6, max 8 u/s.
- `movePaddle(±1)` (keys) clears the pointer target; the velocity relaxes to ±20 u/s at 22 /s (≈ 0.1 s). `movePaddle(0)` releases the keys **but keeps a pointer target** (so a main loop that calls `movePaddle(0)` every frame doesn't break touch).
- The paddle is clamped to x ∈ [w/2, 16 − w/2].

## 3. CONFIG (world.js)

| Key | Value | Why |
|---|---|---|
| `STEP` | 1/120 s | fixed sub-step; `update(dt)` runs whole steps and leaves `alpha` for render lerp (`px/py` = previous step) |
| `MICRO` | 0.1 u | ball travel per micro-step inside a step (2 per step at 16 u/s) |
| `FIELD_W`, `CEIL` | 16, 8.6 u | DESIGN §2 |
| `PADDLE_Y` | 1.35 u | the bounce line (top of the cap) |
| `LOST_Y`, `NET_Y` | −0.3, 0.3 u | lost below −0.3; the vine catches at 0.3 (clearly below the cap: reads as a rescue) |
| `BALL_R` | 0.22 u | hit radius (art 0.6 u with glow) |
| `MAX_ANGLE` | 60° | cap edge angle |
| `MIN_VY_K` | 0.38 | never near-horizontal (max ≈ 68° from vertical) |
| `NUDGE_K`, `NUDGE_MAX` | 1.2 °/(u/s), 12° | a moving cap tilts the ball a little; the hit point still rules |
| `SERVE_ANGLE`, `SERVE_NUDGE` | 8–22°, 0.08 | never dead straight; a moving serve inherits a bit of speed |
| `AUTO_SERVE` | 3 s | a waiting child is never stuck |
| `PADDLE_SPEED` | 20 u/s | crosses the field in < 1 s |
| `PADDLE_OMEGA` | 18 /s | critically damped follow, ≈ 0.25 s settle |
| `KEY_RESP` | 22 /s | key acceleration (≈ 0.1 s to full speed) |
| `SLEEPY_SPEED_K` | 0.4 | sleepy = slow, but still playable |
| `SPEED_SEASON`, `SPEED_ROUND`, `LOOP_CAP` | 4 %, 6 %, 3 | gentle ramp; stops after round 4 |
| `SPEED_HITS`, `SPEED_HIT_STEP`, `SPEED_HIT_CAP` | 8, 1 %, 15 % | rally ramp per life |
| `SPEED_MAX` | 16 u/s | collision proven safe up to here |
| `COLS`, `BRICK_W`, `BRICK_H`, `GAP_X`, `GAP_Y`, `TOP_Y` | 10, 1.4, 0.5, 0.08, 0.1, 7.2 u | the brick grid |
| `HIT_COOLDOWN` | 0.05 s | one contact = one hit |
| `STAR_FALL`, `STAR_POP`, `STAR_RELAX` | 2.4 u/s, 1.4 u/s, 2.2 /s | ≈ 2.5 s to fall from the blocks: easy to catch |
| `STAR_SWAY`, `STAR_SWAY_W`, `STAR_SPIN` | 0.35–0.7 u/s, 1.8–2.8 rad/s, 1.2–2.6 rad/s | gentle, floaty |
| `CATCH_PAD`, `CATCH_TOP` | 0.25 u, 1.7 u | generous catch box |
| `STARS_PER_HEART`, `HEARTS`, `MAX_HEARTS` | 10, 3, 5 | REQUIREMENT |
| `BOSS_Y`, `BOSS_BOB`, `BOSS_BOB_T`, `BOSS_X`, `BOSS_R` | 8.0, 0.15 u, 2.2 s, 2…14, 0.55 u | DESIGN §5 |
| `BOSS_FLAP_HZ` | 2.2 Hz | `boss.flap` phase (0…1); render: frame `owl_1` while flap < 0.5 |
| `GIGGLE_T`, `THROW_T` | 1.2 s, 0.6 s | pose times |
| `BOSS_PUSH`, `BOSS_SPRING` | 2.2 u/s, 5 /s | a ball hit shoves him; a damped spring brings him back in ≈ 0.5 s |
| `TICKLE_HITS` | 3 | per season |
| `PILLOW_R`, `PILLOW_G`, `PILLOW_TERM`, `PILLOW_TOSS` | 0.3 u, 3 u/s², 3.2 u/s, 0.9 u/s | slow, soft, readable ≈ 3 s fall |
| `PILLOW_MISS` | 0.5–1.5 u | aimed beside Mochi, never at him |
| `PILLOW_SWAY`, `PILLOW_SWAY_W`, `PILLOW_SPIN` | 0.3 u/s, 2.4 rad/s, 1.5–3.5 rad/s | drift + tumble (included in `landX`) |
| `PILLOW_GROUND`, `PILLOW_HIT_TOP` | 0.28 u, 1.6 u | landing height; Mochi + cap box |
| `ANTI_STALL` | 12 s | see rules |
| `CLEAR_T` | 2 s | celebration |
| `OOPS_T`, `CHEER_T`, `CLEAR_CHEER_T`, `FACE_MOVE_V` | 1, 0.8, 2 s, 1.5 u/s | Mochi faces |
| `PTS` | brick 10, combo 5, star 50, boss 30, tickle 100, clear 100, clearHeart 20, pillow 10 | REQUIREMENT |
| `COMBO_FROM` | 3 | the 3rd block in a rally starts the bonus |
| `TOUGH_LOOP` | 0.15 | bud → tough chance per loop |
| `DIFF.easy` | paddleW 3.0, ballSpeed 6.2, netSaves 2, pillowEvery 35, sleepyTime 1.6, budStar 0.15 | a 6-year-old clears spring |
| `DIFF.normal` | 2.5, 7.6, 1, 30, 2.0, 0.10 | |
| `DIFF.hard` | 2.1, 9.0, 0, 25, 2.4, 0.08 | |

## 4. Collision method
Every 1/120 s step: save `px/py`, move the paddle, Hoot, stars and pillows, then move the ball in `n = ceil(speed·step / 0.1 u)` micro-steps. In each micro-step:
1. **Walls/ceiling**: mirror the position and flip the velocity component (`wall` event).
2. **Blocks**: for every live block, the closest point on the box to the ball centre; overlap if the distance < r (this is circle vs. the Minkowski rounded box). For each overlapping block the ball is moving *into* (on at least one axis), pick the axis of least penetration among those axes. The block with the deepest contact decides the **single reflection** (flip that velocity component, push out by the penetration); all overlapping blocks the ball moves into take a hit (so a corner between two neighbours breaks both). A 0.05 s per-block cooldown stops double hits. The thinnest thing the ball could skip is 2·(0.25 + 0.22) = 0.94 u ≫ 0.1 u, so nothing tunnels at ≤ 16 u/s (tested from below, above and the side at 16 u/s).
3. **Hoot**: circle–circle, true reflection about the normal, push out.
4. **Pillows**: circle–circle overlap → pop, no reflection.
5. **Cap**: the bottom crossed the bounce line this micro-step going down → crossing x by interpolation → angle rule; the ball is mirrored above the line.
6. **Vine / lost**.
After every reflection `_normalize` restores |v| = speed and enforces |vy| ≥ 0.38·speed.

## 5. Weather (`weather.js`, screen px)
Per season (at 960×540, × area factor 0.7…1.3): spring 18 petals + 10 sparkles; summer 16 fireflies + 5 butterflies; autumn 22 leaves; winter 30 far + 20 mid + 10 near snowflakes. Hard cap **90** including fading ones. `setLevel(z)` marks the old particles dying (fade out 1.2 s) and up to 3 new ones spawn per frame at their entry edge, fading in over 0.8 s.
Petals: sideways sine + slow fall (fastest edge-on), flipX as they turn. Leaves: pendulum (θ = A·sin ωt, the leaf slides along the arc and lifts at the ends, rot = 1.3θ, falls fastest at the bottom). Snow: far 5 px / 16 px/s / α 0.45 (back), mid 8 / 30 / 0.7 (back), near 13 / 52 / 0.95 (front). Fireflies: smoothed random walk + squared-sine blink. Butterflies: wavy path, `flap` 0…1 at 3.5–5 Hz (squash x by 0.35 + 0.65·flap), flipX by heading.

## 6. Bot (`bot.js`)
Re-plans every 0.04 + 0.4·(1 − skill) s. Predicts the ball's crossing of the bounce line with wall folding (and the ceiling if still rising). On each new descent it picks a target among the lowest live block of each column and a hand error σ = 0.04 + 0.9·(1 − skill)^1.3 u; offset = angle-to-target / 60°, clamped ±0.8, × (0.3 + 0.7·skill). Grabs stars and dodges pillows (skill ≥ 0.35) only when there is time to get back (the rising-ball time is bounded by the lowest block). Serves after 0.25…(0.5 + 1.2·(1 − skill)) s.

## 7. Unit tests (`node tests/unit/run.js` → 34/34 PASS, ≈ 0.8 s)
RNG determinism/ranges · no `Math.random` in world/bot · layouts (4 × 5–6 rows × 10, 26–40 blocks, stars + tough) · grid geometry · round 2 has more tough blocks, deterministic · DIFF table · 60 s bot-play determinism · 1/120 sub-steps, px/py, alpha · serve angle + auto-serve at 3 s · paddle easing (no overshoot, ≤ 20 u/s, keys, wall clamp) · centre hit straight up, edge 60°, half −30° · paddle-velocity tilt sign and ≤ 12°, a miss falls through · |vy| ≥ 0.38·speed after every bounce in 3 min of play · no tunnelling at 16 u/s (40 cases from below/above/side) · corner breaks two with one reflection · scoring (10, tough 2×10, combo +5 from the 3rd) · star block → star (fall ≤ 2.4 u/s, sway, spin), catch +50 · Hoot +30, giggle, push, tickle +100 · season clear (+100 + 20/heart, +1 heart, 2 s clear, levelUp, +4 %/season, +6 %/round) · hearts lost / game over · vine 2 saves on Easy, 1 on Normal · +1 heart per 10 stars, max 5 · pillow every 30 s, terminal ≤ 3.2 u/s, exact `landX`, tumble · pillow aims beside Mochi, sleepy, never a heart, sleepy speed · ball pops pillow +10 · Hoot band/bob/flap · anti-stall finds the last block · bot skill 1 ≥ 3 seasons on Normal (5/5 seeds) · skill-0.3 bot clears Easy spring in 5/5 seeds · the bot only calls setPaddleTarget/serve · weather ≤ 90 across crossfades, correct sprites per season · 3 snow layers · crossfade · 10 simulated minutes < 2.5 s (≈ 0.25 s).

Bot report (`--stats`, 5 seeds, 900 s, average season length):

| | skill 0.3 | skill 0.5 | skill 1 |
|---|---|---|---|
| Easy | 11–13 seasons, 65 s | 14–16, 57 s | 16, 52 s |
| Normal | 0–3, 56 s | 3–17, 50 s | 19–20, 43 s |
| Hard | 0 | 0–2, 40 s | 7–19, 36 s |

Spring on Easy takes ≈ 55–70 s for an average player and the vine + auto-serve make it forgiving for a 6-year-old.
