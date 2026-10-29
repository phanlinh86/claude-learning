# Family Flappy — Design Spec (v1)

A family-friendly, one-button, Flappy-Bird-style desktop game for Windows 11.
No pipes. The bird must keep flapping or it hits the ground (round over).
**Every flap drops an item.** If an item lands on a crawling turtle's shell, you score.
Every `pointsPerSeason` points the season advances Spring → Summer → Autumn → Winter → Spring…,
changing the background and the weather animation. All key images can be replaced by the player.

## 1. Lessons from Flappy Bird (what we keep / change)
| Flappy Bird | Family Flappy |
|---|---|
| One input (tap) = upward impulse, constant gravity | Same. Space / Up / W / left-click / touch = flap |
| Bird fixed horizontally, world scrolls left | Same. Bird at x≈260 of 960 |
| Bird tilts up on flap, noses down when falling | Same, smoothed |
| Pipes = hazard, gap = point | No pipes. Point = item lands on turtle shell |
| Ground = death | Same. Ceiling = soft bounce (no death, kid friendly) |
| "Get Ready" screen, bird bobbing | Same: READY state, bird hovers & bobs until first flap |
| Big centered score, medal/best on game over | Same, plus combo popups and season banner |
| Parallax ground scroll sells "flying" | Multi-layer parallax: sky, far, mid, ground + weather particles + wind streaks |

## 2. Screen & coordinates
- Logical canvas **960 × 540** (16:9), scaled to fit the window (letterboxed), rendered at devicePixelRatio.
- `groundY = 470` — top surface of the ground. Ground strip drawn from y=460 to 540 (80 px tall, top 10 px is grass lip that may overlap).
- Origin top-left, y grows downward, units = logical px, time in **seconds**.

## 3. Art style guide (shared by ALL art agents)
- Original artwork only (SVG, hand-written). Web search is for *reference/inspiration* only — never copy or trace copyrighted art (no Nintendo/Flappy Bird sprites, no brand characters).
- Flat cartoon, rounded friendly shapes, big expressive eyes, soft 1-step cel shading (one darker shade + one highlight per shape).
- Outline: `stroke-width` ≈ 3 at the stated viewBox scale, colour = a dark version of the fill (not pure black) — e.g. `#5a3a1a` for browns, `#2d4a1e` for greens. `stroke-linejoin="round"`, `stroke-linecap="round"`.
- Saturated but not neon. Kid-friendly — nothing scary, violent or gross.
- Each SVG: self-contained, no external refs, no `<text>`, no fonts, no scripts, no filters heavier than a single blur (prefer none — they are pre-rasterized but keep it simple).
- Transparent background unless stated.

## 4. Asset list & exact specs (paths relative to `game/`)
### 4.1 Characters — `assets/default/`
| File | viewBox | Drawn in game at | Notes |
|---|---|---|---|
| `bird_up.svg`, `bird_mid.svg`, `bird_down.svg` | `0 0 120 100` | 78 × 65 centred on bird.x,y | Facing RIGHT. Same body/head position in all three; only wing changes (up / level / down). Body centre ≈ (58,52). Leave margin for wing. |
| `drop.svg` | `0 0 64 64` | 32 × 32 centred | Default drop item: a shiny strawberry (turtles love strawberries). Centred, fills ~85% of box. |
| `turtle_walk1.svg`, `turtle_walk2.svg` | `0 0 200 120` | 132 × 79; feet bottom at y=120 of viewBox → sits on groundY | Facing RIGHT. Domed green shell with pattern on top, head + 4 legs; walk1/walk2 alternate leg positions. Shell top should span roughly x 40–160, y 15–70 of viewBox (that is the hit zone). |
| `turtle_happy.svg` | `0 0 200 120` | same | Eyes closed happy (^ ^), little blush, mouth open/smiling, maybe strawberry juice-free. Shown ~0.6 s after being hit. |
| `heart.svg` | `0 0 48 48` | 18–28 px | Particle burst on hit |
| `icon.svg` | `0 0 256 256` | app icon / logo | Bird's head + strawberry on a round sky-blue badge |

### 4.2 Seasons — `assets/default/seasons/<spring|summer|autumn|winter>/`
| File | viewBox | Use |
|---|---|---|
| `sky.svg` | `0 0 960 540` | Static full-screen backdrop (gradient sky, sun/clouds, opaque). Not tiled. |
| `far.svg` | `0 0 960 540` | Distant mountains/hills silhouette, transparent above. **Seamlessly tileable horizontally** (left edge == right edge). Parallax 0.12. Content mostly in y 250–480. |
| `mid.svg` | `0 0 960 540` | Nearer hills, trees, bushes, houses — season coloured. Tileable horizontally. Parallax 0.38. Content mostly y 330–480. |
| `ground.svg` | `0 0 960 80` | Ground strip, tileable horizontally, opaque. Drawn at y=460. Top 10px = grass/snow lip. Parallax 1.0 (moves with world). |
| `clouds.svg` (optional) | `0 0 960 540` | Tileable cloud band, transparent, parallax 0.06. |

Season looks:
- **Spring**: pale blue sky, cherry blossom trees (pink), fresh green hills, tulips/daisies in grass.
- **Summer**: deep blue sky, big warm sun, lush dark-green trees, sunflowers, maybe a beach/lake hint.
- **Autumn**: warm peach/orange sky, orange/red/yellow trees, haystacks, pumpkins, brown-gold grass.
- **Winter**: cool grey-blue/lavender sky, snowy mountains, snow-covered pines, cosy cottage, white ground with blue shading.

### 4.3 Weather particle sprites — `assets/default/particles/`
All transparent, centred, viewBox `0 0 32 32`:
`petal.svg` (pink cherry petal), `blossom.svg` (5-petal flower), `leaf_red.svg`, `leaf_orange.svg`, `leaf_yellow.svg`, `snowflake.svg` (6-arm crystal, white with light-blue edge), `butterfly_a.svg` (wings open), `butterfly_b.svg` (wings closed/narrow — same butterfly), `seed.svg` (dandelion fluff).

## 5. Code architecture (`game/`)
Plain classic `<script>` files (no modules, no build step) attached to a global namespace `window.FF` so `index.html` also runs straight from disk.

```
game/index.html        – canvas + DOM overlay UI
game/css/style.css
game/js/rng.js         – FF.RNG (seeded mulberry32)                 [mechanics]
game/js/world.js       – FF.CONFIG, FF.World (headless simulation)  [mechanics]
game/js/weather.js     – FF.Weather (particle simulation)           [mechanics]
game/js/bot.js         – FF.Bot autopilot for testing/attract mode  [mechanics]
game/js/assets.js      – image loading, pre-rasterizing, custom image store [integration]
game/js/render.js      – draws world + weather + parallax           [integration]
game/js/audio.js       – WebAudio synthesized SFX + music           [integration]
game/js/ui.js          – menus, settings, image picker              [integration]
game/js/main.js        – loop, input, states, test hooks            [integration]
tests/                 – node unit tests (sim) + playwright e2e
app/                   – Go WebView2 wrapper → FamilyFlappy.exe
```

### 5.1 `FF.World` contract (headless, deterministic given seed + inputs)
```js
const w = new FF.World({ seed: 1234, config: {/* optional CONFIG overrides */} });
w.reset();               // state='ready', score=0, season=0, clears entities
w.flap();                // input. In 'ready' → starts game ('playing') + flaps. In 'playing' → flap + spawn drop (subject to CONFIG.dropCooldown / maxDrops). In 'dead' → ignored.
w.update(dt);            // dt in seconds (any size; internally fixed sub-steps of ≤ 1/120 s)
w.drainEvents();         // returns & clears array of events since last drain

// readable state
w.state        // 'ready' | 'playing' | 'dead'
w.time         // seconds since reset
w.score, w.combo, w.hits, w.drops_made, w.misses
w.season       // 0 spring, 1 summer, 2 autumn, 3 winter (wraps), w.seasonIndex = total seasons passed
w.scroll       // total world distance scrolled (px) — renderer uses for parallax
w.scrollSpeed  // current px/s
w.wind         // current horizontal wind px/s (season dependent gusts; affects drops & weather)
w.width, w.height, w.groundY
w.bird   = { x, y, vy, angle /*radians, + = nose down*/, wingPhase /*0..1 cycle*/, frame /*'up'|'mid'|'down'*/, radius, alive, squash /*1 = normal, >1 stretched just after flap*/ }
w.drops  = [{ id, x, y, vx, vy, angle, spin, alive, landed /*true when on ground (fades)*/, life }]
w.turtles= [{ id, x, y /*=groundY, feet*/, dir /*+1 right, -1 left*/, speed, walkPhase /*0..1*/, frame /*'walk1'|'walk2'|'happy'*/, happyTimer, w, h /*drawn size 132×79*/, fed /*times hit*/ }]
// shell hit zone helper
w.shellBox(turtle) → { x, y, w, h }   // axis-aligned box in world coords
```
Events (`{type, ...}`):
`start`, `flap {x,y}`, `drop {x,y}`, `hit {x,y,points,combo,turtleId}`, `miss {x,y}` (drop landed on ground), `season {season, seasonIndex}`, `ceiling {x,y}`, `dead {x,y,score}`.

Rules:
- READY: bird hovers at y≈ 230 with a sine bob; ground still scrolls slowly.
- PLAYING: gravity, flap impulse (set vy, not add), terminal velocity, angle eased from velocity; wings flap fast for ~0.25 s after each flap then glide/slow flap.
- Drop: spawns just under the bird, inherits a fraction of the bird's motion: world scrolls left at `scrollSpeed`, so in world space the drop moves left relative to the bird (it keeps the bird's forward speed minus air drag) — must *feel* like a thrown/dropped object (parabola, slight spin, wind).
- Turtles spawn off-screen right, walk on the ground (their own speed ± direction) while also scrolling left with the world; despawn off-screen left. Always ≥1 turtle on screen soon after start. Hit → `happy` frame for ~0.6 s, hearts, then keep walking (can be fed again after cooldown).
- Hit test: drop centre inside shell box (with a few px forgiveness), drop must be falling (vy>0).
- Scoring: 1 point per hit; combo (consecutive hits without a miss) adds +1 bonus at combo≥3 (tunable). Misses do NOT end the game.
- Season: `season = floor(score / pointsPerSeason) % 4` → emits `season` event on change.
- Difficulty ramps with score/time: scroll speed, turtle speeds, spacing, wind gusts (autumn strongest, winter light snow wind). Must stay winnable for a 6-year-old in the first season.
- Bird hits ground → `dead`. Bird hits ceiling (y - radius < 0) → clamp, small downward bounce, `ceiling` event.

### 5.2 `FF.Weather` contract
```js
const wx = new FF.Weather({ width:960, height:540, groundY:470, seed });
wx.setSeason(i, { instant: false }); // smooth handover: old particles fade/fall out, new ones ramp in
wx.update(dt, { wind, scrollSpeed });
wx.particles // [{ sprite:'petal'|'blossom'|'leaf_red'|'leaf_orange'|'leaf_yellow'|'snowflake'|'butterfly_a'|'butterfly_b'|'seed'|'dot', x, y, size /*px*/, rot, flipX /*-1..1 for 3D tumble: renderer scales x by this*/, alpha, layer:'back'|'front', color? (for 'dot') }]
wx.ambient   // { tint:'rgba(...)' or null, sunRays:0..1, fog:0..1 } — optional overlay hints for renderer
```
Particle physics must look natural: leaves tumble & flutter (pendulum sway, rotation, flipX oscillation), petals drift and spiral, snow falls slowly with gentle sine drift (big flakes in front fall faster = depth), butterflies flutter on a wandering path flapping (alternate _a/_b by setting sprite), wind + world scroll push particles left (back layer less than front → parallax).

### 5.3 `FF.Bot`
```js
const bot = new FF.Bot(world, { skill: 0..1, seed });
bot.step(dt) // called each frame before world.update; calls world.flap() when it decides
```
Keeps the bird alive and times flaps so drops land on turtles; `skill` < 1 adds human-like errors. Used for high-speed playtests and the title-screen attract mode.

Additive fields/events, tunables and physics rationale for 5.1–5.3: see `docs/MECHANICS.md`.

### 5.4 Test hooks (main.js)
URL params: `?speed=N` (time scale, e.g. 8), `?bot=1` (autopilot), `?seed=N`, `?mute=1`.
`window.FF.debug` → `{ world, weather, getState(), setSpeed(n), flap(), startGame() }`.

### 5.5 Rendering performance contract (v1.1)
- `World._step` records previous-step positions (`world._pScroll`, `bird._px/_py/_pa`, `turtle._px/_py`, `drop._px/_py`); the renderer interpolates between the previous and current step so motion is even at any monitor refresh rate (60/75/120/144/165 Hz).
- Full-screen layers are drawn at exact device pixels (no stretching), the canvas backing store is capped at 1920×1080 device pixels, the next season and spring are pre-rasterized in idle time, and quality steps down automatically if frames stay above 22 ms (`?adaptive=0` disables). See `docs/reports/performance_report.md`.
