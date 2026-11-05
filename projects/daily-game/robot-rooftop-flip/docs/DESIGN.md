# Bolt's Rooftop Flip — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.RF`. Storage prefix `brf:`. Exe `BoltsRooftopFlip.exe`, port 47622.
Fantasy in one sentence: **it must FEEL like a springy little robot pup snapping between the rooftops and the sky-rail with magnet paws — "tap… zoop… CLANK!" — while the city's sky turns from dawn to night.**

## 1. Lessons from gravity-flip runners (keep / change)
| Reference idea (VVVVVV, Gravity Guy, G-Switch) | Keep | Change for us |
|---|---|---|
| One button flips gravity; you fall to the other surface | ✔ | real acceleration (not instant), a kick toward the new surface, eased turn-over animation, a "clank" landing squash |
| Flip only while standing on a surface | ✔ | + 0.12 s coyote time after leaving a surface and a 0.18 s input buffer before landing (kid-friendly) |
| Auto-scrolling runner, instant death on a spike/gap | ✘ | 3 batteries (Easy 5); bumps are soft boings, a gap fall is rescued by a friendly drone; 1.5 s blink of safety |
| Floor and ceiling both full of hazards | ✔ | a **fairness rule** in the generator: at every x at least one surface is safe, and every hazard leaves enough time to react + fly (§5.1) |
| Collectibles along the route | ✔ | fireflies in 3 colours; only Bolt's current colour counts (twist) |
| Speed ramps forever | ✔ | gentle: per time of day, plus a small loop bonus |

## 2. Screen, scroll & coordinates
- Logical view `VW×VH` from `Renderer.computeView` (same as the other daily games): landscape ≥16:9 → 540 tall, up to 1280 wide; other landscape → 960 wide, up to 960 tall; portrait → 560 wide (720 when aspect ≥ 0.6), up to 1600 tall. The world gets `width,height` in `reset`/`setLayout`; nothing hard-codes 960.
- Units: px (logical), seconds. y grows **downward**. There is **no vertical camera**: world y = screen y. Horizontal scroll: `cam.x` = world x at the screen's left edge; `screenX = worldX − cam.x` (lerped with `world.alpha`).
- `RF.World.computeLayout(w, h)` (static) → `layout {width, height, portrait, unit, midY, ceilY, floorY, corridorH, heroX}`:
  - `unit = portrait ? min(w/6, h/8) : min(w/9.6, h/5.4)` (100 at 960×540, ≈93 at 560×1000).
  - `midY = portrait ? 0.47·h : 0.53·h`; `ceilY = midY − 1.45·unit` (the rail's running underside); `floorY = midY + 1.45·unit` (the rooftop line); `corridorH = floorY − ceilY`.
  - `heroX = portrait ? 0.22·w : 0.26·w` (Bolt's body centre, screen x; fixed).
  - At 960×540: ceilY ≈ 141, floorY ≈ 431. Below floorY = building facades; above ceilY = rail girders, cables and sky.
- Bolt's world x = `cam.x + heroX`. `cam.x` grows by `speed·dt`.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search for inspiration only; never copy or trace; no known characters, brands, logos or mascots — Bolt must not look like any famous robot dog (no Wall-E eyes, no K-9, no Aibo, no Astro Boy style). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (in the viewBox units given) in a dark tone of the fill (never pure black). No `<text>`, fonts, scripts, `<image>`, external refs. `width`/`height` = viewBox. Transparent background unless stated.
**Colour separation:**
- Firefly colours (the matching twist; colour AND shape): **pink `#ff5fa2` + heart**, **yellow `#ffd23f` + star**, **cyan `#39e1ff` + drop**. Index 0 = pink, 1 = yellow, 2 = cyan everywhere.
- Bolt: soft white-silver body `#eef2f8`, shade `#b8c4d8`, tangerine accents `#ff8a3d` (ear insides, collar, tail tip), navy outline `#2a3350`; dark glass chest screen (the renderer draws his colour symbol on it).
- Obstacles: muted friendly greys/greens/browns with dark outlines (must be readable but not glowing).
- Backgrounds stay **less saturated and darker in the corridor band** (between ceilY and floorY) than the fireflies, Bolt and gates; never use big areas of exactly pink/yellow/cyan there.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `bolt_run_0..3.svg` | 0 0 128 128 | `0.95·unit` square | Bolt, side view facing **right**: a small round robot pup (big head, floppy metal ears, two big round eyes with shines on a dark face visor or on the face plate, little nose, antenna with a small ball, a stubby spring tail, 4 short legs with **magnet paws** = little rounded pads with a tangerine stripe). **Feet line y = 120. Body centre (64, 74). Chest screen: circle centre (60, 82) r 10** (dark glass `#1d2440` with a highlight; nothing drawn on it). Run cycle: legs (and a tiny ear/tail bob) only; head/body geometry identical in all frames. |
| `bolt_air.svg` | same | same | mid-flip: legs tucked toward the body, ears flowing back, excited "o" mouth. Same body geometry. |
| `bolt_bump.svg` | same | same | soft bump: eyes squeezed (> <), wavy mouth, one little sweat drop, ears up. Same body geometry. |
| `bolt_happy.svg` | same | same | ^^ eyes, open smile with tongue, ears perked. Same body geometry. |
| `firefly_<c>_0/1.svg`, c ∈ `pink`,`yellow`,`cyan` | 0 0 64 64 | `0.44·unit` | cute firefly seen from the side facing left: small dark plum body `#3b2a4a` with two tiny eyes, two translucent white wings (frame 0 up, frame 1 down), and a **big glowing tail lantern shaped like its symbol** (pink heart / yellow star / cyan drop) centred at (34, 40) r ≈ 14, filled in its colour with a white-hot centre. Body centre (32, 32). The renderer adds an additive radial glow behind it. |
| `gate_<c>.svg` (pink / yellow / cyan) | 0 0 96 300 | `0.95·unit × corridorH` (stretched vertically) | paint arch: a tall, translucent light curtain (alpha ≤ 0.45, its colour, soft vertical stripes) between two rounded lamp posts: a short post at the top (hangs from the rail, y 0–28) and the bottom (stands on the roof, y 272–300). Its symbol (big, opaque, white-outlined) at (48, 150) and small copies at (48, 70) and (48, 230). |
| `vent_0.svg` | 0 0 160 124 | `0.80·unit × 0.62·unit` | rooftop AC unit (rounded box, fan grille, little feet). Stands on the roof: its bottom = y 124. No face. |
| `vent_1.svg` | 0 0 100 156 | `0.50·unit × 0.78·unit` | short brick chimney with a curl of soft smoke-puff on top (puff inside the box). Bottom = y 156. |
| `sign_0.svg` | 0 0 160 132 | `0.80·unit × 0.66·unit` | hanging shop sign from two short chains (chains top at y 0 attach to the rail), rounded board with a simple paw-print or fish-bone pictogram. Bottom of the board = y 132. |
| `sign_1.svg` | 0 0 110 140 | `0.55·unit × 0.70·unit` | hanging flower basket on three cords (top y 0) with round flowers. Bottom = y 140. |
| `drone.svg` | 0 0 128 96 | `1.0·unit × 0.75·unit` | friendly rescue drone: round body with a little light, two propellers on arms (drawn as blurred discs), a soft rope with a hook at **(64, 92)**. Body centre (64, 36). |
| `finish.svg` | 0 0 160 300 | `1.4·unit × corridorH` (stretched vertically) | the level finish: two posts (top y 0–30 from the rail, bottom y 270–300 on the roof) holding a string of round light bulbs and a big bunting banner (no letters) across the middle, plus a big glowing star at (80, 150). |
| `battery.svg`, `battery_empty.svg` | 0 0 48 48 | 28 (HUD) | lives: a rounded battery with a little lightning bolt; full = mint-green `#46d68c` with highlight; empty = outline only, lilac-grey at 50%. |
| `icon.svg` | 0 0 256 256 | app icon | Bolt's head and front paws upside-down hanging from a rail at the top, a yellow star firefly beside him, on a round deep-navy night badge with a few tiny building silhouettes. Readable at 32 px. |

### 4.2 Times of day (environment artist) — `levels/<zone>/` with zone ∈ `dawn`, `noon`, `sunset`, `night`
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 540 | full screen (scaled VH/540 vertically, ×same horizontally), tiles horizontally, parallax 0.02 | **opaque**. dawn = pink-peach-lilac gradient with a low rising sun at the horizon and soft clouds; noon = bright clear blue with puffy white clouds and a small sun high up; sunset = orange → violet gradient, big low sun, long streaky clouds; night = deep navy with small stars (no halo discs) and a crescent moon. Horizontally tileable (left edge = right edge). |
| `far.svg` | 0 0 960 540 | same size, tiles, parallax 0.12 | transparent above ≈ y 230; distant city skyline silhouettes (thin towers, domes, cranes, a water tower), low contrast, tinted by the time of day (night: tiny lit windows dots). Opaque at the very bottom (y > 500). Tileable. |
| `mid.svg` | 0 0 960 540 | same, parallax 0.35 | transparent above ≈ y 280; nearer, slightly larger buildings with simple windows, darker than `far` and **muted**; night: some warm-lit windows. Opaque below y 500. Tileable. |
| `building.svg` | 0 0 240 400 | `2.4·unit × 4.0·unit`, tiled horizontally across each rooftop span (clipped to the span) | the play rooftop: a parapet ledge whose **top surface is the line y = 16** (Bolt runs on it); facade with windows below (opaque from y 16 down), small details (pipes, a door on the roof); repeats seamlessly every 240. Night: lit windows. Give the facade colour as `wall` hex in your final reply (the renderer draws the side walls at gaps in it, slightly darker). |
| `rail.svg` | 0 0 240 160 | `2.4·unit × 1.6·unit`, tiled across each rail span; **y = 144 placed at ceilY** | the sky-rail: a sturdy rounded steel girder (truss y 104–144) whose **flat underside y = 144** is where Bolt's paws clamp (a slight glow strip there), hung from two cables/pylons rising to y 0 (transparent between). Tileable every 240. |
| `rail_end.svg` | 0 0 40 160 | `0.4·unit × 1.6·unit` | the right end cap of a rail span (rounded bumper with a little warning light); the renderer mirrors it for the left end. |
Palette hints: dawn sky `#f6b7a8`→`#b8a3d9`, roofs warm brick `#b56a5a`; noon sky `#7cc6ff`→`#d4f0ff`, roofs sandstone `#c9a27a`; sunset sky `#ff9a5c`→`#6b4a9a`, roofs plum-brown `#7d4e5e`; night sky `#0e1638`→`#2b2f6b`, roofs slate `#3b4466` with warm windows `#ffd98a`.

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`mist` (soft wide white wisp), `seed` (dandelion seed with a little parachute), `mote` (warm soft glow dot), `leaf` (small green leaf), `star` (5-point, white-yellow), `sparkle` (4-point star), `puff` (soft round white puff), `spark` (tiny orange spark), `bit_pink`, `bit_yellow`, `bit_cyan` (tiny glowing heart / star / drop in the firefly colours), `shoot` (shooting-star streak, viewBox 0 0 64 16).

## 5. Code architecture (`game/js/`, classic scripts on `window.RF`)
`rng.js` (given), `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js` (integrator).

### 5.1 `RF.World` (headless, deterministic for seed + inputs, fixed sub-steps 1/120 s)
- `new RF.World(opts)` calls `reset(opts)`; `reset({seed, difficulty:'easy'|'normal'|'hard', width, height, level:0})`. `RF.World.CONFIG` exported.
- `RF.World.computeLayout(w, h)` (static, §2). `setLayout(w,h)` recomputes the layout and **re-anchors** everything: world x/y and lengths are stored in **units** internally or rescaled so the track, fireflies, gates, hero and cam stay at the same relative place (the hero must not fall through on a rotate/resize).
- Input: `flip()` → if Bolt is grounded (or within coyote time) flips gravity (event `flip`); otherwise buffered for ≤ 0.18 s (one press) and applied on landing. Ignored while `hero.state === 'rescue'`.
- `update(dt)` accumulates and runs fixed steps of `CONFIG.step` (1/120). Every moving thing stores `prevX/prevY` (and `cam.prevX`, `hero.prevFlipT`) at the start of each step; the renderer lerps with `world.alpha` (leftover fraction 0..1). `drainEvents()` → array, then cleared.
- Query helpers (pure, no RNG; used by the bot, the renderer and the tests): `solidAt(side, x)` → bool (side `'floor'|'ceil'`), `hazardAhead(side, fromX, dist)` → `{kind:'gap'|'vent'|'sign', x0, x1} | null` (nearest), `flightTime()` (s, from one surface to the other at the current gravity), `flightDist()` (= speed·flightTime, px).
- `gotoLevel(i)` — jump to level i (emits `levelUp`). `getState()` → plain summary for tests. `setTrack(spec)` test hook (optional) to place a hand-made track.
- **State:** `time, phase ('run'|'over')`, `level` (0-based, endless), `zone` (= level % 4), `loop` (= ⌊level/4⌋), `score, combo, mult (1..5), maxCombo, hearts, maxHearts, difficulty, distance (units run), progress (0..1 of the current level), levelLen (units), speed (px/s now), layout, cam {x, prevX}`,
  `hero {x, y, prevY, vy, grav (+1 = pulled down to the roof, −1 = pulled up to the rail), grounded, side ('floor'|'ceil'|null), flipT (0..1: 0 upright on the roof, 1 upside-down on the rail; eased in the step), prevFlipT, color (0..2), state ('run'|'air'|'rescue'), invuln (s left), runPhase (0..1 loops with distance; renderer picks run frame ⌊runPhase·4⌋), squash (0..1 decays, set on landing), bumpT (s since last bump, for the bump face), happyT}`.
  Hero `x` = world x of the body centre; `y` = body centre; hit box `w = 0.50·unit, h = 0.50·unit` around it; standing on the roof: `y = floorY − 0.42·unit`; on the rail: `y = ceilY + 0.42·unit`.
  `roofs[] {x0, x1}` and `rails[] {x0, x1}` (solid spans, world x, sorted), `obstacles[] {id, kind:'vent'|'sign', variant (0|1), side, x (centre), w, h, hit (bool), hitT}` (vent: bottom at floorY; sign: top at ceilY), `fireflies[] {id, x, y, prevX, prevY, baseY, color, r, phase, state:'fly'|'caught'|'flee'|'gone', t, vx, vy}`, `gates[] {id, x, color, passed}`, `finish {x} | null` (current level's finish arch), `drone {x, y, prevX, prevY, state:'in'|'carry'|'out', t} | null`, `stats {flips, caught, wrong, bumps, falls, gates, levels, distance}`.
- **Events:** `{type:'flip', grav}`, `{type:'land', side, speed}` (speed = |vy| on contact), `{type:'catch', ff, x, y, combo, mult, points}`, `{type:'wrong', ff}`, `{type:'combo', combo, mult}` (mult went up), `{type:'comboBreak', combo}`, `{type:'gate', color, x}`, `{type:'bump', ob}`, `{type:'fall'}` (left the corridor through a gap), `{type:'rescue'}` (drone drops Bolt back on a surface), `{type:'heartLost', hearts}`, `{type:'heartGain', hearts}`, `{type:'finish', x}` (passed the finish arch), `{type:'levelUp', level, zone, bonus}`, `{type:'gameOver'}`.
- **Rules:**
  - Speed: `speed = planet.speed·unit` px/s, `planet.speed` per zone (units/s, e.g. dawn 3.0 → night 3.9) × difficulty × (1 + 0.08·loop), easing up slowly inside a level. Bolt's x is fixed on screen; the world scrolls.
  - Gravity: `g = CONFIG.g·unit/100` toward the current surface (`grav`). Flip: `grav = −grav`, `vy = grav·kick` (a small push toward the new surface), the turn-over `flipT` eases toward its target (0 or 1) taking about the flight time. Landing on a surface: `vy = 0`, grounded, squash, event `land`.
  - Support: on the roof Bolt is supported when `solidAt('floor', x)` for his footprint (centre ± 0.18·unit); same for the rail. With no support he keeps falling (coyote time 0.12 s for flipping). Past `floorY + 1.3·unit` or above `ceilY − 1.3·unit` → `fall`: one heart lost, `hero.state = 'rescue'`: the drone flies in, carries Bolt (≈ 0.9 s, the world keeps scrolling) and drops him on the next solid span of the surface he fell from (or the other one), `rescue`, then `invuln = 1.5 s`.
  - Obstacles: hero box overlaps an obstacle box (not `hit`) while `invuln = 0` → `bump`: one heart lost, the obstacle becomes `hit` (squash and no more collisions), `invuln = 1.5 s`, `bumpT = 0`.
  - Fireflies: hover with a gentle bob (`baseY + sin`) and a tiny drift. Catch when the hero box overlaps the circle (`r = 0.22·unit`, ×1.35 on Easy). Same colour → `catch`: `combo += 1`, `mult = min(5, 1 + ⌊combo/5⌋)`, `points = 10·mult`, event `combo` when mult grows. Other colour → `wrong`: the firefly flees (zips up/away, `state:'flee'`); on Normal/Hard combo → 0 (`comboBreak` if it was ≥ 2); on Easy nothing else happens.
  - Gates: when the hero passes `gate.x` → `hero.color = gate.color`, event `gate`. Gates appear every ~8–14 s and always change the colour. After a gate most upcoming fireflies (~65 %) match the new colour.
  - Track generation (deterministic, ≥ 2 screens ahead, culled behind): the first 2 s of every run are safe (both surfaces solid, no obstacles). **Fairness:** at every x at least one surface is solid and obstacle-free; a hazard on one surface needs the other surface clear from `hazard.x0 − (flightDist + margin)` to `hazard.x1 + margin`; two hazards that force flips are at least `reaction·speed + flightDist` apart (`reaction` per difficulty: easy 1.8 s, normal 0.95 s, hard 0.7 s). Gaps 0.8–2.2 units wide (narrower on Easy). Firefly patterns: lines along a surface, an arc along the flip path, small clusters; never inside an obstacle.
  - Levels: `levelLen` units per zone (≈ 60–80 s at its speed). At the end a `finish` arch is placed; passing it → `finish`, bonus `100 × (zone + 1) × (loop + 1)`, +1 heart (up to max), `levelUp` (level++), the next zone's track continues without a stop.
  - Lose: hearts reach 0 → phase `over`, event `gameOver` (the scroll eases to a stop over ~0.6 s).
  - The first level must be easy for a 6-year-old: Easy = slower, fewer and narrower gaps, longer reaction gaps, 5 hearts, bigger catch radius.
- **CONFIG** (with units and why) at the top of `world.js`; per-difficulty presets in `CONFIG.difficulty`, per-zone params in `CONFIG.zones`.

### 5.2 `RF.Weather` — `new RF.Weather({width,height,seed})`, `setLevel(zone,{instant})`, `resize(w,h)`, `update(dt, scrollSpeed)`, `burst(sprite, x, y, n, opts)` (x,y in **screen** coords), `particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front'}`, `ambient {tint (css rgba or null)}`. Ambient particles drift left with a share of the scroll speed (back ≈ 0.2, front ≈ 1.1) so they feel at depth. dawn: soft mist wisps (back) + a few dew sparkles; noon: floating dandelion seeds that sway + an occasional leaf; sunset: warm motes rising slowly + leaves; night: twinkling stars in the sky area (back, y < ceilY − 0.5u only) + a shooting star every 6–10 s + soft sparkles. Front-layer particles are small and sparse (alpha ≤ 0.5) and never look like fireflies (no pink/yellow/cyan glow dots in the corridor). Bounded counts (< 140). Works for any canvas size (portrait up to 720×1600). Burst opts: `{speed, life, size, gravity, spread, up, spin, layer}`.

### 5.3 `RF.Bot` — `new RF.Bot(world, {skill, seed})`, `bot.step(dt)`: looks ahead for the next hazard on Bolt's current surface (`hazardAhead`) and flips when it is within `flightDist + lead` (lead shrinks with skill; timing noise gaussian `(1 − skill)·0.15 s`), never flips into a hazard on the other side, and (skill ≥ 0.6) makes optional flips to catch a group of matching fireflies when it is safe. skill 1 ≈ never hit; 0.5 ≈ casual player. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.RF.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), flip() }`. Test flags are never saved to settings.

## 6. Customisation slots
`hero` (Bolt: a custom picture is drawn round inside a procedural robot ring with little magnet paws and his chest-colour badge, with run bob and the same flip), `firefly` (a custom picture drawn round with a glowing ring in each firefly's colour plus its symbol badge, so matching still works), `bg_dawn`, `bg_noon`, `bg_sunset`, `bg_night` (a full-scene photo replaces sky+far+mid for that time of day; rooftops and rail stay).

## 7. Audio (WebAudio, synthesized)
SFX: flip "zoop" (rising for up, falling for down), land "clank" (magnet), catch "pling" whose pitch rises with combo, wrong "nope" (soft buzz), multiplier up chime, gate "shimmer", bump soft "boing", fall "whee" + drone whirr, rescue pop, heart lost, heart gain, finish fanfare, level-up, game over gentle tune, best score, button click. Music: a bouncy chiptune-lite loop per time of day (dawn soft marimba, noon bright pluck, sunset warm keys, night dreamy bells), crossfade on level change. Unlock on the first gesture.

## 8. Mobile (iPhone / iPad) — same platform layer as the other daily games
- Pointer Events: `pointerdown` on the stage (not on UI) flips. UI buttons fire on click; the ghost click is swallowed.
- iOS: audio unlock in the first `touchend`; `visibilitychange` pauses and suspends audio; kid-proofing (no zoom, no rubber-band, no callouts, no text selection).
- Home screen: `manifest.webmanifest` plus 180/192/512 PNG icons from `tools/render_mobile_icons.js`.

## 9. Changes after build and QA (2026-11-05)
- Mechanics: see MECHANICS §9 (Easy tuning, one-colour firefly lines, on-screen fall + rescue, portrait midY 0.47·h).
- Renderer: Bolt's chest symbol is bigger with a bigger glow, plus a soft ring of his colour under his paws; the turn-over never squashes below 42 % height and the nose leads the flip; landing squash pivots on the feet; a bump makes a small hop; wrong-colour fireflies glow dimmer; the yellow star is drawn 15 % bigger; event callouts sit beside Bolt on the open side of the corridor, the streak callout on the facade; the gate flash is subtle; custom backgrounds get a soft dark band behind the corridor.
- Integration: the sprite pre-warm queue survives a resize (`assets.js`), How to Play fits short landscape phones, the "NEW!" badge stays inside its box.
