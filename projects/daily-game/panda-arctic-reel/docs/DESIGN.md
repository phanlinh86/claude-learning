# Bao's Arctic Reel — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.PR`. Storage prefix `par:`. Exe `BaosArcticReel.exe`, port 47619.
Fantasy in one sentence: **it must FEEL like real ice fishing — the hook sinks with weight, floats back with buoyancy, and every good reel tap gives a satisfying tug.**

## 1. Lessons from fishing games (keep / change)
| Reference idea | Keep | Change for us |
|---|---|---|
| One-input fishing (hold to drop the hook, release to rise) | ✔ hold = sink, release = float up | hook only moves vertically at a fixed x (the hole) |
| Fish swim across at different depths, deeper = worth more | ✔ depth bands with gem value | gems drift inside air bubbles; fish are decoration |
| Timing reel meter (needle + sweet zone) | ✔ swinging needle, green zone, gold Perfect centre | the zone jumps to a new spot after every tap, so it can't be memorised |
| Hazard that cuts the line | ✔ pufferfish | puffers are cute; they puff up and drift away, the line goes "boing" |
| Rare golden fish | ✔ golden gem = 50 (5× amethyst) | faster, glitters, needle a bit quicker when reeling it |
| Long tutorials | ✘ | first zone teaches itself: slow drift, no puffers in the first 10 s, big green zone |

## 2. Screen & coordinates
- Logical size: landscape 16:9 → **960×540** (width up to 1280 at 540 tall on wider screens); other landscape → 960 wide, height up to 960; portrait → 560 wide (720 when aspect ≥ 0.6), height up to 1600. All world code uses `W`,`H` passed to `reset`; nothing hard-codes 960.
- Units: px (logical), seconds. y grows downward.
- Vertical layout (all in logical px):
  - `SURFACE_Y = 150` — top of the snow on the ice (Bao's seat line).
  - ice slab 150 → 190, icicles may hang to ~205. `WATER_TOP = 190` (just under the ice).
  - `FLOOR_Y = H - 34` — seabed line.
  - Hole: centred at `holeX = round(W/2)`, 64 px wide gap in the ice slab (render clips the ice).
  - Hook range: `minHookY = WATER_TOP + 14`, `maxHookY = FLOOR_Y - 22`.
  - Depth bands (fractions of `minHookY..maxHookY`): shallow 0–0.36 (amethyst), middle 0.36–0.68 (emerald), deep 0.68–1 (ruby). Golden gems may appear in any band.
- Bao sits on the ice left of the hole: sprite placed so his **rod tip** lands at about `(holeX - 4, 70)`.
- Play band to keep calm (no busy art, no overlays): the column `holeX ± 140` and everything between `WATER_TOP` and `FLOOR_Y`. HUD lives in the top-left/top-right corners of the sky; the reel meter sits to the right of the hook (`hookX + 120`), mirrored to the left in portrait if it would leave the screen.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search is for inspiration; never copy or trace; no known characters, brands or mascots — Bao must not look like any famous cartoon panda). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (in the viewBox units given) in a dark tone of the fill (never pure black; Bao's "black" fur is very dark blue-grey `#2b2f3a`-ish with outline `#1c1f28`). Saturated but soft palette, kid-friendly: nothing scary. No `<text>`, fonts, scripts, `<image>`, external refs. `width`/`height` = viewBox. Transparent background unless stated.
**View:** side view, slightly from the front (like a stage). Bao faces **right** (towards the hole). Swimmers face **right**; the renderer flips them for leftward motion.
**Colour separation:** water is blue/teal/navy → gems are **purple, green, red, gold** with a light rim; puffers are **orange/yellow**; Bao is black/white with a **red scarf**. Backgrounds must avoid saturated purple/red/orange/gold in the play band.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `bao_idle.svg`, `bao_reel.svg`, `bao_happy.svg`, `bao_oops.svg` | 0 0 160 160 | 128 × 128 | Bao the panda sitting on a little upturned bucket-stool, side 3/4 view facing right, red knitted scarf (ends flutter back-left), tiny red bobble hat or ear-muffs, big shiny eyes in the eye patches, blush. Holds a short wooden ice-fishing rod (with a little reel) angled up-right. **Seat/feet line y = 150** (placed on `SURFACE_Y`). **Body centre (68, 96)**. **Rod tip: idle (150, 22)**; reel: rod raised/bent, tip ≈ (146, 14), paw turning the reel crank; happy: rod tip same as idle, other paw up, ^^ eyes, open smile; oops: eyes squeezed / surprised "o" mouth, ears up, rod tip same as idle. Body geometry identical across frames (only face, arms, rod angle change). Report the exact rod tip of each frame. |
| `bucket.svg` | 0 0 64 64 | 44 × 44 | small blue-grey metal pail with a handle, a few gems peeking out (purple/green/red). Bottom centre (32, 62) sits on `SURFACE_Y`, drawn left of Bao. |
| `hook.svg` | 0 0 32 48 | 24 × 36 | small red-and-white bobber/weight on top (y 2–16) + silver hook below. **Line attach (16, 2)**. Hit centre (16, 32). |
| `gem_amethyst.svg`, `gem_emerald.svg`, `gem_ruby.svg`, `gem_gold.svg` | 0 0 64 64 | 40 × 40 (gold 44) | faceted cartoon gems, different cuts (amethyst = round brilliant, emerald = rectangle/step cut, ruby = heart or pear, gold = big star-cut with sparkle). Light rim + highlight so they read on dark water. Centre (32, 32). |
| `bubble.svg` | 0 0 96 96 | 62 × 62 | transparent air bubble that wraps a gem: thin pale-cyan rim, glossy crescent highlight top-left, very light fill (alpha ≤ 0.18). Centre (48, 48). |
| `puffer.svg`, `puffer_puffed.svg` | 0 0 96 80 / 0 0 96 96 | 64 × 53 / 80 × 80 | grumpy-cute pufferfish facing right, orange-yellow with soft spots, pouty mouth, little fins. puffed = round ball, soft rounded spikes, cheeks puffed, eyes squeezed (funny, not scary). Centre (48, 40) / (48, 48). |
| `fish_a.svg`, `fish_b.svg` | 0 0 80 48 | 50 × 30 | decorative friendly fish facing right: a (silver-blue arctic char style with pink belly), b (small striped teal/white). Centre (40, 24). Tail on the left — the renderer wiggles them. |
| `spool.svg` | 0 0 64 64 | 34 | HUD icon: wooden spool with red fishing line (a "life"). |
| `icon.svg` | 0 0 256 256 | app icon | Bao's face with the red hat/scarf peeking over the ice hole holding up a sparkling purple gem, on a round icy-blue badge; readable at 32 px. |

### 4.2 Arctic scenes (environment artist) — `levels/<zone>/` with zone ∈ `shallows`, `kelp`, `twilight`, `aurora`
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 200 | y 0–200, tiles horizontally, drift 5 px/s | **opaque** sky gradient + clouds / sun / stars / aurora. Horizontally tileable (left and right edges match). Shallows: bright morning blue with soft clouds; kelp: golden afternoon; twilight: pink-purple dusk with first stars; aurora: deep night, stars, green-teal aurora ribbons. |
| `far.svg` | 0 0 960 200 | y 0–200, tiles, drift 2 px/s | transparent; distant icebergs / snowy hills / ice cliffs along the horizon, bottom at y ≈ 165 (hidden behind the ice). Tileable. A tiny far-off igloo or seal family welcome. |
| `ice.svg` | 0 0 960 80 | drawn at y 140–220 (svg y 10 = `SURFACE_Y`) | tileable ice shelf: snowy top edge at svg y 10, snow lumps, blue-white ice slab to y ≈ 50 with cracks/shine, a few rounded icicles hanging to y ≈ 65; transparent above y 4 and below icicles. Render cuts a 64 px gap at `holeX`. |
| `water.svg` | 0 0 960 400 | stretched once to `W × (H − 170)` from y 170 | **opaque** water gradient (lighter at top), soft diagonal light rays from the top (shallows/kelp only), no sharp details (it is stretched). |
| `reef.svg` | 0 0 960 320 | anchored so its bottom = `H`, tiles, drift 3 px/s | transparent; seabed (sand/pebbles) in the bottom 40 px (top of seabed ≈ svg y 286 = `FLOOR_Y`), plus rocks, sea stars, anemones, kelp (kelp zone: tall kelp at the far left/right). **Keep x 340–620 low and calm** (≤ 60 px tall there). |
| `thumb.png` not needed. | | | |
Also: `hole_rim.svg` (0 0 96 80, drawn 96×80 centred on `holeX`, svg y 10 = `SURFACE_Y`): the two snowy, rounded edges of the cut in the ice (left and right walls), transparent between them (shared by all zones).
Palette per zone (water top → bottom): shallows `#7fd6e8 → #2d8fb8`; kelp `#5cc2b0 → #1f6f78`; twilight `#3c6fb0 → #182f63`; aurora `#1d3a6b → #0a1530`.

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`snowflake`, `bubble_s` (tiny bubble), `kelp_bit` (small green leaf), `plankton` (soft glowing dot, cyan), `jelly` (tiny cute jellyfish, pink-lilac glow), `sparkle` (4-point star), `drop` (water droplet), `star` (5-point star for catch bursts), `puff` (soft round white puff).

## 5. Code architecture (`game/js/`, classic scripts on `window.PR`)
`rng.js`, `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js` (integrator).

### 5.1 `PR.World` (headless, deterministic for seed + inputs, fixed sub-steps ≤ 1/120 s)
- `new PR.World()`; `reset({seed, difficulty:'easy'|'normal'|'hard', width, height, level:0})`.
- Input: `press()` (input went down), `release()` (input went up). In `roam` press starts sinking (held until release). In `reel` press is a reel tap. After a reel ends (catch or escape) `holding` is cleared, so the player must press again to sink.
- `update(dt)` — accumulates and runs fixed steps of `CONFIG.step` (1/120). Every moving object stores `prevX/prevY` at the start of a step; the renderer lerps with `world.alpha` (leftover fraction 0..1).
- `drainEvents()` → array, then cleared.
- `setLayout(width,height)` — on resize; keeps hook/items within the new bounds.
- State: `time, phase ('roam'|'reel'|'snap'|'over')`, `level` (0-based, endless), `zone` (= level % 4), `loop` (= ⌊level/4⌋), `score, best?` (no: best lives in main), `lines, maxLines (3)`, `gemsInZone, gemsNeeded, totalGems, perfects, difficulty`, `layout {width, height, surfaceY, waterTop, floorY, holeX, minHookY, maxHookY, bands:[y0,y1,y2,y3]}`, `hook {x, y, prevY, vy, holding, tilt}`, `items[] {id, kind:'gem'|'puffer'|'fish', type ('amethyst'|'emerald'|'ruby'|'gold' | 'a'|'b' | 'puffer'), x, y, prevX, prevY, vx, r (hit radius), phase, state ('swim'|'hooked'|'escape'|'caught'|'puffed'), t}`, `reel {active, itemId, needle (0..1), dir, speed (needle sweeps/s), zone (centre 0..1), width, perfect (width), stepPx, slips, maxSlips, tug (0..1 anim)}`, `bao {anim:'idle'|'reel'|'happy'|'oops', t}`, `invuln` (s), `stats {casts, hooks, catches, escapes, snaps, perfect, good, slip, byType:{…}}`.
- Events: `{type:'hook', item}`, `{type:'reelGood', perfect, y}`, `{type:'reelSlip', slips}`, `{type:'escape', item}`, `{type:'catch', item, points, x, y}`, `{type:'snap', x, y}`, `{type:'puff', item}`, `{type:'lineBack'}`, `{type:'levelUp', level, zone}`, `{type:'golden', item}` (spawned), `{type:'gameOver'}`, `{type:'sinkStart'}`, `{type:'splash', x, y}` (hook passes the surface).
- Rules: points amethyst 10, emerald 20, ruby 30, gold 50; +5 per Perfect tap. Steps to the surface = `ceil((hookY − waterTop) / stepPx)`; Good = 1 step, Perfect = 2. Slip = gem drops ½ step; `maxSlips` 3 → escape. Puffer touch in roam (not during `invuln`) → snap: lines −1, puffer puffs and drifts away, hook resets to the top after 1.0 s, `invuln` 1.5 s. Lines 0 → `phase 'over'` + `gameOver`. Zone cleared (`gemsInZone ≥ gemsNeeded`) → `levelUp`, +1 line (max 3), clear puffers gently (they swim off). No puffer spawns in the first 10 s of zone 0. CONFIG (with units and why) at the top of `world.js`, per-difficulty presets in `CONFIG.difficulty`.

### 5.2 `PR.Weather` — `new PR.Weather({width,height,seed})`, `setLevel(zone,{instant})`, `resize(w,h)`, `update(dt, {hookX, hookY, surfaceY, waterTop})`, `burst(sprite,x,y,n,opts)`, `particles[] {sprite,x,y,size,rot,flipX,alpha,layer:'sky'|'back'|'front',glow?}`, `ambient {tint (css rgba overlay or null), glow (0..1 gem glow), aurora (0..1)}`. Sky (above `surfaceY`): snowflakes with depth layers (size/speed/alpha by depth) and sideways sway; aurora zone fewer snowflakes + twinkling sparkles. Water (below `waterTop`): bubbles rising with wobble, popping at the surface; kelp zone kelp bits tumbling down (pendulum); twilight plankton motes drifting slowly with glow; aurora 3–5 glowing jellyfish pulsing up (back layer). Hook trail: a few small bubbles from the hook while it moves. Bounded particle counts (< 160). Works for any canvas size (portrait up to 720×1600).

### 5.3 `PR.Bot` — `new PR.Bot(world, {skill, seed})`, `bot.step(dt)`: in roam steers the hook (press/release) to the y of the best reachable gem (value / time-to-reach), avoids puffers' paths; in reel taps when the needle enters the zone with a reaction delay + Gaussian error that grow as skill drops (skill 1 = almost always Perfect). `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.PR.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), press(), release(), spawnGold() }`. Test flags are never saved to settings.

## 6. Customisation slots
`hero` (Bao), `gem` (replaces all four gem pictures; gems keep a coloured glow ring so values stay readable), `puffer`, `bg_shallows`, `bg_kelp`, `bg_twilight`, `bg_aurora` (a full-scene photo replaces sky+far+water+reef for that zone; ice and hole stay). Custom characters get procedural motion (bob, squash on catch, wobble).

## 7. Audio (WebAudio, synthesized)
SFX: sink (soft descending blip loop while holding), splash, hook "plink", reel ratchet click per good tap (higher on Perfect + chime), slip "wob", escape "bloop", catch sparkle arpeggio (golden = longer, brighter), snap "boing", puff "pff", level-up fanfare, game over gentle tune, button click. Music: soft music-box + pad loop per zone (shallows bright major, kelp swaying 6/8, twilight dreamy, aurora twinkly), crossfade on level change. Unlock on the first gesture (`touchend`/`pointerup`/`keydown`).

## 8. Mobile (iPhone / iPad) — same platform layer as the other daily games
- Pointer Events: hold anywhere on the stage = sink, tap = reel. UI buttons fire on touch `pointerup`; the ghost click is swallowed. Multi-touch: hold counts while any pointer is down.
- iOS: audio unlock in the first `touchend`; `visibilitychange` pauses and suspends audio; kid-proofing (no zoom, no rubber-band, no callouts, no text selection).
- Home screen: `manifest.webmanifest` plus 180/192/512 PNG icons from `tools/render_mobile_icons.js`.
