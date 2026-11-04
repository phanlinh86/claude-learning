# Juno's Moon Stack — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.MS`. Storage prefix `jms:`. Exe `JunosMoonStack.exe`, port 47621.
Fantasy in one sentence: **it must FEEL like dropping a heavy crate that thunks onto a wobbly, growing tower — every perfect drop is a satisfying "clunk-ding!".**

## 1. Lessons from stack games (keep / change)
| Reference idea (Tower Bloxx, "Stack", crane drop games) | Keep | Change for us |
|---|---|---|
| A swinging crane / mover above the tower, one tap to release | ✔ | Juno's hover-saucer swings with smooth sine motion (eases at the edges like a pendulum) |
| The tower sways and leans | ✔ | real centre-of-mass rule + a damped spring sway; perfect drops never add lean |
| "Stack" trims the overhang each drop | ✘ | crates are never cut: they land whole, or tip off when their centre is past the edge (easier to read for kids) |
| Instant game over on one miss | ✘ | 3 hearts (Easy 4); a miss costs one heart |
| Perfect-drop combo | ✔ | perfect snaps the crate to centre, ding pitch rises with combo |
| Endless with no goals | ✘ | each planet has a crate goal; reaching it plants a beacon flag, a rocket lands, then a new planet |

## 2. Screen, camera & coordinates
- Logical view `VW×VH` from `Renderer.computeView` (same as the other daily games): landscape ≥16:9 → 540 tall, up to 1280 wide; other landscape → 960 wide, up to 960 tall; portrait → 560 wide (720 when aspect ≥ 0.6), up to 1600 tall. The world gets `width,height` in `reset`/`setLayout`; nothing hard-codes 960.
- Units: px (logical), seconds. y grows **downward**. All world objects use **world coords**; the renderer draws at `screenY = worldY − camY` (camY ≤ 0 as the tower rises; lerped with `world.alpha`). x is the same in world and screen.
- `World.computeLayout(w, h)` (static) → `layout {width, height, portrait, unit, groundY, saucerScreenY, topLine, crateW0, crateH0, swingA, cx}`:
  - `unit = portrait ? min(w/6, h/8) : min(w/9.6, h/5.4)` (100 at 960×540, ≈93 at 560×1000).
  - `groundY = h − 140·unit/100` (world y of the planet surface = top of the ground strip). `cx = w/2`.
  - `saucerScreenY = (portrait ? 0.20 : 0.17)·h + 34` (saucer body centre on screen; leaves room for the HUD).
  - `topLine = portrait ? 0.56·h : 0.60·h` — the camera keeps the tower top at or below this screen line.
  - `crateW0 = 1.1·unit`, `crateH0 = crateW0·2/3` (before growth and difficulty scale).
  - `swingA = portrait ? 0.34·w : min(0.30·w, 3.0·unit)` (saucer swing amplitude around `cx`).
- The **base** (launch pad) sits on the ground at `cx`: width `2.4·unit`, height `0.64·unit`; its top is the first support surface.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search for inspiration only; never copy or trace; no known characters, brands or mascots — Juno must not look like any famous cartoon fox, e.g. no two-tailed fox, no Nick-Wilde style). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (in the viewBox units given) in a dark tone of the fill (never pure black). Space = cosy and friendly: soft purples, teals and warm planet colours, smiling planets allowed, nothing scary (no aliens with teeth, no explosions — a topple is a soft "boing" tumble). No `<text>`, fonts, scripts, `<image>`, external refs. `width`/`height` = viewBox. Transparent background unless stated.
**Colour separation:** crates are saturated warm/bright (coral, sunflower, sky, mint) with dark outlines; coins are gold `#ffd23f`; Juno is orange `#ff8a3d` in a white-lilac saucer with a teal glow. Backgrounds stay **darker and less saturated** (deep navy/violet skies; planet grounds muted) so crates and coins pop; the column above the base (x = cx ± 1.5·unit) must stay calm (no bright stars or props bigger than 3 px there in `far`).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `juno_idle.svg`, `juno_drop.svg`, `juno_happy.svg`, `juno_oops.svg` | 0 0 160 160 | `1.55·unit·scale` square | Juno: a little orange fox (`#ff8a3d`, cream muzzle/chest `#fff1d6`, dark-brown ear tips, big shiny eyes, rosy cheeks), sitting in a round hover-saucer seen from the front (white-lilac hull `#eae6ff`, shading `#b9b1e8`, a ring of small round rim lights in teal/yellow/pink, a clear glass dome bubble around her head and shoulders with a highlight). Her bushy tail with a white tip curls out over the rim on one side. **Body centre (80, 78). Beam emitter at (80, 140)** (a small glowing teal nozzle under the hull). Frames: idle (smile, ears up); drop (paws on a little lever, "o" mouth, emitter brighter); happy (^^ eyes, open smile, ears perked); oops (eyes squeezed, wavy mouth, sweat drop, ears down). Hull geometry identical in all frames. |
| `beam.svg` | 0 0 80 120 | stretched from emitter to crate top, width ≈ crate width | soft tractor beam: translucent teal-cyan cone, narrow at the top (x 30–50 at y 0) to wide at the bottom (x 0–80), 3 faint horizontal rings, alpha ≤ 0.45. No outline. |
| `crate_0.svg` … `crate_3.svg` | 0 0 120 80 | `crateW × crateH` (exactly fills the viewBox; drawn stretched to the crate's size) | rounded space cargo crates (corner r ≤ 8, 3 px outline inset 1.5 px so the shape fills 0..120×0..80): 0 coral `#ff6b6b` + white star sticker; 1 sunflower `#ffc93c` + moon sticker; 2 sky `#4fb8ff` + ringed-planet sticker; 3 mint `#3fd6a0` + rocket sticker. Metal edge bands top and bottom, 4 corner rivets, one-step shading, highlight on the top band. Must read as rectangles from far: the silhouette is the full box. Also **`crate_face.svg`** (optional tiny smile decal? NO — keep crates without faces). |
| `coin_0.svg`, `coin_1.svg`, `coin_2.svg` | 0 0 64 64 | `0.42·unit` | gold star-coin spinning frames, centre (32, 32): 0 = full face (gold disc `#ffd23f`, darker rim `#e0a400`, embossed 5-point star, highlight); 1 = turned ~55° (ellipse ≈ 0.6 width); 2 = nearly edge-on (≈ 0.22 width). The renderer plays 0,1,2,1(flipped). |
| `base.svg` | 0 0 240 64 | `2.4·unit × 0.64·unit` | the launch pad: a lavender metal platform with legs, a teal stripe, 3 small round lights; its flat top is the line y = 4 (the first crate sits there). |
| `flag.svg` | 0 0 64 128 | `0.6·unit × 1.2·unit` | goal beacon: thin pole from (12,124) up to (12,14), a round beacon light on top (yellow glow), a triangular pennant (teal) with a paw print. Base anchor (12, 124). |
| `rocket.svg`, `flame.svg` | 0 0 96 160 / 0 0 48 64 | `0.9·unit × 1.5·unit` / `0.45·unit × 0.6·unit` | friendly rounded rocket (white-cream body, coral nose cone and fins, 1 round window with a tiny star inside), centre (48, 80), nozzle bottom at (48, 152). flame: soft yellow-orange teardrop, top centre (24, 0). |
| `heart.svg`, `heart_empty.svg` | 0 0 48 48 | 28 (HUD) | hearts for lives: full = pink-red `#ff5c8a` with highlight; empty = outline only, lilac at 50%. |
| `icon.svg` | 0 0 256 256 | app icon | Juno's face in her saucer dome holding a coin, above a little stack of 2 crates, on a round deep-violet space badge with a few stars and a ringed planet. Readable at 32 px. |

### 4.2 Planets (environment artist) — `levels/<zone>/` with zone ∈ `moon`, `dunes`, `rings`, `comet`
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 540 | full screen height (scaled VH/540), tiles horizontally, drifts 3 px/s, fixed vertically | **opaque**. Deep space with soft nebula gradients and small stars; upper half holds the hero celestial bodies: moon = big blue-green planet (like a friendly home world, NOT Earth's real continents) + small sun glow; dunes = two small moons and a warm sunset glow; rings = a huge ringed gas giant (peach/teal bands) filling the upper right; comet = a violet nebula with a pink glowing star cluster. Horizontally tileable (left edge = right edge). Keep x 380–580 at y 150–540 calm (few, dim stars). |
| `far.svg` | 0 0 960 540 | full height, tiles, drawn shifted DOWN by `−camY·0.15` (sinks as the tower rises) | transparent above ≈ y 320; distant horizon silhouettes at the bottom: moon = soft crater rims and a far moon base dome; dunes = rolling dunes and mesa rocks; rings = icy ridges; comet = crystal spires. Low contrast, darker than the ground. Tileable. Opaque at the very bottom (y > 500) so nothing shows below it. |
| `ground.svg` | 0 0 960 180 | width `960·unit/100`, height `180·unit/100`, repeated horizontally, centred (svg x 480 = `cx`), its line y = 40 placed at world `groundY` | transparent above the surface; surface line at **y = 40**, flat and clear for x 300–660; soil/rock fill down to y 180 (opaque below the surface). Side props standing on the surface: moon = small craters, a cute rover, a little satellite dish; dunes = round alien rock pillars, a cactus-like crystal plant; rings = ice crystals, a frozen pond; comet = glowing crystal flowers, ice boulders. Props never above y 0. Bottom colour (y 160–180) given in your final reply as `groundBottom` hex (renderer fills below it). |
Palette (dominant): moon `#1a1f4a` → `#9aa3d6` (ground lavender-grey `#8d8fb8`); dunes `#2a1638` → `#f08a5d` (ground rust `#c0603e`); rings `#0d2238` → `#58d6c8` (ground icy teal `#5fa8b8`); comet `#1e1040` → `#ff9fd0` (ground pale violet `#b79ad9`).

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`star` (5-point, yellow-white), `sparkle` (4-point star), `puff` (soft round white puff), `dust` (soft red-orange dot), `ice` (small pale-cyan hexagon crystal), `snow` (soft pale-pink dot), `heart` (small pink heart), `spark` (tiny orange spark), `coinbit` (tiny gold star), `petal` (glowing crystal petal, pink-violet).

## 5. Code architecture (`game/js/`, classic scripts on `window.MS`)
`rng.js` (given), `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js` (integrator).

### 5.1 `MS.World` (headless, deterministic for seed + inputs, fixed sub-steps 1/120 s)
- `new MS.World(opts)` calls `reset(opts)`; `reset({seed, difficulty:'easy'|'normal'|'hard', width, height, level:0})`. `MS.World.CONFIG` exported.
- `MS.World.computeLayout(w, h)` (static, §2). `setLayout(w,h)` recomputes the layout and **re-anchors** the tower (all crate x shift by the cx change; y keep their stack heights relative to the new groundY), saucer, coins, camera.
- Input: `drop()` → if `phase === 'swing'` and a crate is held, releases it (event `drop`). Otherwise buffered for ≤ 0.25 s (only one) and released as soon as a crate is held again; older presses are ignored.
- `update(dt)` accumulates and runs fixed steps of `CONFIG.step` (1/120). Every moving thing stores `prevX/prevY` (and `prevRot`, `cam.prevY`, `tower.prevSway`) at the start of each step; the renderer lerps with `world.alpha` (leftover fraction 0..1). `drainEvents()` → array, then cleared.
- `predictLanding()` → `{x, dx, perfect, ok, landY}` for releasing the held crate **now** (pure, no RNG): x where it would land, dx from the current top-crate centre (including sway), whether it would be perfect / stay (ok). Used by the bot and the renderer's drop guide. `null` if nothing is held.
- `swayOffset(y)` → px horizontal offset of the tower at world height y (0 at the base, `tower.sway` at the top; shape `((groundY − y)/towerH)^1.5`). Use the lerped value `swayOffsetLerp(y, alpha)` in the renderer.
- `gotoLevel(i)` — jump to level i (fresh tower, emits `levelUp`). `getState()` → plain summary for tests.
- **State:** `time, phase ('swing'|'fall'|'settle'|'goal'|'travel'|'over')`, `level` (0-based, endless), `zone` (= level % 4), `loop` (= ⌊level/4⌋), `score, combo, maxCombo, hearts, maxHearts, difficulty, coins` (total), `grow` (0..5), `growCoins` (coins toward the next step, 0..4), `placed` (crates placed on this planet), `goal` (crates needed on this planet), `planet {g, swingW, ...}` (current zone params after difficulty/loop), `layout`, `cam {y, prevY}`, `saucer {x, prevX, y, prevY, vx, phase, scale, prevScale, anim:'idle'|'drop'|'happy'|'oops', animT, tilt}` (`scale = 1 + 0.08·grow`, eased), `held` (crate object in state `held` or null), `crates[]`, `coins[]`, `base {x, y, w, h}`, `tower {sway, prevSway, swayV, height, topY, topX}`, `flag {x, y, t} | null`, `rocket {x, y, prevX, prevY, state:'in'|'land'|'out', t} | null`, `stats {drops, placed, perfect, edges, misses, topples, coins, grows, levels, bestTower}`.
- **Crate:** `{id, x, y, prevX, prevY, w, h, style:0..3, rot, prevRot, vx, vy, vr, state:'held'|'falling'|'placed'|'toppling'|'gone', perfect, squash (0..1, decays), t}`. `x,y` = centre. Placed crates keep their rest x (the renderer adds `swayOffset(y)` and a small tilt `sway·0.002·(height fraction)`).
- **Coin:** `{id, x, y, prevX, prevY, r, t, spin (frame phase), state:'float'|'collected'|'gone'}`; floats with a gentle bob between the saucer and the tower top; collected when a falling crate's box overlaps its circle (event `coin`), flies up to the HUD in the renderer.
- **Events:** `{type:'drop', x, vx}`, `{type:'land', crate, dx, perfect, speed}`, `{type:'perfect', crate, combo}`, `{type:'edge', crate, dx}` (landed and stays, but off-centre), `{type:'miss', crate}` (tips off the edge, tumbles to the ground and disappears), `{type:'topple', count, y}` (a top part of the tower fell: centre-of-mass rule), `{type:'heartLost', hearts}`, `{type:'coin', coin, x, y, total}`, `{type:'grow', grow}`, `{type:'shrink', grow}`, `{type:'combo', combo}`, `{type:'comboBreak', combo}`, `{type:'goal', x, y, bonus}`, `{type:'rocket'}` (rocket touches down), `{type:'levelUp', level, zone}`, `{type:'spawn'}` (a new crate appears in the beam), `{type:'gameOver'}`.
- **Rules:**
  - Saucer: `x = cx + swingA·sin(phase)`, `phase += swingW·dt` (swingW per planet/difficulty/loop; eases naturally at the edges). Small tilt ∝ vx. The held crate hangs at `y = saucer.y + emitterDY + h/2 + gap`, x follows the saucer with a slight spring lag (pendulum feel).
  - Fall: on release the crate keeps `inherit·saucer.vx` sideways (CONFIG `inherit` ≈ 0.25–0.35: "the beam damps it"), falls with the planet's `g` (scaled by unit/100), rotates a tiny bit from vx. No air drag on the moon.
  - Landing on the top surface (top crate, or the base when empty): `dx = crate.x − (top.x + sway at top)`. `|dx| ≤ perfectTol·w` → **perfect**: snaps to centre (x = top.x), combo +1 (cap ×5 for points), no added lean. `|dx| ≤ 0.5·(w_top + w)·edgeK`... simplified: crate stays when its centre is over the top crate (`|dx| ≤ w_top/2`), else **miss** (it pivots on the edge and tumbles: angular + linear motion, falls to the ground/out of view, then `gone`). A non-perfect stay = `edge` (combo resets, the tower sways more).
  - Centre of mass: after every landing, for each crate i from the top down, the COM of everything above i must be within i's top extent (`|comX − x_i| ≤ w_i/2`); if not, all crates above i **topple** (they become `toppling`, tumble off the heavier side), event `topple`, one heart lost (miss + topple from one drop costs one heart total).
  - Sway: a damped spring (`swayK`, `swayDamp`) kicked on every landing by `kick·dx + grow·growKick`; perfect drops kick lightly. The sway only shifts drawing and the landing target (it never topples by itself).
  - Camera: target `camY = min(0, tower.topY − crateH − topLine)` (keeps the top at ≤ topLine on screen), eased with a critically damped spring (no snap); on a new planet it returns to 0.
  - Coins: `CONFIG.coins` per drop (spawn chance and count per zone), placed in the fall band (between `saucer.y + 0.8·unit` and `tower.topY − 0.6·unit`), x within the swing range; ≤ 3 alive. Each coin +5. Every 5 coins → `grow +1` (max 5), event `grow`. A miss → `grow −1` (min 0), event `shrink`.
  - Scoring: placed +10; perfect +10 × min(combo, 5); coin +5; goal bonus `100 × (zone + 1) × (loop + 1)`.
  - Goal: when `placed === goal` → phase `goal` (≈2.6 s): a flag rises on top of the tower (event `goal`), a rocket comes down beside the tower and lands on the ground (event `rocket`), then phase `travel` (≈1.0 s: crates fade away, camera returns down) → `levelUp` (level++), fresh tower on the new planet. Hearts are kept (+1 heart back, up to max, as a reward).
  - Lose: hearts reach 0 → phase `over`, event `gameOver` (after the falling crate settles).
  - The first planet must be easy for a 6-year-old: Easy = slow swing, wide crates (×1.15), perfectTol large, 4 hearts.
- **CONFIG** (with units and why) at the top of `world.js`; per-difficulty presets in `CONFIG.difficulty`, per-planet params in `CONFIG.planets`.

### 5.2 `MS.Weather` — `new MS.Weather({width,height,seed})`, `setLevel(zone,{instant})`, `resize(w,h)`, `update(dt, camY)`, `burst(sprite, x, y, n, opts)` (x,y in **world** coords; burst particles carry `world: true`), `particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', world?}`, `ambient {tint (css rgba or null)}`. Ambient particles are in **screen** space. moon: twinkling sparkles + slow floating moon-dust motes (low gravity); dunes: red dust streaks blowing sideways in gusts that change strength; rings: tumbling ice crystals drifting slowly; comet: soft pink snow falling with sway + a shooting star every 6–10 s (fast streak with a trail). Front-layer ambient particles must avoid the tower column (x within `cx ± 1.6·unit`). Bounded counts (< 140). Works for any canvas size (portrait up to 720×1600). Burst opts: `{speed, life, size, gravity, spread, up, spin, layer}`.

### 5.3 `MS.Bot` — `new MS.Bot(world, {skill, seed})`, `bot.step(dt)`: in phase `swing`, after a short think time (0.3–0.8 s, faster with skill) it watches `world.predictLanding()` and releases when `|dx|` is under a skill-dependent threshold (with timing noise: a reaction delay of `(1 − skill)·0.12 s` gaussian). skill 1 ≈ near-always perfect; 0.5 ≈ casual player. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.MS.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), drop() }`. Test flags are never saved to settings.

## 6. Customisation slots
`hero` (Juno + saucer: a custom picture is drawn inside a procedural saucer ring with rim lights, with bob), `crate` (one picture for every crate: drawn cover-cropped inside the crate box with a coloured frame per style), `coin` (the star-coin: drawn round with a gold rim; spins by horizontal squash), `bg_moon`, `bg_dunes`, `bg_rings`, `bg_comet` (a full-scene photo replaces sky+far for that planet; the ground strip stays).

## 7. Audio (WebAudio, synthesized)
SFX: drop "whoop" (beam release), crate land thud (heavier with size), perfect "clunk-ding" whose pitch rises with combo, edge creak/wobble, miss "boing-tumble" + soft "oops", topple soft clatter, coin "pling", grow power-up arpeggio, shrink down-slide, heart lost, goal fanfare, rocket whoosh + landing, level-up, game over gentle tune, best score, button click. Music: soft space lullaby per planet (moon dreamy pad + music box, dunes warm marimba, rings glassy bells, comet twinkly arps), crossfade on level change. Unlock on the first gesture.

## 8. Mobile (iPhone / iPad) — same platform layer as the other daily games
- Pointer Events: `pointerdown` on the stage (not on UI) drops. UI buttons fire on click; the ghost click is swallowed.
- iOS: audio unlock in the first `touchend`; `visibilitychange` pauses and suspends audio; kid-proofing (no zoom, no rubber-band, no callouts, no text selection).
- Home screen: `manifest.webmanifest` plus 180/192/512 PNG icons from `tools/render_mobile_icons.js`.
