# Wisp's Rooftop Bounce — mechanics

Files: `game/js/rng.js`, `world.js`, `weather.js`, `bot.js`; tests: `tests/unit/run.js` (`node tests/unit/run.js`, add `--stats` for the bot report), `tests/sim/playtest.js` (high-speed playtest).
Contract: `docs/DESIGN.md` §2 and §5. Units: **u** and seconds, **y up**, rooftop line y 0, field x 0…16, ceiling 8.6, Wisp's bounce line 1.35.
Forked from Mochi's Fairy Bounce: the pearl physics (swept collisions, |vy| floor, anti-stall, net, speed creep, 1/120 s steps, px/py interpolation) are unchanged and re-tested. Hoot, pillows, sleepy and stars are gone; gems and the magnet replace them.

## 1. Rules

| Thing | Rule |
|---|---|
| Phases | `serve` (pearl on Wisp; tap or auto-serve after 3 s) → `play` → `clear` (2.5 s, no pearl: the descend transition) → next zone's `serve`; `over` at 0 hearts |
| Serve | 8–22° off vertical, random side, plus 0.08 × Wisp vx (±1 u/s) |
| Wisp bounce | only while the pearl moves down and its bottom crosses y 1.35 within x ±(w/2 + r) of Wisp's centre. `off = (x − paddle.x)/(w/2 + r)` → angle from vertical `off·60° + clamp(1.2°·vx, ±12°)`, clamped ±60°. Centre = straight up, ½ = 30°, edge = 60°. Sets `paddle.squash = 1` (decays e^(−9t)) |
| Speed | `DIFF.ballSpeed × (1 + 4 %·zone + 6 %·min(loop, 3))`, × (1 + 1 % per 8 Wisp hits, max +15 %, reset when the pearl is lost); max 16 u/s |
| Never sideways | after every bounce and release `|vy| ≥ 0.38·speed` (speed kept) |
| Blocks | `block` 1 hit, `tough` 2 hits (hp 2 → 1 = cracked), `gem` 1 hit, `magnet` 1 hit. Round ≥ 2: each `b` becomes tough with 15 %·loop (max 45 %) |
| Gem drops (on break) | block 25 %, tough 50 %, gem block 100 %, magnet block never (it drops the magnet bubble instead). Colour 0/1/2 from the rng (cosmetic) |
| Combo | `combo` = block hits since the pearl last touched Wisp; hits 3, 4, 5… get +5; `combo` event at 3, 5, 8, 12, 16… |
| Gems | pop up at 1.5 u/s (≈ 0.2 u hop), then gravity 6 u/s² with linear drag k = 2.5 /s → terminal **2.4 u/s**; sway 0.3–0.6 u/s (2.2–3.5 s period); spin 1.2–2.6 rad/s. Caught when the centre is in x ±(w/2 + 0.25), y 0.2…1.8 → +25, `cheer` face. Missed below y −0.3 |
| Magnet bubble | pops up 1.2 u/s, same gravity with k = 3.3 /s → terminal **1.8 u/s**, sway 0.5 u/s, `wob` phase advances 5 rad/s (render wobble). Caught in the same box → `magnet.t = magnet.max` (refresh if already on), `magnetGet {t}` |
| Magnet | `DIFF.magnetT` = 12 / 10 / 8 s. `magnetWarn` once when 2 s are left, `magnetEnd` at 0 (and on game over). Ticks in every phase except `over` |
| Magnet pull | every gem/bubble whose centre is within **6 u** of (paddle.x, 0.9) gets acceleration **14 u/s²** toward that point, drag 1.5 /s, speed capped at **7 u/s**; gravity is off while pulled and the sway fades out in 0.25 s (`pulled = true`). Result: a smooth curve into Wisp in ≈ 1 s from 4–6 u away (tested: no step > 7.6 u/s·step, path bends > 0.3 u off its chord). Outside the range, or after the magnet ends, items fall normally again (left-over sideways speed dies with the drag) |
| Stick | while `magnet.t > 0.3`, a falling pearl that reaches Wisp **sticks**: `stuck = onPaddle = true`, `stuckOff` = landing x − Wisp x (clamped ±w/2), `stuckT = 1.5`, `stick` event, squash, `stats.catches++`. It follows Wisp at y 1.35 + r; anti-stall time pauses; it can't be lost |
| Release | `serve()` (→ `release {auto:false}`) or `stuckT` runs out (→ `auto:true`) or the magnet ends (→ at once, `auto:true`). Angle = the normal bounce rule for its offset (+ Wisp's velocity tilt): middle = straight up, so a child aims by sliding Wisp under the block |
| Net | `net.saves` = `DIFF.netSaves` (8/1/0) per zone; catches the pearl centre at y 0.3 and flicks it up 5–25° toward the middle |
| Hearts | start 3, max 5. −1 when the pearl centre falls below −0.3 (then `serve`). +1 every 10 gems (`why:'gems'`), +1 per zone cleared (`why:'zone'`) |
| Zone clear | when a hit breaks the last block: +100 + 20 × hearts (before the zone heart), +1 heart, `clear` 2.5 s; falling gems/bubbles stay catchable during it, then the new zone starts empty. `level++`, `levelUp`. After Lantern Lane: round 2 (loop 1), back to the Cloud Deck |
| Anti-stall | no block hit for 5 s (not counting stuck time) → each Wisp bounce steers toward the nearest block's underside (50 % growing to 100 % by 10 s); out of reach → banked off the near wall, else a random 18–54° toward it |
| Wisp face | `oops` (1 s after a lost pearl) > `cheer` (0.8 s per gem, 2.5 s on clear) > `magnet` (magnet on) > `left`/`right` (|vx| > 1.5 u/s) > `idle` |

## 2. Layouts
`b` block, `t` tough, `g` gem block, `m` magnet block. Grid: column c centre x = 8 + (c − 4.5)·1.48 (1.4 u blocks + 0.08 gap → x 0.64…15.36). Rows are **bottom-aligned**: the last row's centre is y 4.33, rows go up by 0.57 (0.5 u + 0.07 gap), so a 7-row layout's top row is 7.75 (top edge 8.0) — the DESIGN band 4.3…8.0. A 6-row layout tops out at 7.18, leaving room for the pearl to rattle along the top.

| Cloud Deck — puffy cloud (32, 0 t, 2 g, 2 m) | Skyscraper Spires — 3 towers (46, 8 t, 3 g, 2 m) | Rooftop Gardens — flowers in a planter (44, 4 t, 4 g, 2 m) | Lantern Lane — hanging lanterns (48, 10 t, 2 g, 3 m) |
|---|---|---|---|
| `...bb.....`<br>`..bbbb.bb.`<br>`.bbgbbbbb.`<br>`.bmbbbbgm.`<br>`..bbbbbb..`<br>`...b..b...` | `....tt....`<br>`.b..bb..b.`<br>`.b..gb..b.`<br>`tbt.bb.tbt`<br>`bmb.bb.bmb`<br>`bgbbttbbgb`<br>`bbbbbbbbbb` | `.bb....bb.`<br>`bgbb..bbgb`<br>`.bb.mb.bb.`<br>`..b.bb.b..`<br>`..b.bb.b..`<br>`tbbbmbbbbt`<br>`.tbbggbbt.` | `bbbbbbbbbb`<br>`.b..b..b..`<br>`tbt.tmt.tb`<br>`bgb.bbb.bm`<br>`bmb.bgb.bb`<br>`tbt.tbt.tb`<br>`.b...b...b` |

The Cloud Deck is the smallest wall with no tough blocks (first zone for a 6-year-old); the spires and lanes have empty columns the pearl can shoot up to get on top.

## 3. Input
- `setPaddleTarget(x)` (pointer): critically damped spring, ω = 18 /s (`a = ω²(target − x) − 2ω·vx`), |vx| ≤ 20 u/s; settles in ≈ 0.25 s, no overshoot.
- `movePaddle(±1)` (keys) clears the pointer target; velocity relaxes to ±20 u/s at 22 /s. `movePaddle(0)` releases the keys but keeps a pointer target.
- `serve()` serves in `serve`, releases a stuck pearl in `play`; returns true if the pearl launched.
- Wisp is clamped to x ∈ [w/2, 16 − w/2].

## 4. CONFIG (world.js)

| Key | Value | Why |
|---|---|---|
| `STEP`, `MICRO` | 1/120 s, 0.1 u | fixed sub-step; ≤ 0.1 u pearl micro-steps (2 per step at 16 u/s) |
| `FIELD_W`, `CEIL`, `PADDLE_Y`, `LOST_Y`, `NET_Y` | 16, 8.6, 1.35, −0.3, 0.3 u | DESIGN §2; the net sits clearly below Wisp so it reads as a rescue |
| `BALL_R` | 0.22 u | hit radius (art 0.6 u incl. glow) |
| `MAX_ANGLE`, `MIN_VY_K` | 60°, 0.38 | edge angle; never near-horizontal (≈ 68° max) |
| `NUDGE_K`, `NUDGE_MAX` | 1.2 °/(u/s), 12° | a moving Wisp tilts the pearl a little; the hit point still rules |
| `SERVE_ANGLE`, `SERVE_NUDGE`, `AUTO_SERVE` | 8–22°, 0.08, 3 s | never dead straight; a waiting child is never stuck |
| `PADDLE_SPEED`, `PADDLE_OMEGA`, `KEY_RESP` | 20 u/s, 18 /s, 22 /s | crosses the field in < 1 s; ≈ 0.25 s settle |
| `SQUASH_RATE` | 9 /s | squash 1 → 0.1 in ≈ 0.25 s: a soft "boing" |
| `SPEED_ZONE`, `SPEED_ROUND`, `LOOP_CAP` | 4 %, 6 %, 3 | gentle ramp; stops after round 4 |
| `SPEED_HITS`, `SPEED_HIT_STEP`, `SPEED_HIT_CAP`, `SPEED_MAX` | 8, 1 %, 15 %, 16 u/s | rally ramp per life; collision proven to 16 u/s |
| `COLS`, `BRICK_W`, `BRICK_H`, `GAP_X` | 10, 1.4, 0.5, 0.08 u | the grid |
| `BOTTOM_Y`, `ROW_PITCH`, `TOP_Y` | 4.33, 0.57, 7.75 u | bottom-aligned rows in the band 4.3…8.0 |
| `HIT_COOLDOWN` | 0.05 s | one contact = one hit |
| `GEM_P` | block 0.25, tough 0.5, gem 1, magnet 0 | DESIGN §5 |
| `GEM_POP`, `GEM_G`, `GEM_FALL` | 1.5 u/s, 6 u/s², 2.4 u/s | a hop, then a floaty fall (≈ 1.4 s from the lowest row to Wisp) |
| `GEM_SWAY`, `GEM_SWAY_W`, `GEM_SPIN` | 0.3–0.6 u/s, 1.8–2.8 rad/s, 1.2–2.6 rad/s | gentle sway and turn |
| `BUBBLE_FALL`, `BUBBLE_POP`, `BUBBLE_SWAY`, `BUBBLE_SWAY_W` | 1.8 u/s, 1.2 u/s, 0.5 u/s, 2.2 rad/s | a bubble floats down slower than a gem (easier to get) |
| `CATCH_PAD`, `CATCH_BOT`, `CATCH_TOP`, `ITEM_LOST_Y` | 0.25, 0.2, 1.8, −0.3 u | generous catch box (DESIGN §5) |
| `MAGNET_RANGE`, `MAGNET_ACC`, `MAGNET_VMAX`, `MAGNET_DRAG`, `MAGNET_CY` | 6 u, 14 u/s², 7 u/s, 1.5 /s, 0.9 u | strong enough to clearly win over gravity, slow enough to see the curve; the drag stops orbits |
| `MAGNET_WARN` | 2 s | ring blink / warning sound |
| `STICK_T`, `STICK_MIN_T` | 1.5 s, 0.3 s | time to aim; no sticking right before the magnet ends |
| `GEMS_PER_HEART`, `HEARTS`, `MAX_HEARTS` | 10, 3, 5 | REQUIREMENT |
| `ANTI_STALL` | 5 s | fork playtest: worst stall 175 s → 27 s |
| `CLEAR_T` | 2.5 s | the descend transition |
| `OOPS_T`, `CHEER_T`, `CLEAR_CHEER_T`, `FACE_MOVE_V` | 1, 0.8, 2.5 s, 1.5 u/s | Wisp faces |
| `PTS` | brick 10, combo 5, gem 25, clear 100, clearHeart 20 | REQUIREMENT |
| `COMBO_FROM`, `TOUGH_LOOP` | 3, 0.15 | combo bonus from the 3rd block; tough chance per round |
| `DIFF.easy` | paddleW 3.6, ballSpeed 5.4, netSaves 8, magnetT 12 | a 6-year-old: wide, slow, forgiving |
| `DIFF.normal` | 2.5, 7.6, 1, 10 | |
| `DIFF.hard` | 2.1, 9.0, 0, 8 | |

## 5. Collision method
Every 1/120 s step: save `px/py` (paddle, pearl, gems, bubbles), move Wisp, tick the magnet, move items (pull or fall, then catch/miss), then the pearl: stuck → follow Wisp; otherwise `n = ceil(speed·step / 0.1 u)` micro-steps, each:
1. **Walls/ceiling**: mirror the position, flip the component (`wall`).
2. **Blocks**: closest point on each live box; overlap if < r (circle vs. the Minkowski rounded box). Among the axes the pearl moves into, least penetration wins; the deepest contact decides the **single reflection** (flip, push out); every overlapping block it moves into takes a hit (a corner breaks two). 0.05 s per-block cooldown. Thinnest skip distance 0.94 u ≫ 0.1 u → no tunnelling ≤ 16 u/s (tested from below, above and the side).
3. **Wisp**: the bottom crossed the bounce line going down → crossing x by interpolation → stick (magnet) or the angle rule (mirrored above the line).
4. **Net / lost**.
After every reflection `_normalize` restores |v| = speed and the |vy| floor.

## 6. Weather (`weather.js`, logical screen px)
Counts at 960×540 (× area factor 0.7…1.3), hard cap **90** including fading ones; `setLevel` crossfades (old fade out 1.2 s, new fade in 0.8 s, ≤ 3 spawns per frame).

| Zone | Particles | Motion |
|---|---|---|
| cloud | 26 `p_twinkle` + 7 `p_mist` | twinkles never move, blink with sin² at 0.5–1.4 Hz; mist 140–260 px wide, α 0.12–0.28, drifts 6–14 px/s sideways with a slow vertical breathe, wraps at the edges (back layer) |
| spires | 22 `p_twinkle` + 4 `p_sparkle` + `p_shooting` | sparkles = window/antenna glints: wait 0.3–3 s, flash 0.5–0.9 s (sin envelope), respawn elsewhere. A shooting star every **4–8 s**: 600–800 px/s, 18–32° below horizontal, either way, lives 0.7–1.0 s (fast fade-in, long fade-out), `rot` = its heading (sprite points +x) |
| gardens | 16 `p_firefly` + 14 `p_petal` | fireflies: smoothed random walk + sin² blink, 35 % in front; petals: sideways sine sway, fall 22–36 px/s fastest while edge-on, flipX as they turn |
| lanes | 26 `p_ember` + 6 `p_firefly` | embers rise 22–40 px/s from the street with a two-sine wobble, buoyancy fading slowly, shrink 45 % and flicker as they cool, fade out over the last 40 % of a 6–11 s life |

## 7. Bot (`bot.js`)
Re-plans every 0.04 + 0.4·(1 − skill) s. Predicts the pearl's crossing of the bounce line with wall folding (and the ceiling if still rising). On each new descent it picks a target among the lowest live block of each column and a hand error σ = 0.04 + 0.9·(1 − skill)^1.3 u; offset = angle-to-target / 60°, clamped ±0.8, × (0.3 + 0.7·skill) (no offset while the magnet will make the pearl stick). Grabs magnet bubbles, then gems, when there is time to get back (items already being pulled are left to the magnet). **Stuck pearl**: picks a block, solves the Wisp x whose launch line (angle for `stuckOff`) hits its underside directly or banked off a wall, slides there and calls `serve()` after 0.15…(0.3 + 0.6·(1 − skill)) s — always before the 1.5 s auto-release (≈ 99 % hand releases). Serves after 0.25…(0.5 + 1.2·(1 − skill)) s. Only calls `setPaddleTarget` / `serve`.

## 8. Unit tests (`node tests/unit/run.js` → 38/38 PASS, ≈ 0.7 s)
RNG · no `Math.random` in world/bot/weather · layouts (4 zones, 6–7 × 10 of b/t/g/m, 2–3 magnets, ≥ 2 gem blocks, distinct shapes, no tough in zone 0) · grid in the band · round 2 more tough, deterministic · DIFF table (magnet 12/10/8) · 60 s bot determinism · 1/120 sub-steps, px/py, alpha · serve angle + auto-serve · paddle easing · bounce angles by offset (0, ¼, −½, edge) + squash decay · velocity tilt ≤ 12°, a miss falls through · |vy| floor in 3 min of play · no tunnelling at 16 u/s (40 cases) · corner breaks two · scoring · gem drop rates (600 breaks each) · gem hop/terminal/sway/spin/colours/catch +25/miss · bubble terminal 1.8, catch, refresh, miss · magnet pull curves in (no teleport) vs. missed without · stick + follow + `serve()` release at the offset angle · auto-release at 1.5 s, release when the magnet ends, no stick in the last 0.3 s, never lost while stuck · magnetWarn/magnetEnd timing per difficulty · face priority · zone clear → levelUp with zone change, 2.5 s, speed +4 %/+6 % · hearts lost / game over · net 8/1/0 per zone, refilled · +1 heart per 10 gems, max 5 · anti-stall · debug hooks + getState · bot skill 1 ≥ 3 zones on Normal · skill 0.9 and 0.3 clear Easy Cloud Deck in every seed in 30–120 s · bot catches magnets, aims and releases by hand · bot API only + deterministic · weather ≤ 90 + sprites per zone · weather motion (twinkles fixed, mist drifts, shooting stars every 4–8 s along their heading, embers rise, petals fall) · crossfade · 10 simulated minutes < 2.5 s.

## 9. Playtest (`node tests/sim/playtest.js --n 20`, 600 s cap, ≈ 7 s wall)

Quick report, shipped bot:

| diff | skill | clears zone 1 | clears all 4 | zones p50 | zone time p50 s |
|---|---:|---:|---:|---:|---:|
| easy | 0.3 | 100 % | 100 % | 7 | 82 |
| easy | 0.6 | 100 % | 100 % | 8 | 74 |
| easy | 0.9 | 100 % | 100 % | 8 | 70 |
| normal | 0.3 | 100 % | 25 % | 2 | 59 |
| normal | 0.6 | 100 % | 100 % | 10 | 56 |
| normal | 0.9 | 100 % | 100 % | 11 | 50 |
| hard | 0.3 | 20 % | 0 % | 0 | 48 |
| hard | 0.6 | 100 % | 30 % | 2 | 45 |
| hard | 0.9 | 100 % | 100 % | 13 | 43 |

Child models on Easy (no aiming, late eyes): `kid5` (0.5 s late) clears the Cloud Deck in 100 % of games (p50 74 s), `kid5fast` 100 % (72 s), `kid4` (0.65 s late, ±0.6 u hands) 65 %. The casual `adult` clears zone 1 in 78 s on Easy and 69 s on Normal. Tuning step from the playtest: the first Cloud Deck wall (39 blocks, top-aligned) gave kid5 55 % / kid4 20 % / adult 113 s; 32 blocks and bottom-aligned rows brought that to 100 % / 65 % / 78 s.
