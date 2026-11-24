# Nubi's Farm Fling — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.CFF`. Storage prefix `cff:`. Exe `NubisFarmFling.exe`, port 48513 (fallbacks 48523/48533/48543).
Forked from `../fox-island-fling/` (slingshot core, UI, mobile layer). The day–night cycle is REMOVED; the twist is **growth**.
Fantasy in one sentence: **it must FEEL like stretching a big rubber band and flinging a soft, puffy cloud across the farm — "wheee… pitter-patter!"**

## 1. Lessons from slingshot games (keep / change)
| Reference (Angry Birds, Paper Toss, carnival slingshots) | Keep | Change for us |
|---|---|---|
| Drag back, release, ballistic arc | ✔ | drag ANYWHERE (small fingers), not only on the hero |
| Dotted trajectory preview | ✔ | long in Spring, shorter later; it always includes Nubi's current size (buoyancy + drag) |
| Destroy structures, enemies | ✘ | nothing violent: you gulp fireflies and rain on crops |
| Limited shots per level | ✘ | hearts; only a plop on the grass costs one |
| One mid-air ability per shot | ✔ | "puff": one small lift per flight |
| Projectile is the same every shot | ✘ | twist: Nubi grows (bigger reach + wider rain, but floatier, shorter arcs) |

## 2. Screen and world (all world values in units u, seconds, y UP)
- World field: x ∈ [0, 16], y ∈ [0, 9]; the grass top is y = 0 (`CONFIG.GROUND_Y = 0`). 1 u ≈ 1 m.
- Renderer: landscape `unit = min(VH/9, VW/16.4)`; world x 0 at screen x `(VW − 16·unit)/2`. Portrait: `unit = VW/16.4`, ground at 64 % of VH.
- Screen y = `groundPx − y·unit` (landscape `groundPx = VH − 1.2·unit`). Fireflies never spawn above y 6.8.
- Slingshot anchor (`world.sling`): x 2.3, y 2.9, standing on a hay bale whose top is at y ≈ 1.2 (`BALE_X` 4.6 = bale right edge).
- The planter wagon stands on the grass: its soil top is `wagon.top` = 0.55.

## 3. Art style guide (all SVG, 100 % original)
- Hand-written SVG from generator scripts in `tools/art-characters/gen.js` and `tools/art-environment/gen.js` (node, writes into `game/assets/default/`).
- Outline: 3 px at viewBox scale, colour = darker shade of the fill (never pure black), round joins/caps.
- One-step shading: a flat darker shape on the lower/right side + one small highlight. No blurs/filters except the one soft `glow` gradient.
- No `<text>`, fonts, `<script>`, `<image>`, external refs; `xmlns` present; transparent background (except sky layers).
- Palette rule: **Nubi** is white / very pale blue-lavender with a darker lavender-grey outline, rosy cheeks, a small bright-green sprout on top (2 leaves). **Yellow/amber is reserved for fireflies** (glowing yellow-green body, golden firefly = warm gold + white sparkle). Wagon = warm red-brown wood; crops colourful. Backgrounds lower saturation than characters, and the sky must never be so pale that white Nubi vanishes (use mid-tone blue skies, soft clouds well below the band contrast; the winter sky is a dusty blue-grey, NOT white). Keep the band y ∈ [1, 7] calm.

## 4. Asset table (`game/assets/default/`)
| File | viewBox | Drawn size (u) at size 1 | Anchor / notes |
|---|---|---|---|
| `nubi_sit.svg`, `nubi_pull.svg`, `nubi_fly.svg`, `nubi_puff.svg`, `nubi_rain.svg`, `nubi_plop.svg`, `nubi_bonk.svg` | 0 0 128 128 | 1.3 × 1.3 (× `nubi.size`) | body centre (64, 64) = world position; bottom line y = 108; hit circle r = 0.45 u × size. All frames share the same cloud-body outline (5–6 overlapping round lobes) and face position; facing RIGHT. `pull` = squashed/braced, eyes squeezed eager; `fly` = stretched slightly back, happy open mouth; `puff` = cheeks blown, a tiny breath puff below; `rain` = content smile, flat bottom with 5 short blue rain streaks below y 108 (to y 126); `plop` = flattened pancake (body squashed to y 70–112), dizzy-happy face; `bonk` = swirly eyes; `sit` = calm smile. No arms needed (optional tiny stubs). Must not resemble any known cloud character. |
| `firefly.svg` | 0 0 64 64 | 0.8 × 0.8 | centre (32, 32); round cute firefly, glowing yellow-green tail, tiny wings, soft halo ring |
| `firefly_gold.svg` | 0 0 64 64 | 0.8 × 0.8 | same geometry, warm gold glow + white sparkle |
| `wagon.svg` | 0 0 256 128 | width = 2·hw + 0.3 u (height keeps aspect) | wooden planter wagon on 2 wheels; soil top line at y 40 (= `wagon.top`), soil spans x 16–240, centre x 128; a darker cracked "thirsty patch" ellipse in the middle (the bullseye); 3–5 dry little sprouts on the soil; wheels bottom at y 128 sit on the grass |
| `crop_spring.svg`, `crop_summer.svg`, `crop_autumn.svg`, `crop_winter.svg` | 0 0 64 96 | 0.6 × 0.9 | one grown crop, base centre (32, 96) on the soil: tulip / sunflower (small, mostly orange-brown face so it isn't firefly-yellow) / pumpkin with vine / winter cabbage with a snow cap. The renderer pops several up along the wagon after a landing |
| `sling.svg` | 0 0 160 256 | 1.6 × 2.56 | wooden Y-fork fence post; anchor between prong tips at (80, 50) = `sling`; band tie points (34, 46) and (126, 46); base at y 256; a small sunflower-free flower or ribbon on the left prong (no yellow) |
| `bale.svg` | 0 0 480 220 | 4.8 × 2.2 | hay bale + patch of grass under the slingshot; top surface y 40, left edge at world x 0, top at world y 1.2 (straw colour may be pale straw/tan, not firefly yellow) |
| `crow_0.svg`, `crow_1.svg` | 0 0 96 64 | 1.2 × 0.8 | centre (48, 32), wings up / down, round friendly crow (soft charcoal-blue with a big eye and a small orange beak and a tiny straw hat or scarf), facing RIGHT |
| `heart.svg`, `heart_empty.svg` | 0 0 64 64 | HUD | |
| `icon.svg` | 0 0 256 256 | | app icon: Nubi's face + a firefly, opaque rounded square, mid-blue sky background |
| `levels/<zone>/sky.svg` | 0 0 960 540 | cover-fit | zones `spring`, `summer`, `autumn`, `winter`. Gradient sky + soft distant clouds; a sun may be drawn (no day cycle any more) |
| `levels/<zone>/far.svg` | 0 0 960 300 | width = 16 u·k | rolling hills / far barn silhouettes on a horizon at y 300; horizontally tileable; transparent above; parallax 0.3 |
| `levels/<zone>/near.svg` | 0 0 960 200 | | nearer farm details (fences, barn, silo, windmill, trees, haystacks, pumpkins, snowy fence) on the line at y 200; tileable; parallax 0.6; ≤ 120 px tall over most of the width |
| `levels/<zone>/ground.svg` | 0 0 960 240 | full width tile | the field from the grass top line at y 20 downwards (grass/soil rows; winter = snow), tileable; parallax 1 |
| `levels/palette.json` | | | per zone `{ skyTop, skyBottom, ground, ink, bar }` |
| `particles/*.svg` | 0 0 32 32 | ≤ 0.5 u | `sparkle`, `drop` (rain), `snow`, `ripple` (puddle ring), `star`, `firefly` (tiny ambient), `petal`, `butterfly`, `puff` (white mist puff), `leafbit` (autumn leaf), `glow` (soft radial white, the only gradient-alpha sprite) |

Animation frames that share one geometry: all `nubi_*`, `crow_0/1`.

## 5. Module contracts

### `CFF.RNG` (`js/rng.js`, exists): `new CFF.RNG(seed)`, `next() range(a,b) int(a,b) pick(arr) chance(p) sign() gauss() fork(salt)`.

### `CFF.World` (`js/world.js`) — headless, deterministic, pixel-free
`new CFF.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0, size: 1 })`; `CFF.World.CONFIG`, `CFF.World.DIFF`, `CFF.World.LEVELS`.
Fixed sub-steps `CONFIG.STEP = 1/120 s` with an accumulator; `alpha` = leftover fraction.
Methods:
- `aim(dx, dy)` — pull offset from the anchor (Nubi sits at `sling + pull`), clamped to `PULL_MAX`; y ≥ `sling.y − 1.4`; only in phase `'aim'`. First call emits `pull`.
- `release()` — if |pull| ≥ `PULL_MIN` launch with `v = −pull / PULL_MAX · VMAX` (emits `launch {power}`), else cancel.
- `cancelAim()`; `puff()` — once per flight, only when vy ≤ `PUFF_VY`: `vy = PUFF_VY` (emits `puff`). Keep `flutter` as an alias of `puff`.
- `launchVelocity(dx, dy)`; `preview(n, dt)` → `{x,y}[]` using the SAME step physics as flight (size-dependent gravity + drag); `previewCount()`.
- `update(dt)`, `drainEvents()`, `getState()`, `gotoLevel(i)`, `setSize(s)` (test hook).
State fields:
- `phase`: `'aim' | 'fly' | 'land' | 'plop' | 'over'`; `phaseT`.
- `nubi { x, y, vx, vy, px, py, rot, prot, state, size, psize }` — `state` ∈ `sit pull fly puff rain plop bonk`; `size` ∈ [1, `SIZE_MAX`]; `psize` = previous step (lerp).
- `sling {x,y}`, `pull` or null, `puffed` (bool).
- `wagon { x, px, top, hw, bull, baseX, amp, period, t }`.
- `flies []` of `{ id, x, y, px, py, kind: 'fly'|'gold', value, t }`.
- `crows []` of `{ id, x, y, px, py, vx, r, flap }`.
- `score, hearts, maxHearts, flyCount, landings, levelLandings, shots, streak, bestStreak, level, zone = level % 4, loop, difficulty`.
- `stats { flies, goldFlies, landings, bulls, bigShowers, plops, puffs, bumps, hearts, shots, maxStreak, maxSize }`.
- `time`, `alpha`.
Events: `pull`, `launch {power}`, `fly {x, y, value, kind, count, size}`, `grow {size}` (each time size crosses a 0.1 step), `big` (crossed `BIG_AT`), `puff`, `bump {x, y}`, `land {x, y, points, bull, big, streak, size, shrinkTo}`, `plop {x, y}`, `heartLost`, `heartGain`, `newShot {retry}`, `levelUp {zone, level, loop}`, `gameOver {score}`.

**Growth twist (numbers are a starting point; the mechanics engineer tunes and documents them):**
- `size` grows by `GROW_RATE` (≈ 0.006 /s) while aiming and flying, and `GROW_FLY` (≈ 0.06) per firefly (gold 0.1), capped at `SIZE_MAX` 1.7. Changes in size are smoothed (ease toward a target, no pops).
- Effects of size s: pickup radius `R_NUBI·s`; bottom offset `FOOT·s`; landing pad `LAND_PAD + RAIN_PAD·(s−1)` (rain falls wider); buoyancy: `g = G·(1 − BUOY·(s−1))` (BUOY ≈ 0.35); quadratic-ish air drag `a = −DRAG·(s−1)·|v|·v` (small, so a full pull still reaches the far wagon at max size). The preview and the bot use exactly this.
- Landing: watering uses water → `size = 1 + (size−1)·RAIN_KEEP` (≈ 0.45), eased over the land phase. `big` landing when size ≥ `BIG_AT` (1.4) → `+POINTS.big`.
- Plop: `size = max(1, size − PLOP_LOSS)` (≈ 0.15).
- New level: size kept (it is a reward).
Rules: pickup when distance < `R_NUBI·s + R_FLY`; landing when Nubi's bottom (y − FOOT·s) crosses `wagon.top` downwards with |x − wagon.x| ≤ hw + pad; plop when bottom < GROUND_Y elsewhere or x outside [−1, 17.5]; a weak fling onto the bale is a harmless `flop` = retry of the same shot. Crow bump = circle bounce (BUMP_E). New shot: wagon placed per level ranges (≥ 5 u from the sling); fireflies along a reachable solution arc FOR THE CURRENT SIZE that ends on the wagon + 1–2 bonus ones; arcs avoid crows. Level up after `LANDINGS_PER_LEVEL` (5). First level easy for a 6-year-old.

### `CFF.Weather` (`js/weather.js`)
`new CFF.Weather({ width, height, seed })`, `resize`, `setLevel(zone, {instant})`, `update(dt)`, `burst(kind, x, y, n, opts)` in screen px: kinds `plop` (mist puffs + drops), `fly` (sparkles + glow), `land` (rain drops falling from Nubi, or snow in winter; `opts.width` px), `bump` (stars), `puff` (puffs), `grow` (a ring of tiny puffs). Ambient: spring → petals + butterflies, summer → butterflies + sparkles, autumn → tumbling leaves (pendulum sway + spin), winter → snow in depth layers. A few tiny ambient fireflies everywhere (layer `back`). `particles []` of `{ sprite, x, y, size, rot, flipX, alpha, layer: 'sky'|'back'|'front' }`. ≤ 160 particles.

### `CFF.Bot` (`js/bot.js`)
`new CFF.Bot(world, { skill, seed })`, `step(dt)`: think 0.4–0.9 s, choose the pull (search over angles/powers using `world` prediction, size-aware) that lands on the predicted wagon and passes the most fireflies; error ∝ (1 − skill); animate `aim()` ~0.5 s; `release()`; `puff()` if short. skill 1 lands ≥ 95 %, 0.85 ≈ 85 %.

### Renderer / main (integration — lead developer)
`CFF.Renderer` draws sky, far/near parallax, ground, bale + sling + band, wagon (+ crops popping up after each landing, kept until the next shot), fireflies (glow halo), crows, Nubi scaled by `size` (+ squash/stretch from velocity), rain/snow under Nubi on landing, preview dots, juice, HUD (score, hearts, firefly count, season name, a "size" puff meter with the BIG mark).

## 6. Test hooks
URL: `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N&size=S` (flags never saved).
`window.CFF.debug`: `world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), setSize(s), aim(dx, dy), release(), puff()`.
