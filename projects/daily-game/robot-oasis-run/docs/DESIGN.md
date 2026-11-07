# Pebble's Oasis Run — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.PO`. Storage prefix `por:`. Exe `PebblesOasisRun.exe`, port 47671 (fallbacks 47681/47691/47701).
Fantasy in one sentence: **it must FEEL like bounding down a sunny storybook path as a happy little robot pup — "zip, zip, boing!" — snapping between lanes, scooping up shells, and giggling past a fox's pillow fight.**

## 1. Lessons from lane runners (keep / change)
| Reference idea (Subway Surfers, Temple Run, Minion Rush) | Keep | Change for us |
|---|---|---|
| Hero seen from behind, runs into the screen, world flows toward you | ✔ | pseudo-3D drawn on a 2D canvas (perspective projection of a flat path), no 3D engine |
| 3 lanes, swipe to switch, snappy lane change | ✔ | lane change ≈ 0.16 s eased spring with a lean; one queued input so quick double-swipes work |
| Swipe up jump, swipe down roll | ✔ jump / ✘ roll | only jump (2 actions are enough for 5–8-year-olds); tap zones too (left/middle/right third) |
| Instant death on first crash, chased by a guard | ✘ | 3 hearts (Easy 5), a soft stumble + blink, a chapter gives a heart back; no chaser, nothing scary |
| Coins in long lines and jump arcs | ✔ | seashells (3 kinds, same value) in rows and arcs over logs |
| Endless with rising speed | ✔ | split into 4 storybook **chapters** (distinct places), then the book loops a bit faster |
| Power-ups, shop, currencies | ✘ | cut for a one-day build |
| — | twist | **Fizz** the fennec on a flying carpet visits every 30 s and lobs pillows (shadow warning → real arc → lands as a low obstacle) |

## 2. Screen, world and projection
- Logical view `VW×VH` from `Renderer.computeView` (same as the other daily games): landscape ≥16:9 → 540 tall, up to 1280 wide; other landscape → 960 wide, up to 960 tall; portrait → 560 wide (720 when aspect ≥ 0.6), up to 1600 tall.
- **The world has no pixels.** World units ("u"): **1 u = one lane width**, seconds, height `y` grows **upward** from the path. Lanes are at `x = −1, 0, +1` (lane index = x). `s` = distance along the track (u, grows forward); `world.dist` = how far Pebble has run; an object's depth ahead of Pebble is `z = s − dist` (Pebble is at `z = 0`).
- **Projection (renderer only)**, `Renderer.project(x, y, z) → {sx, sy, k}`:
  - camera `CAM = {h: 1.9, d: 3.2}` (u above the path, u behind Pebble), `k(z) = CAM.d / (z + CAM.d)` (1 at Pebble, → 0 at the horizon), visible for `z ∈ [−1.2, 36]`.
  - `laneW0` = lane width in px at z = 0: landscape `min(0.19·VW, 0.36·VH)`, portrait `0.27·VW`; `footY` (screen y of the path at z = 0) = `VH − max(0.13·VH, 70) − insets.bottom`; `horizonY = footY − (footY − topY)·0.62`… concretely `horizonY = round(VH·(portrait ? 0.36 : 0.40))`.
  - `sx = VW/2 + (x − camX)·laneW0·k`, `sy = horizonY + (footY − horizonY)·k − y·laneW0·k`; `camX = 0.35·hero.x` (the camera follows Pebble a little so lane changes feel like moving, not like sliding a sprite).
  - Sprite size for something `W` u wide: `W·laneW0·k` px. Draw far → near (sort by z descending).
- Background: sky gradient (top → horizon), `sky.svg` décor, `far.svg` horizon band whose **bottom edge sits on `horizonY`**, then the sand plain (gradient from `sandFar` at the horizon to `sandNear` at the bottom), then the path (a trapezoid `x ∈ [−1.5, 1.5]` with lane dividers drawn as scrolling pebble dashes every 2 u of `s`, edge stones every 1 u), then roadside props and objects.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search for inspiration only; never copy or trace; no known characters, brands, logos or mascots — Pebble must not look like any famous robot dog (no Astro Boy, no WALL-E/EVE look-alike, no Sony Aibo, no Bluey, no Paw Patrol), Fizz must not look like any famous fox (no Sonic's Tails, no Nick Wilde, no Swiper, no Fantastic Mr Fox), no Aladdin/Disney carpet look (plain patterned rug, our own pattern)).
Flat cartoon storybook style, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (in the viewBox units given) in a dark tone of the fill (never pure black). No `<text>`, fonts, scripts, `<image>`, external refs, filters that blur heavily (a tiny `feGaussianBlur` for a glow is OK). `width`/`height` = viewBox. Transparent background unless stated.
**Colour separation:**
- Pebble: warm cream-sand body `#f3dfb8`, shade `#d9bb86`, outline `#6b4a2b`, **teal** accents (ears tips, collar light, paw pads) `#2ec4b6`, a little **red** scarf/bandana `#ff5a5f` so he pops against the sand, dark eyes `#2b2440` with white shines.
- Seashells (index 0..2): **0 scallop, pink `#ff8fb1`**; **1 spiral conch, peach-orange `#ffb067`**; **2 cowrie/clam, lilac `#b9a3ff`**; each with a white highlight and darker same-hue outline, **pearly and bright** — they must be the brightest small things on the path.
- Obstacles are **solid, darker and warmer** than the path: terracotta pots `#c8643b` / `#9e4a2a`, palm logs `#8a5a3a`, tumbleweed `#a7844f` with darker twigs. Pillows are soft white/cream `#fff6e8` with a pastel stripe/tassels (lavender `#c9b6ff` or mint `#a8e6cf`) — friendly, but solid enough to read as "jump or dodge".
- Fizz: pale ginger `#f2a65a`, cream muzzle `#fff1dc`, huge ears with pink insides `#ffb3c1`, carpet in deep teal `#1f7a8c` + saffron `#ffc145` pattern + tassels.
- Backgrounds: sky and far scenery **softer and less saturated** than characters and shells; the path is a light sand `#f1d9a6`-ish (chapter-tinted), never the shell colours; props at the roadside can be richer but stay outside the path.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `pebble_0..3.svg` | 0 0 128 128 | `1.0·laneW0·k` wide square at z = 0 | Pebble seen **from behind, slightly from above (¾ back view)**, running into the screen: round head with two floppy-but-mechanical ears (rounded panels with a rivet), a small antenna with a teal bulb, a round body/back with a little hatch panel and the red scarf knot, a springy coil tail, four stubby legs with rounded paws. **Feet line y = 120, body centre (64, 72), body width ≈ 80.** Frames 0–3 = run cycle (legs + tail + ears bounce); head/body outline identical except a ±2 px vertical bob baked into frames 1 and 3. |
| `pebble_jump.svg` | same | same | legs tucked, ears up, tail straight up — same head/body geometry. |
| `pebble_ouch.svg` | same | same | head turned slightly so one squeezed eye (> <) shows over the shoulder, ears flopped, a tiny star; same body geometry. |
| `pebble_happy.svg` | same | same | looking back over the shoulder with a big ^^ smile, one paw waving; same body geometry. |
| `shell_0..2.svg` | 0 0 64 64 | `0.42·laneW0·k` | the three shells (§3), standing upright facing the camera, centred (32, 34), fitting r 26. |
| `pots.svg` | 0 0 128 160 | `0.86·laneW0·k` wide | tall obstacle: a wobbly stack of 2–3 round terracotta pots (a lid on top, a painted band), slightly cartoon-tilted. **Base line y = 154, centre x 64.** Reads clearly as "go around". |
| `log.svg` | 0 0 160 80 | `0.95·laneW0·k` wide | low obstacle: a fallen palm log lying across the lane, seen from the front, ring end visible on one side, a couple of fronds sticking up. **Base line y = 74.** Height ≈ 0.4 u. |
| `tumble.svg` | 0 0 96 96 | `0.62·laneW0·k` | a round tumbleweed ball of curly twigs (rotatable), centre (48, 48), r 42. |
| `pillow.svg` | 0 0 128 96 | `0.80·laneW0·k` wide | a plump square cushion seen from the front, corners puffy, four tassels, a pastel stripe; centre (64, 50), **base line y = 88** when resting. Rotatable in flight. |
| `fizz_0.svg`, `fizz_1.svg` | 0 0 192 160 | `1.5·laneW0·k` wide | Fizz the fennec sitting cross-legged on a small flying carpet, facing the camera (he flies ahead of Pebble looking back at him), cheeky grin, huge ears. Frames 0/1 = carpet ripple + tassels swing; fox geometry identical. **Carpet centre (96, 130).** |
| `fizz_throw.svg` | same | same | both paws up over his head holding a pillow-sized empty space (the renderer draws the pillow), mouth "o". |
| `fizz_hmph.svg` | same | same | arms crossed, eyes closed, nose up, puffed cheeks (grumpy-cute). |
| `heart.svg`, `heart_empty.svg` | 0 0 48 48 | 28 (HUD) | lives: a plump heart in coral `#ff6b6b` with highlight and a tiny bolt rivet; empty = outline only, sand-grey at 50 %. |
| `book.svg` | 0 0 96 96 | 44 (HUD) | an open storybook (chapter progress icon), cream pages, teal cover. |
| `icon.svg` | 0 0 256 256 | app icon | Pebble's head (front ¾ this time, big eyes, scarf) with a pink scallop shell, on a round badge: oasis palm + sun + dunes. Readable at 32 px. |

### 4.2 Chapters (environment artist) — `levels/<ch>/`, ch ∈ `grove`, `dunes`, `bazaar`, `night`
| File | viewBox | Placement | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 540 | top-anchored (`y = 0`), width `max(VW, 960)` | **transparent** except sky décor: grove — soft morning sun, a few round clouds, birds; dunes — high white sun with rays, thin wispy clouds; bazaar — big low orange sun, pink streaky clouds, kites; night — large moon, stars, a soft milky way band. Keep the bottom 120 px empty (the horizon band covers it). Drifts slowly (tileable horizontally: left edge = right edge). |
| `far.svg` | 0 0 960 300 | **bottom edge on `horizonY`**, tiled horizontally (seamless), parallax `−camX·18 px` | horizon band, transparent above ≈ y 60, low contrast, tinted to the chapter: grove — palm skyline + the oasis pond glinting + a mud-brick house; dunes — layered golden dunes; bazaar — tent tops, a domed tower, string lights; night — dark blue dunes + palm silhouettes + moon reflection on water + a few warm windows. The last 20 px (y 280–300) are an opaque soft band in the chapter's `sandFar` colour so it blends into the plain. |
| `prop_0..3.svg` | 0 0 160 220 | roadside, `x = ±(1.9 … 3.6)` u, drawn `propW·laneW0·k` wide, **base line y = 214, centre x 80** | 4 props per chapter: grove — tall palm, short double palm, reed clump + flowers, a small stone well; dunes — rock arch, sand rock pile, dry bush, a camel-shaped dune rock? (no animals) — a clay milestone; bazaar — striped tent, lantern post, stack of rugs, a fruit cart; night — palm (dark), glowing lantern post, small tent with lit door, a reed clump with fireflies. |
| `palette.json` | — | — | `{ grove: {skyTop, skyBottom, sandFar, sandNear, path, pathEdge, divider, vig}, dunes: …, bazaar: …, night: … }` hex colours the renderer uses for gradients and the path. |

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`dust` (soft sand puff), `sand` (tiny sand grain streak, viewBox 0 0 16 8), `sparkle` (4-point star, white), `butterfly` (small pastel butterfly, wings open), `petal` (pink petal), `leaf` (small green palm leaflet), `firefly` (warm yellow-green glow dot), `star` (tiny 5-point, white-yellow), `feather` (small white pillow feather), `puff` (soft round white cloud puff), `ring` (thin white circle, for shell pickups).

### 4.4 Chapter constants (renderer `ZONE_INFO`, colours from `palette.json`)
| zone | dir | name | banner | hint |
|---|---|---|---|---|
| 0 | grove | The Palm Grove | "Chapter 1: The Palm Grove" | "Swipe to change lanes!" |
| 1 | dunes | The Singing Dunes | "Chapter 2: The Singing Dunes" | "Swipe up to jump over logs!" |
| 2 | bazaar | The Lantern Bazaar | "Chapter 3: The Lantern Bazaar" | "Tumbleweeds roll across — watch out!" |
| 3 | night | The Starry Oasis | "Chapter 4: The Starry Oasis" | "Almost home, Pebble!" |

## 5. Code architecture (`game/js/`, classic scripts on `window.PO`)
`rng.js` (given), `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js` (integrator).

### 5.1 `PO.World` (headless, deterministic for seed + inputs, fixed sub-steps 1/120 s)
- `new PO.World(opts)` calls `reset(opts)`; `reset({seed, difficulty:'easy'|'normal'|'hard', level:0})`. `PO.World.CONFIG` exported. No layout / pixels (`setLayout` exists as a no-op for the shared main.js).
- **Input:** `move(dir)` (dir −1 or +1): change the target lane by one (clamped to −1..1); if a lane change is still in progress (|x − lane| > 0.35) the input is **queued** (one slot) and applied when it finishes. `jump()`: jumps if on the ground, otherwise buffers for `CONFIG.jumpBuffer` (0.15 s) and fires on landing. `setLane(i)` test hook (instant).
- `update(dt)` accumulates and runs fixed steps of `CONFIG.step` (1/120). Every moving thing stores `prevX/prevY/prevZ` (hero: `prevX, prevY, prevRun`; boss: `prevX, prevY, prevZ`; objects: `prevX, prevY, prevZ, prevRot`) at the start of each step; `world.alpha` = leftover fraction for the renderer's lerp. `drainEvents()` → array, then cleared.
- `gotoLevel(i)` (emits `levelUp`), `getState()` → plain summary for tests; `spawn(kind, lane, zAhead, opts)` test hook (adds an object at `s = dist + zAhead`); `summonBoss()` test hook.
- **State:** `time, phase ('play'|'over'), level (chapter, 0-based, endless), zone (= level % 4), loop (= ⌊level/4⌋), dist, levelDist (run in this chapter), goal (u per chapter), progress (0..1), speed (u/s now), score, shells, hearts, maxHearts, difficulty, combo (shells in a row without missing one of a row), maxCombo,`
  `hero {lane (target −1..1), x, prevX, vx, y, prevY, vy, onGround, tilt (rad, lean from vx, + = right), squash (0..1, decays; set on land/hit), stretch (0..1 on takeoff), mood ('run'|'jump'|'ouch'|'happy'), moodT, invuln (s), stumbleT (s), run (leg-cycle phase, grows with distance: frames = ⌊run·4⌋ % 4), prevRun}`,
  `objects[] {id, kind:'pots'|'log'|'tumble'|'pillow'|'shell', s, z, prevZ, x, prevX, y, prevY, vx, vy, rot, prevRot, h (top height u), w (half-width u, for lane overlap), d (half-depth u), variant (shell 0..2, pots 0..1), state:'live'|'fly'|'hit'|'taken'|'gone', t, landX, landS (pillow target while flying)}`,
  `boss {state:'away'|'enter'|'hover'|'leave', t, x, prevX, y, prevY, z, prevZ, mood ('grin'|'throw'|'hmph'), moodT, nextT (s until next visit), toThrow, thrown, hits (pillow hits this visit), visits}`,
  `stats {shells, jumps, lanes, bumps, pillowsDodged, pillowHits, bossVisits, bossPerfect, levels, dist, time}`.
- **Events:** `{type:'shell', o, x, y, z, variant, points, combo}`, `{type:'jump'}`, `{type:'land', hard}`, `{type:'lane', from, to}`, `{type:'bump', o, kind}`, `{type:'heartLost', hearts}`, `{type:'heartGain', hearts}`, `{type:'combo', combo}` (at 10, 20, 30…), `{type:'bossEnter'}`, `{type:'throw', o}`, `{type:'pillowLand', o}`, `{type:'bossLeave', perfect, bonus}`, `{type:'levelUp', level, zone, bonus}`, `{type:'gameOver'}`, `{type:'tumbleBounce', o}`.
- **Rules:**
  - **Running:** `speed` eases toward `target = CONFIG.difficulty[d].speed · (1 + 0.06·zone + 0.1·loop) · (stumbleT > 0 ? 0.55 : 1)`, plus a gentle ramp inside a chapter (+8 % by its end); capped at `CONFIG.maxSpeed`. `dist += speed·dt`. `hero.run += speed·dt / CONFIG.stride` (stride ≈ 1.1 u per full 4-frame cycle).
  - **Lane change:** critically-damped-ish spring toward `lane` (ω ≈ 26 rad/s, ζ ≈ 0.85 → arrives in ≈ 0.16 s, a hint of overshoot ≤ 0.04 u); `tilt` eases toward `clamp(vx/8, −1, 1)·0.3`. Event `lane`.
  - **Jump:** `vy = CONFIG.jumpV` (≈ 6.2 u/s), gravity `CONFIG.g` (≈ 19 u/s²) → apex ≈ 1.0 u, airtime ≈ 0.65 s; landing sets `squash`, event `land`. Lane changes are allowed in the air.
  - **Collisions** (each step, objects with `|z| < d + 0.25`, `|x − hero.x| < w + 0.28`): `shell` → taken if `|y − hero.y − 0.35| < 0.6`; obstacles hit if `hero.y < h − 0.05` (pots: h = 1.6, never jumpable; log: h = 0.42; tumble: h = 0.55; resting pillow: h = 0.45) and `invuln = 0` → `bump`: heart lost, `stumbleT = 0.6`, `invuln = 1.6`, mood 'ouch', object state 'hit' (pots wobble and are passed through; logs/pillows get knocked aside with a little velocity; renderer animates). A flying pillow can also land **on** Pebble (hit at landing if lanes overlap) — counts as a pillow hit.
  - **Shells:** score `+10`, combo +1 (a shell missed from a row it was in resets combo), event `shell`.
  - **Spawning** (deterministic, `rng.fork('track')`): the track is generated in **rows** ahead of Pebble whenever the last row's `s < dist + CONFIG.spawnAhead` (34 u). Row spacing `gap ≥ speed·react[d] + 2.5` u. A row is one of the patterns allowed by the zone (`CONFIG.zones[z].patterns`): `pots1` (one lane blocked), `pots2` (two lanes blocked, never three), `log1`, `log3` (all lanes, must jump — not in zone 0, not on Easy before zone 2), `tumble` (rolls across lanes at 1.2–1.8 u/s, bounces off the path edges once, event `tumbleBounce`), `shellLine` (5–8 shells in one lane, spacing 1.2 u), `shellArc` (6 shells in a jump arc over a log), `shellZig` (shells switching lanes). There is always at least one lane free of tall obstacles, and a free lane is reachable (no "switch two lanes in less than 0.5 s" requirements on Easy/Normal). Zone 0 = pots + shells only.
  - **Boss (the twist):** `nextT` counts down from `CONFIG.bossEvery` (30 s; the first visit after 30 s of play). Then `enter` (1.2 s, flies in from above/behind the horizon to `z ≈ 11`, `y ≈ 2.4`), `hover` (throws `CONFIG.difficulty[d].pillows` pillows, one every `pillowEvery` s, sways across lanes with a sine `x = 1.1·sin(t·0.9)`), then `leave` (1.0 s, flies up and away) and `nextT = bossEvery`. While the boss is here, no new `pots2`/`log3` rows are generated (only light rows) so pillows are the main challenge.
    - **Throw:** target lane = Pebble's current lane (Easy: 50 % a random lane), landing depth `zLand` (Easy 7.5, Normal 6.5, Hard 5.8 u ahead at landing time), flight time `T` (Easy 1.3, Normal 1.1, Hard 0.95 s). Landing spot `landS = dist + speed·T + zLand`, `landX` = lane. In flight: `s` lerps from the boss's `s` to `landS`, `x` lerps from the boss x to `landX` (ease-out), `y(t) = h0 + vy0·t − ½·g·t²` with `vy0 = (½·g·T² − h0)/T` (a real arc, `g = CONFIG.g`), `rot` spins (≈ 1.5 turns per throw). On landing: state 'live' (resting low obstacle, small bounce + squash animated by the renderer), event `pillowLand`. Dodged = passed `z < −1` without a hit → `stats.pillowsDodged++`.
    - **Leave:** `perfect = hits === 0` → `bonus = 50·(level+1)` added to score, mood 'hmph'; event `bossLeave`.
  - **Chapters:** `goal = CONFIG.goal[d] · (1 + 0.1·loop)` u. When `levelDist ≥ goal` → `levelUp`: bonus `100·(zone+1)·(loop+1)`, +1 heart (up to max; `heartGain`), `level++`, `levelDist = 0`, mood 'happy' 1.2 s. Objects already spawned stay. Aim for 60–80 s per chapter for a casual player.
  - **Lose:** hearts reach 0 → phase `over`, `gameOver`; the world keeps running slowly to a stop (speed eases to 0 over ~1 s) so the end isn't a freeze.
  - The first chapter must be easy for a 6-year-old: Easy speed ≈ 5.5 u/s, wide gaps, only pots and shells, 5 hearts, pillows aimed half the time at a random lane, long shadow warning.
- **CONFIG** (units and why, at the top of `world.js`): `step, stride, laneOmega, laneZeta, jumpV, g, jumpBuffer, spawnAhead, maxSpeed, bossEvery, bossEnterT, bossLeaveT, goal {easy, normal, hard}, difficulty {easy|normal|hard: {hearts, speed, react, pillows, pillowEvery, zLand, flightT, aimRandom}}, zones [{patterns: {name: weight}, gapK}]`.

### 5.2 `PO.Weather` (screen space) — `new PO.Weather({width, height, seed})`, `setLevel(zone, {instant})`, `setHorizon(horizonY)`, `resize(w, h)`, `update(dt, speed)` (speed u/s: drifting things stream toward the camera faster when running fast), `burst(sprite, x, y, n, opts)`, `particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front'}`, `ambient {tint (css rgba or null), shimmer (0..1 heat shimmer strength)}`. Grove: fluttering `butterfly`s (sinusoidal flap path, flipX by direction) + falling `leaf` (pendulum). Dunes: blowing `sand` streaks low over the plain + `shimmer 0.5`. Bazaar: drifting `petal`s (tumble) + a few `sparkle`s near lanterns height. Night: `firefly`s (slow wander, pulsing alpha) + twinkling `star`s above the horizon (`y < horizonY`). Back-layer particles live mostly above the horizon or at the sides; front-layer particles are small, sparse, pale, never in the centre lane band near Pebble, and never look like shells. Bounded counts (< 160). Burst opts `{speed, life, size, gravity, spread, up, spin, layer, drag}` (used by the renderer for dust at Pebble's feet, feathers when a pillow lands, sparkles for shells).

### 5.3 `PO.Bot` — `new PO.Bot(world, {skill, seed})`, `bot.step(dt)`: every ~0.1 s scans the next ~(speed·2.2) u of track per lane: danger (obstacle ahead whose height Pebble can't clear, resting pillow, pillow landing spot with its landing time), shells (value). Picks the best lane (prefer the current lane, then the nearest safe lane; cost for each lane change), calls `world.move()`; jumps when a low obstacle (log/tumble/pillow) is in the chosen lane within `speed·0.28 + 0.6` u, or to grab an arc of shells. Skill: reaction delay `(1 − skill)·0.35 s`, a chance of `(1 − skill)·0.15` per decision of not noticing a danger, look-ahead shrinks with low skill. skill 1 ≈ never hit; 0.5 ≈ casual player. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.PO.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), move(dir), jump(), summonBoss() }`. Test flags are never saved to settings.

## 6. Customisation slots
`hero` (Pebble: a custom picture drawn as a round sticker that bobs with the run cycle, leans with lane changes, squashes on landing, with a little shadow), `shell` (a custom picture drawn round inside a pearly ring, three tints for the three variants), `bg_grove`, `bg_dunes`, `bg_bazaar`, `bg_night` (a full-scene photo replaces the sky gradient + sky + far above the horizon; the sand plain and the path stay).

## 7. Audio (WebAudio, synthesized)
SFX: lane "zip" (short filtered swish, pitch by direction), jump "boing" (spring), land "thup" (soft), shell "tink" (bell, pentatonic step up with the combo), combo chime, bump "bonk-boing" (soft), pillow land "fwump" (filtered noise thud), throw "whoosh", boss enter (a carpet whoosh + a giggle-like rising chirp), boss leave "hmph" (two-note down) / perfect bonus fanfare, heart lost, heart gain, chapter "page turn" (paper swish noise + chime), game over (gentle tune), best score, button click. Music: a soft loop per chapter over a hand-drum pattern (dum-tek), pentatonic/oud-like plucks: grove gentle (88 bpm), dunes bright (100), bazaar bouncy (108), night lullaby bells (84); crossfade on chapter change; tempo up a little each loop. Unlock on the first gesture.

## 8. Mobile (iPhone / iPad) — same platform layer as the other daily games
- Pointer Events on the stage (not on UI): a swipe (≥ 24 css px within 350 ms; dominant axis) → move/jump on the **move**, as soon as the threshold is crossed (not on release), so it feels instant; a tap (< 24 px) → left third / right third = move, middle third = jump. UI buttons fire on click; the ghost click is swallowed.
- iOS: audio unlock in the first `touchend`; `visibilitychange` pauses and suspends audio; kid-proofing (no zoom, no rubber-band, no callouts, no text selection, `touch-action: none` on the stage).
- Home screen: `manifest.webmanifest` plus 180/192/512 PNG icons from `tools/render_mobile_icons.js`.

## 9. Changes after build and QA (2026-11-07)
- Mechanics (from the engineer): Fizz's timer restarts when he **enters** (visits at 30, 60, 90 s, ≥ 12 s after he left); he leaves 0.5 s after the last pillow has passed; pillows turn exactly once in flight and keep clear of pots / other low obstacles; a swipe opposite to a lane change in progress reverses at once. Extra fields: `endS` (chapter arch), hero `queued/buffer/airT`, boss `windup/tilt/perfect`, objects `vs/spin/squash/airborne`, pillow `T/p/s0/x0/h0/vy0/visit/done`.
- Playtest: Easy `pillows 3 → 2`, `aimRandom 0.5 → 0.7`. `bossEvery` stays 30 s (the twist).
- Renderer: `WIDTH.fizz 2.6`, pillow landing shadow r 0.55 u with a white + dark pulsing ring, white halo behind shells, sky décor clipped above `horizonY`, haze fades to `sandFar`, props at `x = ±(1.7 + 0.45·propW + 0–1.2)`, props past `endS` already show the next chapter, Fizz banner under the HUD pills in landscape.
- Input: swipe window 350 ms; a hold > 450 ms is not a tap.
