# Ollie's Lighthouse Flip — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.OF`. Storage prefix `olf:`. Exe `OlliesLighthouseFlip.exe`, port 47628.
Scaffolded from `../robot-rooftop-flip/` (same genre, proven code); the colour-matching gates are removed and the day-to-night **visibility** twist is added (darkness layer idea from `../kitten-apple-castle/game/js/render.js`).
Fantasy in one sentence: **it must FEEL like a bouncy little otter swooshing between the floor and the ceiling of a cosy lighthouse — "tap… swoosh… fwump!" — catching fluttering leaves while the windows turn from dawn to an aurora night and the halls glow with lamps.**

## 1. Lessons from gravity-flip runners (keep / change)
| Reference idea (VVVVVV, Gravity Guy, G-Switch) | Keep | Change for us |
|---|---|---|
| One button flips gravity; you fall to the other surface | ✔ | real acceleration, a kick toward the new surface, eased turn-over, a soft landing squash |
| Flip only while standing on a surface | ✔ | + 0.12 s coyote time and a 0.18 s input buffer (kid-friendly) |
| Instant death on a spike/gap | ✘ | 3 hearts (Easy 5); bumps are soft boings; a hatch fall is rescued by Pip the puffin; 1.5 s blink of safety |
| Hazards on floor and ceiling | ✔ | **fairness rule**: at every x at least one surface is safe, and every hazard leaves time to react + fly |
| Darkness that hides the level (e.g. Limbo, Badland night) | ✔ (twist) | never unfair: the **visibility rule** (§5.1) guarantees every hazard is lit before the reaction window starts; darkness never goes below 30 % light |
| Collectibles along the route | ✔ | leaves that sway like pendulums in the warm draft |

## 2. Screen, scroll & coordinates (unchanged from Rooftop Flip)
- Logical view `VW×VH` from `Renderer.computeView`: landscape ≥16:9 → 540 tall, up to 1280 wide; other landscape → 960 wide, up to 960 tall; portrait → 560 wide (720 when aspect ≥ 0.6), up to 1600 tall.
- Units px (logical) and s; y grows downward; no vertical camera; `screenX = worldX − cam.x` (lerped with `world.alpha`).
- `OF.World.computeLayout(w, h)` → `{width, height, portrait, unit, midY, ceilY, floorY, corridorH, heroX}`: `unit = portrait ? min(w/6, h/8) : min(w/9.6, h/5.4)`; `midY = portrait ? 0.47·h : 0.53·h`; `ceilY = midY − 1.45·unit`; `floorY = midY + 1.45·unit`; `heroX = portrait ? 0.22·w : 0.26·w`. At 960×540: ceilY ≈ 141, floorY ≈ 431.
- Below floorY = the floor slab and the storey below (wood/stone); above ceilY = the ceiling beam, joists and upper wall.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search for inspiration only; never copy or trace; no known characters, brands, logos or mascots — Ollie must not look like any famous otter character). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (viewBox units) in a dark tone of the fill (never pure black). No `<text>`, fonts, scripts, `<image>`, external refs. `width`/`height` = viewBox. Transparent background unless stated.
**Colour separation:**
- Ollie: warm chestnut-brown fur `#8a5a3c`, shade `#6b4329`, cream face/belly `#f3dfc1`, dark nose `#3a2418`, outline `#3b2417`; a **bright teal snowflake scarf `#2ec4b6`** (shade `#1f8f86`, white snowflake dot pattern) whose ends flow behind him; a small brass **headlamp** on a strap (lamp lens centre given in §4.1).
- Leaves (collectible): `leaf_0` spring green `#5fd35a`, `leaf_1` sunny gold `#ffc53d`, `leaf_2` maple red-orange `#ff6b3d`; each with a pale midrib and a little stem. Must pop against every background.
- Obstacles: snowy whites, soft blues, woods with dark outlines; readable but never glowing (the renderer adds their small warning lamps at night).
- Backgrounds: the **corridor band** (between ceilY and floorY) is calm and less saturated than Ollie and the leaves; no large green/gold/orange areas there. The back wall is a muted tone per floor; window openings show the outside.

## 4. Assets (paths relative to `game/assets/default/`)
File names are kept from Rooftop Flip so the integration layer changes little; the *meaning* is new.
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `ollie_run_0..3.svg` | 0 0 128 128 | `0.95·unit` square | Ollie, side view facing **right**: a round, chubby sea otter running on all fours / bounding (big round head, small round ears, big friendly eyes with shines, cream muzzle with whiskers, little dark nose, thick tapered tail, short legs with dark paws), the teal scarf around his neck with both ends trailing back, a brass headlamp on his forehead. **Feet line y = 120. Body centre (64, 74). Headlamp lens centre (92, 44) r ≈ 6** (light yellow `#fff2a8`, the renderer adds the beam). Run cycle: legs, tail and scarf ends only; head/body geometry identical in all frames. |
| `ollie_air.svg` | same | same | mid-flip: paws tucked, scarf ends flowing, excited "o" mouth. Same body geometry and lamp position. |
| `ollie_bump.svg` | same | same | soft bump: eyes squeezed (> <), wavy mouth, one little sweat drop. Same geometry. |
| `ollie_happy.svg` | same | same | ^^ eyes, open smile, holding a leaf up is NOT needed (keep paws). Same geometry. |
| `leaf_0..2.svg` | 0 0 64 64 | `0.42·unit` | one leaf each (green / gold / red, see §3), slightly curled, stem pointing down-left, centred at (32, 32), fits a circle r 26. No face. The renderer rotates/flips it for flutter and adds a soft glow at night. |
| `vent_0.svg` | 0 0 160 124 | `0.80·unit × 0.62·unit` | floor prop: a pile of three big friendly snowballs (one has a little twig "hair"? no face). Bottom = y 124. |
| `vent_1.svg` | 0 0 100 156 | `0.50·unit × 0.78·unit` | floor prop: a tall stack of two wooden crates with a pair of boots / a rolled rug on top. Bottom = y 156. |
| `sign_0.svg` | 0 0 160 132 | `0.80·unit × 0.66·unit` | ceiling prop: a row of mittens and a scarf drying on a little line hung from two short cords (cord tops at y 0). Bottom = y 132. |
| `sign_1.svg` | 0 0 110 140 | `0.55·unit × 0.70·unit` | ceiling prop: a hanging basket of round greenhouse plants on three cords (top y 0). Bottom = y 140. |
| `drone.svg` | 0 0 128 96 | `1.0·unit × 0.75·unit` | **Pip the puffin** (rescue helper), flying, wings spread (one pose), friendly; holds a short soft rope with a ring hook at **(64, 92)** in its feet. Body centre (64, 36). |
| `finish.svg` | 0 0 160 300 | `1.4·unit × corridorH` (stretched vertically) | the floor's end: a round-topped wooden stairway door, open, warm light inside with the first steps going up, a lantern above it, bunting garland (no letters). Top part y 0–30 joins the ceiling, bottom y 270–300 on the floor. Glowing lamp at (80, 60). |
| `battery.svg`, `battery_empty.svg` | 0 0 48 48 | 28 (HUD) | lives: a plump red heart `#ff5a6e` with highlight; empty = outline only, lilac-grey at 50 %. |
| `icon.svg` | 0 0 256 256 | app icon | Ollie's head upside-down hanging from a ceiling beam at the top with his teal scarf, a gold leaf beside him, on a round deep-navy badge with a little lighthouse silhouette and a green aurora streak. Readable at 32 px. |

### 4.2 Floors (environment artist) — `levels/<zone>/` with zone ∈ `dawn` (Boot Room), `noon` (Greenhouse), `sunset` (Map Library), `night` (Lantern Deck)
Draw order (back → front): `sky` → `far` → back weather particles → `mid` (the back wall, with transparent window holes) → floor/ceiling/props → hero → front particles → darkness layer → HUD.
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 540 | full screen (scale VH/540), tiles, parallax 0.03 | **opaque** outside sky for the time of day: dawn = pink-peach-lilac with a low sun; noon = bright clear blue with a small high sun; sunset = orange → violet with a big low sun; night = deep navy with small stars and a **green-violet aurora** band. Tileable. |
| `far.svg` | 0 0 960 540 | same, tiles, parallax 0.12 | outside landscape: icebergs, snowy hills, a frozen sea line, tinted by time of day; transparent above ≈ y 200; opaque below y 500. Tileable. |
| `mid.svg` | 0 0 960 540 | same, tiles, **parallax 0.6** | the corridor's **back wall**, opaque except **2 big window openings** (fully transparent holes with a wooden/ stone frame and a sill), centred roughly at y 170–330 so a good part of each window shows inside the corridor band. Per floor: dawn Boot Room = pale blue-grey painted planks, coat hooks with coats, skis leaning, wainscot; noon Greenhouse = white glass frames (window holes bigger, green vines on the frames); sunset Map Library = dusky wood panels, bookshelves between windows, a framed map; night Lantern Deck = deep blue-grey stone, round porthole-ish windows, brass pipes. Muted, calm, darker in the middle band. Tileable. Report the wall `wall` hex. |
| `building.svg` | 0 0 240 400 | `2.4·unit × 4.0·unit`, tiled across each floor span (clipped to the span) | the **floor**: a floorboard/rug strip whose **top surface is the line y = 16** (Ollie runs on it), then the thick floor slab and the storey below (beams, a little radiator glow, stone) opaque from y 16 down; repeats every 240. Report the slab side colour as `wall`. |
| `rail.svg` | 0 0 240 160 | `2.4·unit × 1.6·unit`, tiled across each ceiling span; **y = 144 placed at ceilY** | the **ceiling beam**: a sturdy wooden beam with a smooth underside **y = 144** (Ollie's paws run there upside-down), crossing joists and the ceiling planks above; the whole tile is opaque from y 0 to 144 so the ceiling looks solid. Tileable every 240. |
| `rail_end.svg` | 0 0 40 160 | `0.4·unit × 1.6·unit` | right end cap of a ceiling span at an open hatch (beam end with a brass corner plate and a tiny lamp); mirrored for the left end. |
Palette hints: dawn wall `#a9b6c8`, floor warm oak `#b07a4f`; noon wall `#dfe9e4` (glass frames), floor terracotta tiles `#c47a5a`; sunset wall `#6e4f5a`, floor walnut `#7a4a34`; night wall `#3a4560`, floor slate `#4a5470`.
**Gaps (open hatches):** the renderer draws a dark hatch opening with the slab side colour; keep `wall` hex values in the final reply.

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`snow` (soft round snowflake, white), `flake` (6-arm crystal, white-blue), `mote` (warm dust mote, soft glow), `sparkle` (4-point star), `star` (5-point white-yellow), `puff` (soft round white puff), `bit_0`, `bit_1`, `bit_2` (tiny leaf bits in the three leaf colours, for catch bursts), `aurora` (a soft green wisp, viewBox 0 0 64 32), `glow` (white radial dot, for lamp halos).

## 5. Code architecture (`game/js/`, classic scripts on `window.OF`)
`rng.js` (given), `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `extras.js` (integrator).

### 5.1 `OF.World` (headless, deterministic for seed + inputs, fixed sub-steps 1/120 s)
Same API as Rooftop Flip's `RF.World` (`reset/setLayout/flip/update/drainEvents/solidAt/hazardAhead/flightTime/flightDist/gotoLevel/getState/setTrack`, prev positions + `alpha` interpolation, units-based re-anchoring on resize) **minus colour matching** and **plus visibility**:
- Removed: `gates[]`, `hero.color`, events `wrong`, `gate`; firefly colours.
- `leaves[] {id, x, y, prevX, prevY, baseX, baseY, kind (0..2), r, phase, swing, rot, prevRot, state:'fly'|'caught'|'gone', t}` replace fireflies. **Motion (pendulum flutter in a warm draft):** each leaf swings like a pendulum hanging from an invisible point: angle `θ = swing·sin(ω·t + phase)` (ω ≈ 2.2–3.0 rad/s, swing 0.5–0.8 rad); `x = baseX + L·sin θ`, `y = baseY + L·(1 − cos θ)` with `L ≈ 0.25·unit`, plus a slow vertical bob of ±0.06 unit; `rot = θ·1.2` (the leaf tilts with its swing, the renderer flips it with sign of dθ/dt for a flutter). Caught leaves (`state:'caught'`) spiral into Ollie over 0.35 s (radius shrinking, `rot` spinning), then `gone`.
- Catch: hero box overlaps circle `r = 0.22·unit` (×1.35 Easy) → `{type:'catch', leaf, x, y, combo, mult, points}`; `combo += 1`, `mult = min(5, 1 + ⌊combo/5⌋)`, `points = 10·mult`; `{type:'combo'}` when mult grows. On Normal/Hard a bump or a fall resets the combo (`comboBreak` if ≥ 2); on Easy the combo halves.
- Leaf patterns: lines along a surface, an arc along the flip path, small clusters; never inside an obstacle; kind cycles per pattern (one colour per pattern).
- **Visibility (the twist):** `world.light` (0.3..1, deterministic from level + progress): each zone has `lightFrom → lightTo` across the level (dawn 0.78→0.95, noon 1.0→0.88, sunset 0.72→0.48, night 0.40→0.32; loop doesn't change it). `world.lampsOn = light < 0.75`.
  - `lamps[] {id, x, side:'ceil'|'floor'}`: wall lamps placed every 3.5–5 units along the corridor (alternating high/low), drawn always; lit when `lampsOn`. Deterministic with the track, culled behind.
  - Every obstacle and every gap edge has a warning beacon the renderer lights when `lampsOn` (obstacle `.beacon = true`; gaps: renderer uses span ends).
  - **Visibility rule:** the renderer must keep every hazard lit at least `CONFIG.seeAhead` units ahead of Ollie: `seeAhead(level) = (reaction·speed + flightDist)/unit + 0.8` (export `world.seeAheadUnits()`); the headlamp beam length = `max(seeAhead, 3.2)` units on the current running side, and beacons always glow. Unit test proves seeAhead ≤ distance from heroX to the right screen edge in every layout (else the beam reach is clamped to the screen and beacons carry visibility).
- `hero` as before minus `color`, plus `lamp {x, y}` (world position of the headlamp lens after flip turn-over: mirror vertically with flipT), `state 'run'|'air'|'rescue'`.
- `drone` stays as the rescue helper (Pip the puffin; same fields).
- `finish {x}` = stairway door. Passing it → `finish`, bonus `100 × (zone + 1) × (loop + 1)`, +1 heart (up to max), `levelUp`.
- Events: `flip, land, catch, combo, comboBreak, bump, fall, rescue, heartLost, heartGain, finish, levelUp, gameOver`, plus `{type:'lampsOn'}` once per level when `lampsOn` turns true (renderer: a soft "click" and lamps fade on).
- **Rules** (speed, gravity, flip, support, coyote, rescue, obstacles, fairness, levels, lose): same as Rooftop Flip (`../robot-rooftop-flip/docs/MECHANICS.md`), with zone keys dawn/noon/sunset/night and the same tuned Easy preset (reaction 1.8 s etc.). The first floor must be easy for a 6-year-old.
- `getState()` adds `light, lampsOn, leaves (count alive)`.

### 5.2 `OF.Weather` — same API as `RF.Weather` (`setLevel/resize/update/burst/particles/ambient`). Back-layer particles are drawn **behind the back wall**, so they only show through the windows: dawn light snow, noon drifting ice sparkles (`flake`), sunset gentle snow, night snow + soft aurora wisps high up. Front layer (sparse, small, alpha ≤ 0.45, never leaf-coloured): dawn/noon warm dust motes in the window light, sunset motes, night a few tiny sparkles. Bounded counts (< 140). `ambient.tint` per zone (e.g. sunset warm, night cool).

### 5.3 `OF.Bot` — same as `RF.Bot` minus colour logic: flips before hazards (`hazardAhead`), never into a hazard, optional flips (skill ≥ 0.6) to catch a group of leaves when safe.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.OF.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), flip() }`. Test flags are never saved.

## 6. Customisation slots
`hero` (a custom picture drawn round inside a procedural otter ring: two round ears, a teal scarf band and the headlamp, with run bob and the same flip), `leaf` (custom picture drawn round with a leaf-shaped green ring and a little stem; flutter motion kept), `bg_dawn`, `bg_noon`, `bg_sunset`, `bg_night` (a full-scene photo replaces sky+far+mid for that floor; floor and ceiling stay; darkness still applies).

## 7. Rendering the visibility twist (integrator)
- Darkness layer on a half-resolution offscreen canvas: fill `rgba(10,14,38, (1 − light)·0.95)` (cool blue night), then cut lights with `destination-out` radial gradients: Ollie's headlamp **beam** (a soft cone from `hero.lamp` along the running direction, length per §5.1, half-angle ≈ 22°), a soft circle around Ollie (r 1.1 unit), each lit wall lamp (r 1.3 unit), each beacon (r 0.45 unit), the stairway door (r 2 unit), each leaf at sunset/night (r 0.35 unit). Draw it over the world, under the HUD. Window openings stay a bit brighter (the outside sky shows through): cut them at 40 %.
- Add warm colour on top in `screen`/`lighter` mode for lamp halos (`glow` sprite) and the headlamp beam (very soft yellow, alpha ≤ 0.18).
- Prompts, popups and banners are drawn above the darkness and never over Ollie.
- Performance: darkness canvas ≤ 960×540 device px, reused, no allocations per frame.

## 8. Audio (WebAudio, synthesized)
SFX: flip "swoosh" (rising up / falling down), land soft "fwump", catch leaf "rustle-pling" with pitch rising with combo, multiplier chime, bump soft "boing", fall "whee" + puffin flaps and a "peep", rescue pop, heart lost, heart gain, lamps-on "click-hum", finish door creak + fanfare, level-up, game over gentle tune, best score, button click. Music per floor: dawn soft marimba, noon bright plucks, sunset warm keys, night dreamy music-box bells; crossfade on level change.

## 9. Mobile — same platform layer as the other daily games (copied from Rooftop Flip, then `python3 shared/daily-mobile/apply.py otter-arctic-flip`).
