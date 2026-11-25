# Mossy's Egg Grove — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.MEG`. Storage prefix `meg:`. Exe `MossysEggGrove.exe`, port 48613 (fallbacks 48623/48633/48643).
UI shell + mobile layer forked from `../cloud-farm-fling/`; world / bot / weather / render are new (physics drop-and-merge).
Fantasy in one sentence: **it must FEEL like dropping soft, round, wobbly eggs into a cosy nest — "plonk… roll… POP, a bigger egg!"**

## 1. Lessons from drop-and-merge games (keep / change)
| Reference (Suika-style "watermelon" games, 2048) | Keep | Change for us |
|---|---|---|
| Round items fall, roll and stack with real physics | ✔ | eggs are drawn as eggs but collide as circles (r = egg half-width); they roll and spin |
| Two equal items touching merge into the next size | ✔ | 8 egg kinds; two Golden Dragon eggs **hatch** a baby dragon (+100, both leave) |
| "Next item" preview | ✔ | shown in a little leaf bubble next to the nest |
| Lose when the pile stays over the top line | ✔ | 2.5 s grace with a clear, friendly warning; fairy rescues on Easy/Normal |
| Drop anywhere along the top | ✔ | Mossy carries the egg; drag/tap to move him; a dotted drop guide |
| Static, windless drops | ✘ | twist: **wind gusts** (warned 1.5 s ahead) push *falling* eggs sideways; the guide bends with the wind |
| Item pool is the same every level | ✘ | four seasons by score; each season is windier |

## 2. World and screen (world values in units u, seconds, **y UP**)
- Nest inner area: x ∈ [0, `NEST_W` = 9], floor y = 0, walls up to `WALL_TOP` = 11.2. 1 u ≈ 38 px on a 960×540 screen.
- Vine (danger) line `DANGER_Y` = 9.8. Mossy's body centre hovers at y = `MOSSY_Y` = 12.6; the held egg's centre is at y = `HOLD_Y` = 11.3 (just under his claws, above the walls).
- Drop x is clamped to [r, NEST_W − r] for the held egg's radius r.
- Renderer frame (what must be visible): x ∈ [−0.7, 9.7] (walls are 0.7 u thick), y ∈ [−0.9, 14.0].
  - Landscape: `unit = min(VH / 15.2, VW / 22)`; nest centred horizontally; the nest base at `groundPx = VH − 0.6·unit`. Left of the nest: "Next" bubble + the egg ladder (all 8 kinds, small, the ones reached so far coloured). Right of the nest: windsock + score card. HUD buttons (pause, sound) top-right inside safe insets.
  - Portrait: `unit = min(VW / 11, (VH − topHud) / 15.2)`; next bubble and windsock above the nest's top corners; ladder as a small row under the nest if there is room.
  - Screen x = `nestLeftPx + x·unit`; screen y = `groundPx − y·unit`.

## 3. Art style guide (all SVG, 100 % original)
- Hand-written SVG from generator scripts `tools/art-characters/gen.js` and `tools/art-environment/gen.js` (node, writes into `game/assets/default/`).
- Outline: 3 px at viewBox scale (scale with viewBox), colour = darker shade of the fill (never pure black), round joins/caps.
- One-step shading: a flat darker shape on the lower/right side + one small highlight. No filters; gradients only where listed.
- No `<text>`, fonts, `<script>`, `<image>`, external refs; `xmlns` present; transparent backgrounds (except sky layers).
- **Palette rule:** Mossy = moss green body, pale mint belly, leaf-shaped wings (lighter green with vein lines), tiny peach horns, big friendly dark eyes with highlights, rosy cheeks. **Gold/yellow is reserved for the Golden Dragon egg (kind 8).** Eggs must be distinguishable for colour-blind players by **pattern + size**, not only hue. Backgrounds are lower saturation than eggs and NEVER the same hue as the egg kinds in the middle of the screen; the area behind the nest (x 280–680 on 960) stays calm and mid-dark enough that pale eggs read (the nest back wall also helps).

## 4. Asset table (`game/assets/default/`)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `egg_1.svg` … `egg_8.svg` | 0 0 128 128 | square side `2·r·128/116` u (r = kind radius) | centre (64, 64) = physics centre. Egg outline fits inside a circle of radius 58: width ≈ 104 (x 12–116), height ≈ 116 (y 6–122), slightly pointy at the top. Each kind has its own colour + pattern + face. Kinds: **1 Dewdrop** (pale mint, a few tiny dots), **2 Sky** (robin blue, small speckles), **3 Berry** (pink, big white spots), **4 Moon** (lavender, a crescent moon + 2 tiny stars), **5 Fern** (fresh green, a curling fern swirl), **6 Sunset** (coral-orange, 3 wavy stripes), **7 Starry** (deep indigo-blue, white star sprinkles), **8 Golden Dragon** (warm gold with scale pattern + a little white sparkle). Cute closed-smile faces (two dot eyes + smile) on all, bigger kinds slightly more expressive. |
| `egg_crack.svg` | 0 0 128 128 | same as an egg | a zig-zag crack overlay (white/cream line with dark edge), drawn on top of a golden egg during hatching |
| `shell_l.svg`, `shell_r.svg` | 0 0 64 64 | 0.8 u | gold egg-shell halves (zig-zag top edge) that fly off when golden eggs hatch |
| `mossy_0.svg`, `mossy_1.svg` | 0 0 160 160 | 2.2 × 2.2 u | flying, wings up / wings down; body centre (80, 70) = world position (`mossy.x`, `MOSSY_Y`); both front claws reach down to (80, 132) where the held egg hangs (the renderer draws the egg first, then Mossy). Facing the viewer (3/4 front), tail curls to one side. Same body geometry in all `mossy_*` frames. |
| `mossy_drop.svg` | 0 0 160 160 | same | claws open, cheerful "hup!" face, wings mid |
| `mossy_happy.svg` | 0 0 160 160 | same | eyes closed in a big smile (^ ^), wings up (merges / level up) |
| `mossy_worry.svg` | 0 0 160 160 | same | small "o" mouth, eyebrows up, wings mid (pile near the vine line) |
| `baby.svg` | 0 0 128 128 | 1.8 u | the hatched baby dragon friend (a different colour from Mossy: soft teal-blue with peach belly), flying, waving; centre (64, 64) |
| `fairy.svg` | 0 0 96 96 | 1.4 u | the rescue fairy: a tiny glowing round sprite with dragonfly wings and a wand (no human face realism; round cute face), centre (48, 48) |
| `windsock.svg` | 0 0 128 96 | 1.9 × 1.4 u | pole on the left (x 10–18, base at y 96), sock attached at (18, 14) blowing to the RIGHT, full, striped (alternating cream + leaf green + plum stripes). The renderer flips it for left wind and squashes it horizontally when calm |
| `windsock_calm.svg` | 0 0 128 96 | same | same pole, sock hanging down limp |
| `bubble.svg` | 0 0 128 128 | 2.6 u | the "Next" bubble: a round dewdrop bubble with a small leaf on top; transparent centre (an egg is drawn inside) |
| `icon.svg` | 0 0 256 256 | | app icon: Mossy's face + an egg, opaque rounded square, deep forest green background |
| `nest.svg` | 0 0 416 620 | 10.4 × 15.5 u (scale 40 viewBox px per u) | the nest container **back + walls**, drawn BEHIND the eggs. Inner left wall face at x 28, inner right wall face at x 388 (360 px = 9 u), inner floor at y 568 (= world y 0), wall tops at y 120 (= 11.2 u). Walls: woven twigs / bark posts (28 px thick) with moss tufts and a few tiny mushrooms + glowing flowers on the outside. A soft darker back panel (woven twig mesh) between the walls so eggs read. Nest base below the floor (y 568–620). Above y 120 transparent. Renderer: x0 = nestLeftPx − 28·k, y0 = groundPx − 568·k, k = unit/40. |
| `nest_front.svg` | 0 0 416 620 | same placement | only the FRONT lip pieces (a few twig ends and moss tufts overlapping the inner wall faces by ≤ 6 px, and the floor lip), drawn OVER the eggs. Transparent elsewhere. |
| `vine.svg` | 0 0 400 40 | width 9.6 u | the danger line: a thin flowering vine that spans the nest at `DANGER_Y` (centre line y 20). Calm colours; the renderer tints/pulses it when the warning is on |
| `levels/<zone>/sky.svg` | 0 0 960 540 | cover-fit | zones `spring`, `summer`, `autumn`, `winter`. Gradient sky glimpsed through the canopy, soft light shafts allowed |
| `levels/<zone>/far.svg` | 0 0 960 360 | width 960·s | far forest: big tree trunks, toadstool houses with round doors/windows, hills; horizontally tileable; base line at y 360; parallax 0.2 (the screen does not scroll much: a slow drift + Mossy-following sway) |
| `levels/<zone>/near.svg` | 0 0 960 240 | | nearer: ferns, flowers, mushrooms, a lantern post, roots; tileable; base line at y 240 |
| `levels/<zone>/ground.svg` | 0 0 960 120 | full width tile | forest floor (moss / grass / leaves / snow) from the top line y 10 downward, tileable |
| `levels/palette.json` | | | per zone `{ skyTop, skyBottom, ground, ink, bar, accent }` |
| `particles/*.svg` | 0 0 32 32 | ≤ 0.6 u | `sparkle`, `star`, `glow` (soft radial white, the only gradient-alpha sprite), `petal` (pink), `leafbit` (autumn leaf), `snow`, `firefly` (tiny ambient light — pale green, NOT gold), `streak` (a white curved wind line), `puff` (white pop puff), `shellbit` (tiny cream shell bit), `heart` |

Animation frames sharing one geometry: all `mossy_*`; `windsock`/`windsock_calm` share the pole.

## 5. Module contracts

### `MEG.RNG` (`js/rng.js`, exists): `new MEG.RNG(seed)`, `next() range(a,b) int(a,b) pick(arr) chance(p) sign() gauss() fork(salt)`.

### `MEG.World` (`js/world.js`) — headless, deterministic, pixel-free
`new MEG.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0 })`; statics `MEG.World.CONFIG`, `MEG.World.DIFF`, `MEG.World.LEVELS` (`[{ name, wind, ... }]` × 4), `MEG.World.KINDS` (`[{ kind: 1..8, r, points, name }]`).
Fixed sub-steps `CONFIG.STEP = 1/120 s` with an accumulator; `alpha` = leftover fraction (for render interpolation).
Methods:
- `moveTo(x)` — target x for Mossy (clamped for the held egg); Mossy eases there (critically damped, max speed ≈ 14 u/s). `nudge(dir)` for keys (−1/0/+1 held).
- `drop()` — if `canDrop` (an egg is held and the cooldown is over): the held egg starts falling from (`mossy.x`, `HOLD_Y`) with Mossy's current vx × 0.3. Emits `drop {x, kind}`. Next egg appears in Mossy's claws after `DROP_COOLDOWN` (≈ 0.55 s); emits `ready {kind, next}`.
- `predictDrop(x)` → `{ path: {x,y}[] (every ~0.05 s), landX, landY }` for the held egg dropped at x NOW, using the SAME step physics as real eggs (gravity + current wind, assuming the wind state continues as it is) against the current pile (pile treated as static circles). Used by the renderer guide and by the bot.
- `update(dt)`, `drainEvents()`, `getState()`, `gotoLevel(i)`, `spawnEgg(kind, x, y)` (test hook), `setWind(dir, strength)` (test hook; dir −1/0/1, strength null = level default; holds until the next cycle).
State fields:
- `phase`: `'play' | 'over'`; `time`.
- `mossy { x, px, vx, tx, mood: 'idle'|'drop'|'happy'|'worry', moodT, flap }` (`px` = previous step x for interpolation).
- `held` = kind or 0 (0 during the cooldown), `next` = kind of the following egg, `canDrop` (bool), `cooldown`.
- `eggs []` of `{ id, kind, r, x, y, px, py, vx, vy, rot, prot, w (angular vel), falling (true until first contact with the pile/floor/wall), age, born (s since created by a merge: for a pop-in scale), over (seconds resting above DANGER_Y) }`.
- `wind { dir: -1|0|1, phase: 'calm'|'warn'|'gust', t, dur, strength (u/s² at full), force (current signed acceleration, eased in/out), nextDir }`.
- `danger` (0..1 = max over eggs of `over / OVER_T`), `rescues` (left), `maxRescues`.
- `score, level, zone = min(level,3) or level % 4 (see below), loop, difficulty, combo, comboT, bestCombo, maxKind, merges, drops`.
- `stats { drops, merges, maxKind, hatches, maxCombo, rescues, windDrops (drops made while a gust blew), kinds: [0..8 counts made] }`.
- `levelGoal` (score needed for the next season), `levelStart` (score at season start).
Events: `drop {x, kind}`, `ready {kind, next}`, `land {id, x, y, kind, speed}` (first contact; speed for the "plonk" volume), `bump {x, y, speed}` (egg–egg hits with speed > 2 u/s, rate-limited), `merge {x, y, kind (new), points, combo, id}`, `hatch {x, y, points}`, `combo {n}`, `windWarn {dir}`, `gust {dir, strength}`, `calm`, `warnOn` (danger crossed 0.35), `warnOff`, `rescue {ids: [], x, y}`, `levelUp {zone, level, loop}`, `newKind {kind}` (first time a kind is made this run), `gameOver {score}`.

**Physics (starting point; the mechanics engineer tunes and documents):**
- Gravity `G` ≈ 22 u/s² (eggs feel weighty but soft), max fall speed ≈ 16 u/s. Circles vs. circles and vs. the walls/floor (segments). Position-based separation (several iterations per step) + velocity impulses with restitution ≈ 0.15 (a little bounce), friction ≈ 0.4, rolling: `w` from tangential contact velocity so eggs spin as they roll; angular damping. Sleep-free but must be STABLE: a full nest must not jitter, explode or tunnel at 16× speed.
- Kinds radius (u): 0.50, 0.66, 0.84, 1.04, 1.26, 1.50, 1.78, 2.10. Points on creation: 1, 3, 6, 10, 15, 21, 28, 36. Hatch (two kind-8 touch): +100, both removed with a hatch event (and a short 0.4 s "cracking" pause is a renderer thing; the world removes them at once).
- Merge: two eggs of the same kind whose distance < r1 + r2 + 0.02 → new egg of kind+1 at the contact-weighted midpoint (clamped inside the nest), velocity = average + a small up pop (≈ 2 u/s), `born = 0` (renderer scales it 0.7 → 1 over 0.15 s while physics radius grows smoothly to avoid explosions). Only one merge per egg per step. Combo: merges within `COMBO_T` 0.8 s of the previous one → combo + 1, bonus `combo − 1` points.
- Drop pool: kind weights by difficulty (Easy 1–3 mostly: 45/35/20; Normal 1–4: 35/30/22/13; Hard 1–5: 30/28/20/14/8), never more than `maxKind − 1` except kinds 1–2. Deterministic from the seed.
- Danger: an egg that is not `falling`, has `age > 1 s` and whose top (y + r) is above `DANGER_Y` accumulates `over += dt` (decays at 2×dt otherwise). Any egg with `over ≥ OVER_T` (2.5 s) → rescue if `rescues > 0` (removes the 4 highest eggs, emits `rescue`, all `over` reset), else `gameOver`.
- Wind cycle (per level `LEVELS[z].wind` strength, × difficulty factor Easy 0.6 / Normal 1 / Hard 1.25, × (1 + 0.15·loop)): calm `CALM` 5–9 s → warn 1.5 s (dir chosen: different from the last gust 70 % of the time) → gust 3–5 s (force eases in over 0.5 s and out over 0.6 s) → calm. Force applies ONLY to eggs with `falling = true` (and to Mossy's sway visually). Wind strengths at Normal: spring 2.0, summer 3.0, autumn 4.0, winter 5.0 u/s². The first 8 s of a game are always calm.
- Seasons: `levelGoal` per difficulty (Normal: 120, 320, 650, then +450 per winter loop; Easy ×0.75, Hard ×1.2). Level up keeps the eggs. `zone` = level < 4 ? level : 3; `loop` = max(0, level − 3).
- First season must be easy for a 6-year-old: the pile should not reach the vine for the first ~40 drops of random play on Easy.

### `MEG.Weather` (`js/weather.js`)
`new MEG.Weather({ width, height, seed })`, `resize(w, h)`, `setLevel(zone, {instant})`, `setWind(force)` (signed u/s², called by the renderer every frame: ambient particles drift with it and wind `streak` sprites appear during gusts), `update(dt)`, `burst(kind, x, y, n, opts)` in screen px: kinds `merge` (sparkles + puff, `opts.color`), `hatch` (shell bits + stars + hearts), `land` (2–3 tiny moss/dust bits), `rescue` (sparkle ring), `level` (petals/leaves/snow shower from the top). Ambient: spring → petals; summer → green fireflies + sparkles; autumn → tumbling leaves (pendulum sway + spin); winter → snow in 3 depth layers. `particles []` of `{ sprite, x, y, size, rot, flipX, alpha, layer: 'sky'|'back'|'front' }`. ≤ 160 particles.

### `MEG.Bot` (`js/bot.js`)
`new MEG.Bot(world, { skill, seed })`, `step(dt)`: think 0.35–0.8 s per egg; sample ~12–24 x positions, use `world.predictDrop(x)` to find the landing, score: lands touching an egg of the same kind (big +), next to the kind+1 or kind−1 (small +), low landing height (+), avoids burying small eggs under big ones, avoids the walls' top; error ∝ (1 − skill); then `moveTo(x)`, wait until Mossy arrives, `drop()`. Skill 1 should reach summer on Normal most games; skill 0.5 ≈ a casual kid.

### Renderer / main / UI (integration — lead developer)
`MEG.Renderer` draws sky, far/near (slow drift), ground, nest back, eggs (interpolated, rotated, merge pop-in, warning wobble when `over > 0`), nest front, vine line (pulsing coral when `danger > 0.35`), drop guide (dotted, bent by the wind; ends with a small ring of the held egg's size), Mossy + held egg (bob, wing flap, sway with the wind), windsock + gust arrow, next bubble, egg ladder, score + season progress bar, juice (merge rings, "+N" popups, combo text, hatch fireworks + baby flying away, rescue fairy sweep), HUD.

## 6. Test hooks
URL: `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N` (flags never saved).
`window.MEG.debug`: `world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), moveTo(x), drop(), spawnEgg(kind, x, y), setWind(dir, strength)`.
