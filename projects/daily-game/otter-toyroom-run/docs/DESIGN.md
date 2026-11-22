# Otto's Playroom Dash — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.OD`. Storage prefix `otr:`. Exe `OttosPlayroomDash.exe`, port 48313 (fallbacks 48323/48333/48343).
Forked from `../robot-oasis-run/` (Pebble's Oasis Run, the earlier lane runner): same projection, lane spring, input and mobile layer;
**the Fizz boss and the pillows are removed**, the twist is now **gravity per biome**.

Fantasy in one sentence: **it must FEEL like a happy little otter scampering across a giant playroom at bedtime — zip between lanes,
"boing" over foam blocks, and feel the floor change under your paws: floaty on the bed, snappy on the craft table, slow-motion under the stars.**

## 1. Lessons from lane runners (keep / change)
| Reference idea (Subway Surfers, Temple Run) | Keep | Change for us |
|---|---|---|
| Hero seen from behind, runs into the screen | ✔ | pseudo-3D on a 2D canvas (projection of a flat road), no 3D engine |
| 3 lanes, swipe to switch, snappy lane change | ✔ | ≈ 0.15 s eased spring with a lean; one queued input |
| Swipe up jump, swipe down roll | ✔ jump / ✘ roll | only jump; tap zones too (left / middle / right third) |
| Instant death, chased by a guard | ✘ | 3 hearts (Easy 5), soft tumble + blink, a biome gives a heart back; nothing scary |
| Coins in lines and jump arcs | ✔ | wooden acorns (3 kinds, same value) in rows and in arcs **shaped by the biome's gravity** |
| Endless rising speed | ✔ | 4 biomes of the playroom, then the room loops a bit faster |
| Power-ups, shop | ✘ | cut for a one-day build |
| — | twist | **gravity per biome**: g multiplier 1.0 → 0.7 → 1.25 → 0.5; jumps, bouncing balls, falling particles and acorn arcs all follow it; a HUD gravity badge + banner announce it |

## 2. Screen, world and projection
Unchanged from the fork (see `../robot-oasis-run/docs/DESIGN.md` §2): logical view from `Renderer.computeView`; **1 u = one lane width**,
lanes x = −1, 0, +1, y up from the road, `s` along the track, `z = s − dist`; camera `CAM {h 1.9, d 3.2}`, `k(z) = d/(z+d)`, visible
z ∈ [−1.2, 36], `camX = 0.35·hero.x`. The tallest jump apex (≤ 1.6 u, moon gravity) must stay on screen in every layout.
Background: sky gradient, `sky.svg` décor, `far.svg` horizon band (bottom edge on `horizonY`), the floor plain (gradient `floorFar` →
`floorNear`), the road (trapezoid x ∈ [−1.5, 1.5], lane dividers every 2 u, edge studs every 1 u), roadside props, objects.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search for inspiration only; never copy or trace; no known characters, brands or logos — Otto must not
look like any famous otter or plush (no Sesame/Disney/PBS otters, no "Otter" app mascots), toys are generic and unbranded: no LEGO studs
logo, no Crayola wrapper look (plain coloured paper wrappers with a wavy band), no famous rocket or teddy). No letters or numbers on blocks
(paint simple shapes: dot, star, heart, triangle).
Flat cartoon picture-book style, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (viewBox units)
in a dark tone of the fill (never pure black). No `<text>`, fonts, scripts, `<image>`, external refs, no heavy blur filters (a tiny
`feGaussianBlur` glow is OK). `width`/`height` = viewBox. Transparent background unless stated.
**Colour separation:**
- Otto: chocolate-brown fur `#7a4a2e`, shade `#5e3820`, outline `#3b2414`, cream face/belly/paws `#f4e1c1`, a **mint knitted scarf**
  `#3ee0b0` (shade `#22b48c`) with a coral stripe `#ff7a6b` so he pops on every floor; dark eyes `#2b2034` with white shines, pink nose `#e27a8a`.
- Acorns (index 0..2): **0 round classic acorn — warm caramel nut `#d98a3d` + chocolate cap `#6b3f22`**; **1 long slim acorn — glossy
  golden `#ffcc33` nut + olive cap `#8a7a2a`**; **2 painted toy acorn — raspberry `#ff4f7b` nut with white dots + teal cap `#1fa7a0`**;
  each with a white highlight, a little stem, and a soft light rim so they are the brightest small things on the road.
- Obstacles are **solid, saturated primary toy colours** with dark outlines: block tower (stacked wooden cubes: tomato red `#e8453c`,
  sunflower `#f6b928`, royal blue `#3b6fd8`, painted shapes), stacking-ring toy (rainbow rings on a wooden peg, wooden base), foam-block row
  (three squishy cubes in lilac `#b58cf0` / sky `#6cc4f2` / lime `#9bd44a` — clearly solid, not a cushion), bouncy ball (red/white/blue
  striped with a star patch). Never the acorn colours as the main fill.
- Backgrounds: sky, wall and far scenery **softer and less saturated** than characters and obstacles; the road is a light toy-road
  colour (chapter-tinted: felt/quilt/paper/night-blue carpet), never the acorn colours; props at the roadside can be richer but stay outside the road.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `otto_0..3.svg` | 0 0 128 128 | `0.95·laneW0·k` wide at z = 0 | Otto seen **from behind, slightly from above (¾ back view)**, scampering into the screen: round head with small round ears, the back of the mint scarf with its knot and two flapping ends, a round furry back, a long thick tapering otter tail, four short legs with cream paws. **Feet line y = 120, body centre (64, 72), body width ≈ 80.** Frames 0–3 = run cycle (legs + tail swish + scarf ends flap); head/body outline identical except a ±2 px bob baked into frames 1 and 3. |
| `otto_jump.svg` | same | same | legs tucked / stretched like a little leap, tail straight back-up, scarf ends up — same head/body geometry. |
| `otto_ouch.svg` | same | same | head turned so one squeezed eye (> <) shows over the shoulder, a tiny swirl star, ears back; same body geometry. |
| `otto_happy.svg` | same | same | looking back over the shoulder with a big ^^ smile, one paw waving; same body geometry. |
| `acorn_0..2.svg` | 0 0 64 64 | `0.42·laneW0·k` | the three acorns (§3), upright, centred (32, 34), fitting r 26. |
| `tower_0.svg`, `tower_1.svg` | 0 0 128 160 | `0.86·laneW0·k` wide | tall obstacles ("go around"): 0 = a wobbly stack of 3 wooden blocks with painted shapes; 1 = a stacking-ring toy (4–5 rainbow rings on a peg, round wooden base, a ball on top). **Base line y = 154, centre x 64.** |
| `blocks.svg` | 0 0 160 80 | `0.95·laneW0·k` wide | low obstacle: a row of three squishy foam cubes across the lane, front view, slightly squashed. **Base line y = 74.** Height ≈ 0.42 u. |
| `ball.svg` | 0 0 96 96 | `0.6·laneW0·k` | a round striped bouncy ball (rotatable), centre (48, 48), r 42. |
| `heart.svg`, `heart_empty.svg` | 0 0 48 48 | 28 (HUD) | lives: plump coral `#ff6b6b` heart with a highlight and a tiny stitched seam (plush); empty = outline only at 50 %. |
| `grav_0..3.svg` | 0 0 48 48 | 30 (HUD badge) | gravity badges: 0 a bouncing ball with a short arc (normal), 1 a feather (floaty), 2 a heavy wooden block with a down arrow-ish motion line (no letters) (heavy), 3 a crescent moon with a little hop arc (moon). |
| `icon.svg` | 0 0 256 256 | app icon | Otto's head (front ¾, big eyes, mint scarf) holding a caramel acorn, on a round badge: toy blocks + a glow star. Readable at 32 px; opaque full-bleed background. |

### 4.2 Biomes (environment artist) — `levels/<b>/`, b ∈ `meadow`, `pillows`, `crayon`, `stars`
| File | viewBox | Placement | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 540 | top-anchored, width `max(VW, 960)` | **transparent** except décor (the "sky" is the big room beyond): meadow — a sunny window frame with soft light rays, a hanging felt cloud mobile; pillows — a bed canopy / bunting garland, puffy plush clouds; crayon — paper-cut sun and vines, a string of paper chains; stars — glow-in-the-dark stars on a deep-blue ceiling, a crescent nightlight moon, a toy planet mobile on strings. Keep the bottom 120 px empty. Tileable horizontally. |
| `far.svg` | 0 0 960 300 | **bottom edge on `horizonY`**, tiled seamlessly, parallax `−camX·18 px` | horizon band, transparent above ≈ y 60, low contrast: meadow — toy shelves with a wooden castle, a dollhouse, a rocking horse silhouette; pillows — rolling quilt hills and pillow peaks; crayon — a skyline of standing crayons, glue pots and paper trees; stars — dark-blue blanket hills, toy rocket silhouettes and a soft nightlight glow. Last 20 px (y 280–300) an opaque soft band in the biome's `floorFar`. |
| `prop_0..3.svg` | 0 0 160 220 | roadside, base line y = 214, centre x 80 | 4 props per biome: meadow — wooden toy tree, felt flower clump, a toy windmill, a teddy-sized wooden house; pillows — a pillow stack, a plush cloud on a stick, a tall bedpost with a knob, a teddy-free sleeping-cap pile? (use: a folded blanket stack); crayon — giant crayon tree, a paper palm, glue bottle (blank label), a paintbrush cup; stars — a toy rocket, a lamp with warm glow, a planet on a stand, a sleepy star plush. |
| `palette.json` | — | — | `{ meadow: {skyTop, skyBottom, floorFar, floorNear, path, pathEdge, divider, vig}, pillows: …, crayon: …, stars: … }`. |

### 4.3 Particles — `particles/` (viewBox 0 0 32 32 unless noted, centred)
`dust` (soft puff), `sparkle` (4-point star, white), `butterfly` (felt butterfly), `feather` (small white feather), `confetti` (tiny
paper square, viewBox 0 0 16 16), `leaf` (paper-cut leaf), `star` (tiny 5-point glow star), `firefly` (warm glow dot), `puff` (round
white cloud puff), `ring` (thin white circle for acorn pickups).

### 4.4 Biome constants (renderer `ZONE_INFO`, colours from `palette.json`)
| zone | dir | name | banner | gravity `gk` | gravity label | hint |
|---|---|---|---|---|---|---|
| 0 | meadow | The Felt Meadow | "Biome 1: The Felt Meadow" | 1.0 | Normal hops | "Swipe to change lanes!" |
| 1 | pillows | Pillow Mountains | "Biome 2: Pillow Mountains" | 0.7 | Floaty jumps! | "Floaty jumps! Hop the foam blocks!" |
| 2 | crayon | The Crayon Jungle | "Biome 3: The Crayon Jungle" | 1.25 | Quick heavy hops! | "Heavy hops! Bouncy balls roll across!" |
| 3 | stars | The Glow-Star Galaxy | "Biome 4: The Glow-Star Galaxy" | 0.5 | Moon jumps! | "Moon jumps! Float over everything!" |

## 5. Code architecture (`game/js/`, classic scripts on `window.OD`)
`rng.js`, `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `extras.js` (integrator).

### 5.1 `OD.World` (headless, deterministic, fixed 1/120 s sub-steps)
Same API as the fork minus the boss: `new OD.World(opts)` → `reset({seed, difficulty, level})`, `move(dir)`, `jump()`, `setLane(i)`,
`update(dt)` (`alpha`), `drainEvents()`, `gotoLevel(i)`, `getState()`, `spawn(kind, lane, zAhead, opts)`, `setLayout()` no-op, `OD.World.CONFIG`.
**Removed:** `boss`, `summonBoss`, pillows, events `bossEnter/throw/pillowLand/bossLeave`, stats `pillows*/boss*`.
- **State:** `time, phase, level, zone, loop, dist, levelDist, goal, progress, endS, speed, score, acorns, hearts, maxHearts, difficulty, combo, maxCombo,`
  **`gk` (current gravity multiplier, eases to the zone's target over `CONFIG.gravEase` ≈ 1.2 s after a level change — never a jolt mid-jump),
  `gTarget`, `g` (= CONFIG.g·gk, u/s²), `jumpV` (current take-off speed)**, `hero {…same fields as the fork…}`,
  `objects[] {id, kind:'tower'|'blocks'|'ball'|'acorn', s, z, prevZ, x, prevX, y, prevY, vx, vy, rot, prevRot, h, w, d, variant (acorn 0..2, tower 0..1), state, t, …}`,
  `stats {acorns, jumps, lanes, bumps, levels, dist, time, maxAir (longest airtime s), maxApex (u)}`.
- **Events:** `acorn {o, x, y, z, variant, points, combo}`, `jump {gk}`, `land {hard}`, `lane {from, to}`, `bump {o, kind}`, `heartLost`, `heartGain`,
  `combo` (10, 20, …), `levelUp {level, zone, bonus, gk}`, `gravity {gk, from, to}` (fired when the ease starts), `gameOver`, `ballBounce {o}`.
- **The twist — gravity per biome** (`CONFIG.zones[z].gk` = 1.0 / 0.7 / 1.25 / 0.5):
  - hero gravity `g = CONFIG.g·gk`; take-off speed `jumpV = CONFIG.jumpV·gk^CONFIG.jumpVexp` (0.35 in the build — 0.65 would make the apex shrink as gravity falls) so the apex grows gently as gravity
    falls (apex = jumpV²/2g ∝ gk^(2·0.65−1)) and airtime grows more: aim **normal apex ≈ 1.0 u / 0.65 s; floaty ≈ 1.1 u / 0.85 s; heavy
    ≈ 0.95 u / 0.57 s (still clears foam blocks 0.42 u and balls); moon ≈ 1.25 u / 1.05 s**. The engineer picks the exact exponent and documents it.
  - Gentle "floaty" feel: at the apex add a small hang (reduce g by up to 20 % while |vy| < 1 u/s) only when gk < 1.
  - Bouncy balls bounce vertically under the same g (restitution per CONFIG) while rolling across lanes; a ball is only a hit when it
    overlaps Otto vertically too (Otto can pass under a high bounce on moon gravity — fair and fun).
  - Acorn **arcs** are generated from the current jump arc (`jumpV`, `g`, `speed`) so a jump in the arc lane collects them all.
  - Row gaps scale with airtime (`gap ≥ speed·(react + airtime·0.5) + 2.5`), so a long moon jump never lands you in an unavoidable row.
  - Particles: `Weather.setGravity(gk)` makes feathers/confetti/stars fall slower or faster.
- **Rules** otherwise as the fork: running speed, lane spring, jump buffer, collisions (`acorn` taken if |y − hero.y − 0.35| < 0.6;
  obstacles hit if `hero.y < h − 0.05`: tower h 1.6 (never jumpable), blocks h 0.42, ball h = ball.y + 2r), `bump` → heart lost, stumble
  0.6 s, invuln 1.6 s; patterns `tower1`, `tower2` (never 3 lanes), `blocks1`, `blocks3` (all lanes — not in zone 0, not on Easy before zone 2),
  `ball` (rolls across at 1.2–1.8 u/s and bounces), `acornLine`, `acornArc`, `acornZig`. Always one free lane, reachable. Zone 0 = towers + acorns only.
  Biome goal `CONFIG.goal[d]·(1 + 0.1·loop)` → `levelUp` bonus 100·(zone+1)·(loop+1), +1 heart, mood 'happy'. Lose at 0 hearts.
- First biome easy for a 6-year-old (Easy ≈ 5.5 u/s, wide gaps, 5 hearts).

### 5.2 `OD.Weather` (screen space)
As the fork plus `setGravity(gk)`. Meadow: fluttering `butterfly`s + slow `dust` motes in window light. Pillows: drifting `feather`s
(pendulum fall, very slow). Crayon: falling `confetti` + `leaf` (tumble, faster). Stars: twinkling `star`s above the horizon + `firefly` glows.
Front-layer particles sparse, pale, never in the centre lane band near Otto, never look like acorns. Count < 160.

### 5.3 `OD.Bot`
As the fork without boss logic; it must know the current airtime (`world.jumpV`, `world.g`) to time jumps over blocks and balls and to
grab arcs. skill 1 ≈ never hit; 0.5 ≈ casual.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.OD.debug` →
`{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), move(dir), jump() }`.

## 6. Customisation slots
`hero` (Otto: round sticker that bobs, leans and squashes), `acorn` (round inside a light ring), `bg_meadow`, `bg_pillows`, `bg_crayon`, `bg_stars`.

## 7. Audio (WebAudio, synthesized)
SFX: lane "zip", jump "boing" (pitch follows gravity: lower and longer on moon), land "thup", acorn "tok" (wooden block knock + bell,
pentatonic step up with the combo), combo chime, bump "bonk-boing", ball bounce "bwop", gravity change "wobble-whoosh" (pitch slides
down for floaty, up for heavy), biome chime, heart lost/gain, game over lullaby, best score, click. Music: a toy-box loop per biome —
meadow music-box + glockenspiel (96 bpm), pillows soft celesta waltz (84), crayon xylophone + woodblock (108), stars lullaby bells (76);
crossfade on biome change.

## 8. Mobile
Same platform layer as the fork / newest games: swipe on threshold crossing (≥ 24 css px within 350 ms), taps by thirds, safe areas,
(no `#rotate` prompt: both orientations play well), kid-proofing, `visibilitychange`, home-screen manifest + icons, `shared/daily-mobile/apply.py` (Volume + Score Card).

## 9. Changes after build and QA (2026-11-22)
- Mechanics: `jumpVexp` 0.35 + a small apex hang when gk < 1; a jump keeps its take-off gravity while gk eases; extra fields
  hero `airT/apexY/jg/jv/jk`, balls `awake/bounces/wake`, arc acorns `arc/arcS`; `ballBounce` fires on every near floor bounce (`wall` flag).
- Playtest: biome-1 `tower2` 0 (two-tower rows caused 59 % of kids' biome-1 hits), balls `ballV 2.8, ballKick 1.2, ballRest 0.6`
  (the old moon first hop of 1.56 u could neither be jumped nor run under), Crayon `gapK 1.2`.
- Renderer: landscape `laneW0 = min(0.19·VW, 0.36·VH, (footY − ins.top − 62)/2.08)` so the moon apex clears the HUD; bumped towers
  drawn behind Otto at 30 %; "+10" at 1.25 u beside the head; gravity hint after the banner at `topY + 110`; biome pill under the
  measured DOM button row in portrait; HUD text 15–16 px; `grav_0` is a diagonal-striped ball.
