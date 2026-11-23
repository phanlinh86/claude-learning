# Puddle's Greenhouse Hop — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.PH`. Storage prefix `pgh:`. Exe `PuddlesGreenhouseHop.exe`, port 48413 (fallbacks 48423/48433/48443).
Forked from `../../frog-farm-hop/` (2026-11-08): the hopper core, camera, input, UI and mobile layer are kept; the wind twist is removed and replaced by **growth + weight**.
Fantasy in one sentence: **it must FEEL like being a round little penguin getting rounder — "boing, boing, BOING!" — up a rainy glass greenhouse, the leaves bending under your growing tummy.**

## 1. Lessons from vertical hoppers (keep / change)
| Reference idea (Doodle Jump, Mega Jump, Icy Tower) | Keep | Change for us |
|---|---|---|
| Auto-bounce on landing, player only steers left/right | ✔ | hold-left / hold-right halves of the screen + arrow keys |
| One-way platforms (pass through from below) | ✔ | — |
| Falling below the screen ends the run | ✘ | costs a **heart**; an upside-down umbrella pops Puddle back up (Easy 5 hearts, Normal/Hard 3) |
| Wrap-around edges | ✘ | soft greenhouse-pillar walls at the column edges |
| Enemies, shooting | ✘ | nothing scary; challenge = gaps, swinging baskets, bendy leaves and getting heavier |
| Moving / breaking / spring platforms | ✔ | hanging basket (pendulum swing), leaf (bends under weight like a damped spring), bouncy mushroom on a pot (big bounce) |
| Endless | ✔ | 4 **floors** of the Greenhouse Tower, then loops a bit harder |
| Power-ups make you bigger (Mario) | twist | **Puddle grows slowly + per firefly**: wider feet, bigger reach, deeper leaf flicks, ×2 metre points, but heavier = slower steering. Shrinks back with a size bonus at each new floor |

## 2. Screen and world (unchanged from the fork)
- Logical view `VW×VH` from `Renderer.computeView`: landscape ≥16:9 → 540 tall, up to 1280 wide; other landscape → 960 wide, up to 960 tall; portrait → 560 wide (720 when aspect ≥ 0.6), up to 1600 tall.
- **The world has no pixels.** Units u (1 u = 1 metre), seconds, `y` grows **upward**, the greenhouse floor is `y = 0`.
- Play column `x ∈ [0, COLW]`, `COLW = 12`. Hero centre clamped to `[0.55·size, COLW − 0.55·size]` (soft walls: `vx *= −0.35`, event `wall`).
- Camera `world.camY` = world y at the bottom of the screen, target `max(camY, hero.y − camLead)`, eased up, never down; `prevCamY` for lerp.
- Renderer: `unit` = landscape `VH / 11.5`, portrait `VW / 12.8`; `colX = VW/2 − 6·unit`; `sx = colX + x·unit`, `sy = VH − (y − camY)·unit`.
- Outside the column (landscape) the background continues; the column edges are drawn as tall greenhouse pillars (`pole.svg`).

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search for inspiration only; never copy or trace; no known characters, brands, logos or mascots — Puddle must NOT look like Pingu, Pororo, Club Penguin, Tux, Happy Feet's Mumble, the Madagascar / Batman penguins, Pinga, Piplup or any famous penguin; no brand logos on pots or cans).
Flat cartoon picture-book style, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (in viewBox units) in a dark tone of the fill (never pure black). No `<text>`, fonts, scripts, `<image>`, external refs; filters only for a tiny glow (`feGaussianBlur` ≤ 3). `width`/`height` = viewBox. Transparent background unless stated.
**Colour separation:**
- Puddle: a round chick-like little penguin. Back/head/flippers **deep slate-blue `#33476e`** (shade `#24345a`, outline `#1a2440`), face + belly **cream-white `#fbfdff`** (shade `#dfe8f3`), beak and feet **orange `#ff9f1c`** (outline `#b8650a`), pink cheeks `#ff9eb5`, big dark eyes `#1e1a33` with white shines, and a **coral rain hood / poncho collar `#ff5d73`** (shade `#d93d58`, outline `#9e2a40`) so she pops against the green garden and grey rain. Very round body (a teardrop-ball), stubby flippers.
- Fireflies: warm glowing yellow `#fff27a` → amber `#ffb627` abdomen, pale wings `#e8f6ff` (60 %), plum body `#5a3d5c`, soft round halo. The brightest small things on screen. Nothing else in the play band may be a yellow dot.
- Platforms are **solid, warm and darker than the backgrounds**: terracotta pot `#d9774a` / shade `#b25a33` / rim highlight `#f09a6c` / soil `#5b3a29`; potting shelf wood `#b98552` / `#8a5a33`; leaf **bright leaf-green `#5cc35a`** / shade `#3f9a45` / vein `#2f7a37` (lighter than any background green, with a cream vein so it reads); hanging basket wicker `#c99a5b` / `#9a6c36` with trailing pink flowers `#ff8fb8` and a thin dark chain `#5a5f73`; mushroom cap red `#ff5a5f` with cream dots `#fff3d6`; rescue umbrella coral-and-cream stripes, handle up.
- Backgrounds are **softer, cooler and less saturated** than characters and platforms (misty greens, grey-blues, lilac); keep the column centre (x 300–660 of 960) calm and low-contrast; no warm orange/coral in the play band (that's Puddle's hood and the pots).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `puddle_idle.svg` | 0 0 128 128 | `1.35·unit·size` square | Puddle standing, facing **right** (¾ view), hood on, smiling. **Feet line y = 118, body centre (64, 72), body width ≈ 80.** |
| `puddle_crouch.svg` | same | same | landing squash pose: body lower and wider, flippers out — same head geometry. |
| `puddle_up.svg` | same | same | rising: feet together pointing down, flippers up like wings, happy open beak. |
| `puddle_fall.svg` | same | same | falling: feet apart, flippers out flapping, "o" beak, hood flapping. |
| `puddle_ouch.svg` | same | same | squeezed eyes (> <), hood askew, a little water star. |
| `puddle_happy.svg` | same | same | eyes ^^, both flippers up cheering. |
| `firefly_0.svg`, `firefly_1.svg` | 0 0 64 64 | `0.75·unit` | side view, big round glowing abdomen; wings up / wings down; identical body geometry. Centre (32, 34). Own soft glow circle (r ≈ 26). |
| `pot.svg` | 0 0 192 96 | width = platform width | a wide terracotta flower pot seen from the side with soil and two small sprouts, a thick rim. **Top surface (rim) y = 14**, centre x 96. |
| `shelf.svg` | 0 0 160 48 | width = platform width | a short wooden potting-shelf plank with two little brackets underneath and a tiny seed packet-free label slot. **Top y = 8.** |
| `leaf.svg` | 0 0 192 64 | width = platform width | a big flat-topped leaf seen from the side (like a lily/banana leaf), central vein, a drop of water. **Top surface y = 16, attachment (stem) at the LEFT end x = 4, y = 20**; the renderer rotates/bends it about the stem by `p.bend`. Also draw `leaf_r.svg`? No — the renderer mirrors it for right-hand stems. |
| `basket.svg` | 0 0 160 112 | width = platform width | a round hanging wicker basket with trailing pink flowers and green tendrils. **Top surface (rim) y = 22**, centre x 80. Three chain lines meet ABOVE it — do not draw the chain (the renderer draws the chain from the pivot). |
| `mushroom.svg` | 0 0 64 80 | `0.6·unit` wide | a bouncy red cap mushroom with cream dots and a short stalk; **base y = 78** (sits on the pot rim), cap top y = 6. |
| `mushroom_up.svg` | 0 0 64 80 | same | the same mushroom squished flat-wide then springing (used 0.25 s after a bounce). |
| `umbrella.svg` | 0 0 256 112 | `3.0·unit` wide | rescue: an upside-down open umbrella (bowl shape, coral/cream stripes) with the curved handle pointing up in the middle. **Top (bounce line, the bowl's rim) y = 26.** |
| `heart.svg`, `heart_empty.svg` | 0 0 48 48 | 28 (HUD) | plump coral heart `#ff6b6b` with highlight; empty = outline only, grey at 50 %. |
| `jar.svg` | 0 0 64 64 | 40 (HUD) | a glass lantern jar with lid and handle, empty (renderer fills inner x 16..48, y 20..56). |
| `grow.svg` | 0 0 64 64 | 40 (HUD) | a tiny round penguin silhouette badge (slate blue + white belly) for the size meter. |
| `icon.svg` | 0 0 256 256 | app icon | Puddle's face + coral hood (front ¾), a glowing firefly, on a round badge: green leaves, greenhouse glass panes, a rain drop. Readable at 32 px. |

### 4.2 Floors (environment artist) — `levels/<f>/`, f ∈ `potting`, `fern`, `balcony`, `roof`
| File | viewBox | Placement | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 540 | full screen, cover-fit, parallax 0.02 | **opaque** back wall of that floor: potting — warm grey-blue rainy window light through big glass panes (`#a9bcc9`→`#e7eef0`) with faint wooden mullions; fern — misty green-teal (`#9cc9b4`→`#e3f2ea`); balcony — rain-grey lilac open sky (`#a7a9c9`→`#e9e8f4`) with soft rain clouds; roof — twilight lilac-rose (`#8d86c2`→`#f3dbe4`) with a soft rainbow arc and first stars. Horizontally tileable (left edge = right edge). |
| `far.svg` | 0 0 960 1080 | tiled vertically and horizontally, parallax 0.25 | **transparent** floating décor: potting — hanging tools, clay pots on far shelves, glass-pane frames; fern — hanging fern fronds, mist clouds; balcony — far orchids, umbrellas, railings; roof — paper-lantern-free soft glow lamps (no yellow dots! use pale lilac/peach glows), chimneys, distant trees. Low contrast, mostly in the left/right thirds; x 300–660 light. Top edge = bottom edge, left = right. |
| `ground.svg` (shared, `levels/ground.svg`) | 0 0 1280 420 | the greenhouse entrance floor: **ground line y = 330 sits on world y = 0**; seen only at the start | a brick floor, a potting bench, a watering can, little rain boots, a glass door with rain outside, puddles. Opaque below y ≈ 300, transparent above the furniture. Column centre (x 400–880) kept low (≤ 60 px above the ground line). |
| `pole.svg` (shared) | 0 0 48 256 | column edges, tiled vertically, parallax 1 | a white-painted greenhouse iron pillar with climbing ivy; seamless top/bottom. |
| `beam.svg` (shared) | 0 0 960 48 | drawn across the whole view at each floor boundary (world y = `levelY0` of the next floor), decorative only | a white-painted iron floor beam with rivets and a few hanging ivy leaves; horizontally tileable. |
| `palette.json` | — | — | `{ potting: {skyTop, skyBottom, tint}, fern: …, balcony: …, roof: …}`. |

### 4.3 Particles — `particles/` (viewBox 0 0 32 32 unless stated, centred)
`raindrop` (thin blue-white streak, 0 0 8 32), `drip` (a teardrop water drop, pale blue), `splash` (small crown of droplets), `mist` (soft round white-teal puff), `petal` (pink orchid petal), `leafbit` (small green leaf), `sparkle` (4-point star, white), `glow` (round yellow glow, firefly pickups only), `soil` (small brown crumbs), `puff` (white puff), `bubble` (a pale water bubble ring), `rainbowdot` — NOT needed. Background particles never yellow.

### 4.4 Floor constants (renderer `ZONE_INFO`)
| zone | key | name | hint |
|---|---|---|---|
| 0 | potting | Potting Shed | "Hold left or right to steer Puddle!" |
| 1 | fern | Fern Floor | "Leaves bend! Bigger Puddle bounces higher." |
| 2 | balcony | Orchid Balcony | "Baskets swing: time your hop!" |
| 3 | roof | Rooftop Rain Garden | "Almost at the roof, Puddle!" |

## 5. Code architecture (`game/js/`, classic scripts on `window.PH`)
`rng.js` (given), `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `extras.js` (integrator).

### 5.1 `PH.World` (headless, deterministic, fixed sub-steps 1/120 s)
- Same API as the fork: `new PH.World(opts)`, `reset({seed, difficulty, level})`, `PH.World.CONFIG`, `setLayout()` no-op, `steer(dir)`, `setX(x)`, `update(dt)`, `drainEvents()`, `gotoLevel(i)`, `getState()`, `spawn(kind, x, y, opts)`, `world.alpha`. **Removed:** `wind`, `gust()`, wind events. **Added:** `grow(amount)` test hook (adds size now), `setSize(s)` test hook.
- **State:** as the fork (`time, phase, level, zone, loop, camY, prevCamY, maxY, levelY0, goal, progress, score, fireflies[] (live array), fireflyCount, lantern, hearts, maxHearts, difficulty, stats`) plus
  `hero {x, prevX, y, prevY, vx, vy, dir, face, squash, stretch, tilt, mood, moodT, airT, lastPlat, invuln, rescueT, started, size (1..maxSize), prevSize, mass (= size², 1..), big (size ≥ CONFIG.bigAt), shrinkT (s left of the shrink animation)}`,
  `platforms[] {id, kind:'ground'|'pot'|'shelf'|'leaf'|'basket'|'rescue', x (centre of the top surface), prevX, y (top surface, INCLUDING the current bend/swing), prevY, w, spring (mushroom on a pot), springT, state:'live'|'gone', t, bounces, path, lvl,`
  leaf: `side (−1 stem on the left, +1 stem on the right), bend (rad, + = tip down), bendV, y0 (rest y)`;
  basket: `px, py (pivot point, ABOVE the basket), len (chain length u), ang (rad, 0 = straight down), angV`}.
  `stats` adds `maxSize, bigTime, leafFlicks, swings, shrinks` and drops wind fields.
- **Events:** `bounce {p, kind, spring, x, y, size}`, `leafBend {p, depth}` (when a landing bends a leaf), `firefly {f, x, y, combo}`, `grow {size, step}` (every 0.1 of size gained), `big {size}` (crossed `bigAt`), `lantern {hearts}`, `wall {side}`, `fall {hearts}`, `rescue {x, y}`, `levelUp {level, zone, bonus, sizeBonus, size}` (then Puddle shrinks back), `heartGain {hearts}`, `gameOver`, `meter {m}`.
- **Rules:**
  - **Bounce physics** as the fork (`g` ≈ 26, `bounceV` ≈ 12.4 → apex ≈ 3.0 u, mushroom ×1.6, umbrella ×1.45, `maxFall` 16). Size does **not** reduce the normal bounce height (so generation stays reachable).
  - **Growth (the twist):** `size` grows `growRate` per second while playing (0.006/s after playtest) plus `growPerFirefly` (0.006) per firefly, capped at `maxSize` 1.6 (Easy 1.5). `mass = size^2` (a shape that grows in 2-D on screen; documented in MECHANICS.md). `big = size ≥ bigAt` (1.3). Size eases visually (`prevSize` for lerp).
  - **Weight effects:** steering accel and top speed divided by `1 + steerK·(mass − 1)` (steerK ≈ 0.35, so at 1.6 top speed ≈ 0.73×; stays ≥ `minVxK`·maxVx); drag when not steering also lower (drifts further). Landing half-width pad `landPad·size`; catch radius `catchR·(0.75 + 0.25·size)`; walls/clamp use the body radius ×size.
  - **Leaves:** a leaf is a damped torsion spring about its stem: `bendV += (−k·bend − c·bendV)·dt`; landing adds an impulse proportional to the hero's mass and landing speed (`bendV += leafImpulse·mass·|vy|/bounceV`), max bend ≈ 0.35 rad; the top surface y used for collision is the rest y minus the bend drop at the hero's contact x. The bounce off a leaf is `bounceV·(1 + leafFlick·(mass − 1))` (leafFlick ≈ 0.18 → bigger = higher flick, capped ×1.15), event `leafBend`. Leaves wobble back over ~1 s (underdamped, 2–3 visible oscillations). A light hero barely bends it.
  - **Hanging baskets:** a pendulum hanging from a pivot above (`len` 2.0–3.2 u): `angV += −(g/len)·sin(ang)·dt` (no damping, small amplitude 0.25–0.45 rad, energy kept constant per zone/difficulty, the period ≈ 2π√(len/g) ≈ 1.8–2.2 s), basket centre = pivot + (sin·len, −cos·len). A landing gives the pendulum a small push in the hero's vx direction proportional to mass (then it keeps that amplitude a bit bigger, clamped). The hero does not ride (bounce is instant). The chain is purely visual; never collides.
  - **Platforms**: one-way landing exactly as the fork (feet crossed the moving top between the previous and current step, with the platform's own `prevY`/`prevX`). Kinds by zone: potting `{pot:.6, shelf:.4}`; fern `{pot:.3, shelf:.2, leaf:.35, basket:.15}`; balcony `{pot:.25, shelf:.2, leaf:.25, basket:.3}`; roof `{pot:.3, shelf:.25, leaf:.25, basket:.2}`. Widths: pot 2.4, shelf 1.7, leaf 2.2, basket 2.0 (× difficulty widthK). Leaves grow from the nearer column wall side visually but may sit anywhere; `side` = the stem side. Mushrooms on ~8 % of path pots (not in the first 20 m). Never two baskets in a row on the path. Every path gap reachable WITHOUT a mushroom or leaf flick, at size 1.0 AND at maxSize steering (reachability test at the slowest steering).
  - **Fireflies, lantern, score, levels, falling, rescue** as the fork, except: metre points ×2 while `big`; at `levelUp` the bonus is `100·(zone+1)·(loop+1)` and `sizeBonus = round(200·(size − 1))`, then `size` eases back to 1.0 over `shrinkT` 0.8 s (event `levelUp` carries both); the rescue platform kind is `'rescue'` (drawn as the umbrella).
  - The first floor must be easy for a 6-year-old: Easy has wide pots, short gaps, 5 hearts, lots of fireflies; growth is slow enough that Puddle reaches `big` around the middle of floor 1 for a casual player.
- **CONFIG** (units and why): the fork's keys minus wind, plus `growRate, growPerFirefly, maxSize, bigAt, steerK, minVxK, leaf {k, c, impulse, maxBend, flick}, basket {len:[a,b], amp:[a,b], push}, shrinkT, sizeBonusK`, `difficulty.{easy|normal|hard}.maxSize`, `zones[{kinds, basketAmp}]`.

### 5.2 `PH.Weather` (screen space) — `new PH.Weather({width, height, seed})`
`setLevel(zone, {instant})`, `resize(w, h)`, `update(dt, climbVy)`, `burst(sprite, x, y, n, opts)`, `particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front'}`, `ambient {tint}`. (`setWind` kept as a no-op for compatibility.)
- potting: rain streaks running DOWN the glass in the back layer (slow, wobbly paths, slight trails) + occasional `drip`s falling straight with gravity from the top + dust motes.
- fern: `mist` puffs drifting slowly sideways and fading + `drip`s + a few `leafbit`s tumbling (pendulum-tumble fall).
- balcony: steady `raindrop` streaks in 2 depth layers (fast front, slow faint back, slight slant) + `splash` crowns + `petal`s fluttering.
- roof: thin drizzle (fewer, slower drops) + `sparkle`s twinkling + occasional `bubble`s.
- Drips/rain accelerate under gravity to a terminal speed; tumbling leaves/petals sway like pendulums with drag. Bounded counts (< 180). Front-layer particles are small, sparse, pale, never yellow. Burst opts `{speed, life, size, gravity, spread, angle, up, spin, layer, drag}` as the fork.

### 5.3 `PH.Bot` — `new PH.Bot(world, {skill, seed})`, `bot.step(dt)`
As the fork, minus wind compensation, plus: uses the hero's current (size-dependent) `maxVx`/accel when judging reachability; predicts basket positions (pendulum) at the landing time; prefers leaves when big (higher flick) and mushrooms; skill 1 ≈ never falls; 0.5 ≈ casual.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.PH.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), steer(dir), grow(n), setSize(s) }`. Test flags are never saved.

## 6. Customisation slots
`hero` (a custom picture as a round sticker that squashes, stretches, tilts and **grows with size**, with tiny procedural flippers and feet), `firefly`, `bg_potting`, `bg_fern`, `bg_balcony`, `bg_roof`.

## 7. Audio (WebAudio, synthesized)
SFX: bounce "boing" (pitch drops a little as Puddle grows: heavier = deeper), mushroom "BOING-oing", leaf "fwump-ping" (a soft low thump + a springy twang), basket bounce "creak-boing", firefly "twinkle" (pentatonic step up within a group), grow (a tiny rising "bloop" every 0.1 of size), big (a cheerful "ta-da puff"), lantern chime, wall "tok", fall "wheee", umbrella rescue "boinggg + flap", level up fanfare + "shake-off" splash shrink sound, heart gain, game over (gentle tune), best score, click. Music per floor: potting — cosy plucked ukulele-ish (96 bpm), fern — soft marimba with water drops (90), balcony — bouncy pizzicato + rain shaker (104), roof — music-box twinkle (84); crossfade on floor change.

## 8. Mobile (iPhone / iPad) — same platform layer as the other daily games
Pointer Events on the stage (hold left half → −1, right half → +1; latest pointer wins). iOS audio unlock, `visibilitychange` pause, kid-proofing, safe-area HUD, scenery letterbox, `manifest.webmanifest` + 180/192/512 icons, `python3 shared/daily-mobile/apply.py penguin-greenhouse-hop` after integration.

## 9. Changes after build and QA (2026-11-23)
- Mechanics (engineer): `steerK 0.24` (top speed ×0.73 at size 1.6, floor `minVxK 0.7`), `growPerFirefly 0.006`; extra fields/helpers listed in MECHANICS.md (`World.surfY`, `platAt`, leaf `prevBend`, basket `y0/amp0/ampMax/rise`; `bounce.flick`, `leafBend.rad`, `levelUp.size`).
- Playtest patch: `growRate 0.004 → 0.006`, Easy `widthK 1.5 → 1.6`. No exploits; 0 unavoidable falls in 54,730 checked; growth is a power-up (being big halves falls), weight reduces overshoot.
- Lantern full at max hearts: no `heartGain`, `lantern.gained = false` ("Lantern full!" only).
- Renderer (visual QA): leaf stalks grow from the nearer pillar; basket hook + rod up to the roof; Easy pots capped at 1.05 u tall; "+10" placed beside Puddle by her size and never faded; "Flick!" only while big; floor bonus at 30 % height in portrait; portrait height pill stacked in the left column; 4:3 landscape unit `min(VH/11.5, (VW − 372)/COLW)`; size bar fixed width; lighter squash on the crouch pose; beam drawn opaque; "Umbrella boing!" on the rescue event (+ sound).
