# Nimbus's Bubble Garden — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.NB`. Storage prefix `nbg:`. Exe `NimbusBubbleGarden.exe`, port 47623.
Fantasy in one sentence: **it must FEEL like being a soft, floaty little cloud drifting after your finger through a rainy garden, popping wobbly bubbles — "bloop! tink!" — and puffing up bigger and fluffier with every gem.**

## 1. Lessons from bubble/balloon poppers (keep / change)
| Reference idea (Bubble Pop, Balloon Pop toddler apps, Pop the Lock) | Keep | Change for us |
|---|---|---|
| Things float up, you pop them, satisfying sound + burst | ✔ | the pop is done by **touching with the hero**, not a direct tap, so there is a character to love and steer; membrane burst + droplets + the gem flies to the jar |
| Direct tap anywhere | ✘ | the hero glides to the finger with a soft spring (floaty, heavier as she grows) and sits ~0.7 units above a touching finger so the finger never hides her |
| Endless, no fail state (toddler apps) | ✘ | 3 hearts (Easy 5), lost only on a burr bump; escaped bubbles cost nothing |
| Bombs / bad bubbles that end the game | ✘ | chestnut burrs that **dangle as a warning** first, then drop with gravity, bounce once and roll off; a bump is soft and shrinks Nimbus one size |
| Score multipliers from combos | ✔ | the multiplier is Nimbus's **size** (the twist): bigger = more points per gem but a bigger target for burrs |
| One long session | ✔ | 4 times of day, each ends when the gem jar is full, crossfade, endless loops |

## 2. Screen & coordinates
- Logical view `VW×VH` from `Renderer.computeView` (same as the other daily games): landscape ≥16:9 → 540 tall, up to 1280 wide; other landscape → 960 wide, up to 960 tall; portrait → 560 wide (720 when aspect ≥ 0.6), up to 1600 tall. The world gets `width,height` in `reset`/`setLayout`; nothing hard-codes 960.
- Units: px (logical), seconds, y grows **downward**. **No camera**: world coords = screen coords (the garden does not scroll).
- `NB.World.computeLayout(w, h)` (static) → `layout {width, height, portrait, unit, groundY, topY, minY, maxY}`:
  - `unit = portrait ? min(w/6, h/8) : min(w/9.6, h/5.4)` (100 at 960×540).
  - `groundY = h − 0.95·unit` — the lawn line: bubbles are born here (from puddles) and burrs land here.
  - `topY = 0.85·unit` — under the HUD; burrs dangle at `topY + 0.15·unit`.
  - Nimbus's centre is clamped to `x ∈ [r, w − r]`, `y ∈ [minY + r, maxY − r]` with `minY = topY`, `maxY = groundY − 0.1·unit`.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search for inspiration only; never copy or trace; no known characters, brands, logos or mascots — Nimbus must not look like any famous cloud character (no Care Bears clouds, no Kirby-like pink puff, no Mr. Men, no Pokémon Altaria/Castform style)). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (in the viewBox units given) in a dark tone of the fill (never pure black). No `<text>`, fonts, scripts, `<image>`, external refs. `width`/`height` = viewBox. Transparent background unless stated.
**Colour separation:**
- Gems (colour AND shape, index 0..4 everywhere): **0 ruby `#ff4d6d` round brilliant**, **1 sapphire `#3d8bff` drop**, **2 emerald `#2fd07a` square cut**, **3 topaz `#ffc531` star**, **4 amethyst `#b26bff` heart**. Bright, saturated, white sparkle highlight, dark outline of the same hue.
- Nimbus: white `#ffffff`, cool shade `#cfe3f7`, outline `#5a7aa6`, rosy cheeks `#ff9fb8`, dark eyes `#2b3a5c` with white shines.
- Bubbles: mostly transparent (the gem inside must read clearly), an iridescent rim (soft pink→mint→sky), white highlight arcs.
- Burrs: warm browns `#8a5a3a` / spikes `#6b4226` / outline `#4a2c18` (and a green chestnut variant `#7fa83a`) — the darkest, most solid things in the play area so they read as "avoid".
- Backgrounds are **muted, softer and less saturated** than gems, bubbles and Nimbus, especially in the play area (between `topY` and `groundY`); never large flat areas of the gem colours there. Rain is pale and thin.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `nimbus_0.svg`, `nimbus_1.svg` | 0 0 128 128 | `2·hero.r·1.25` square (the sprite circle is a bit bigger than the hit circle) | Nimbus, front ¾ view, a round fluffy cloud body made of 5–7 overlapping puffs, big eyes, small smile, rosy cheeks, two tiny stubby puff-arms and a little curl of mist at the bottom like a tail. **Body centre (64, 66); the body fits a circle r 50 around it.** Frames 0/1 = idle float: only the arms and the mist-tail move (arms up/down a little); body/face geometry identical. |
| `nimbus_happy.svg` | same | same | ^^ eyes, open smile, arms up. Same body geometry. |
| `nimbus_ouch.svg` | same | same | eyes squeezed (> <), wavy mouth, one small sweat drop, puffs slightly ruffled. Same body geometry. |
| `nimbus_rain.svg` | same | same | blissful closed eyes, big smile, body tinted soft rain-blue `#d6e6fb` with a darker underside `#a9c3e6`; arms out. (The renderer adds the falling rain.) Same body geometry. |
| `bubble.svg` | 0 0 128 128 | `2·bubble.r` | soap bubble, centre (64,64) r 60: nearly clear inside (alpha ≤ 0.12 tint), iridescent rim 4–6 px (gradient pink→mint→sky), a big curved white highlight top-left and a small dot bottom-right. Nothing in the middle (the renderer draws the gem there). |
| `gem_0..4.svg` | 0 0 64 64 | `1.05·bubble.r` | the five gems from §3, centred (32,32), fitting r 26, facets as 2–3 lighter/darker flat polygons + one white sparkle. |
| `burr_0.svg`, `burr_1.svg` | 0 0 96 96 | `0.70·unit` | 0 = round brown spiky chestnut burr; 1 = green spiky chestnut shell slightly open with a glossy brown nut peeking out. Centre (48,48); **solid body r 26, soft rounded spikes out to r 44**. A tiny sleepy, slightly grumpy-cute face (two dot eyes, small line mouth) is fine; nothing scary. A short stem nub at the top. |
| `heart.svg`, `heart_empty.svg` | 0 0 48 48 | 28 (HUD) | lives: a plump raindrop-heart in rosy pink `#ff6f91` with highlight; empty = outline only, lilac-grey at 50 %. |
| `jar.svg` | 0 0 96 96 | 44 (HUD) | the gem jar: a round glass jar with a cork lid and a little ribbon, transparent glass (the renderer draws the fill behind it). Inner fill area: x 22–74, y 30–84. |
| `icon.svg` | 0 0 256 256 | app icon | Nimbus's face and puffs big, popping a bubble with a pink gem, on a round rainy-garden badge (soft teal sky, a few rain lines, a tulip). Readable at 32 px. |

### 4.2 Times of day (environment artist) — `levels/<zone>/`, zone ∈ `dawn`, `noon`, `sunset`, `night`
The renderer fills the whole screen with a **vertical sky gradient** (`skyTop`→`skyBottom`, per zone, §4.4), then draws these layers. All are drawn at scale `k = unit/100` (so a 960-wide tile is `9.6·unit` px), **tiled horizontally** (left edge = right edge, seamless), and gently parallaxed by a tiny horizontal sway (≤ 6 px), not scrolled.
| File | viewBox | Placement | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 540 | top-anchored (`y = 0`) | **transparent** except sky décor: soft rain clouds (big, pale, flat, near the top), dawn: low pink sun glow behind clouds; noon: bright sun patch peeking out + faint rainbow arc; sunset: big low orange sun with streaky clouds; night: crescent moon, a few small stars, dark-blue clouds. Keep the décor mostly above y 300 (in landscape the play area is behind it, so it must stay soft and low-contrast). |
| `far.svg` | 0 0 960 540 | bottom of the tile at `groundY + 0.3·unit` | transparent above ≈ y 220; distant garden: round tree canopies, a greenhouse, a hedge line, a little cottage roof; low contrast, tinted to the time of day (night: one or two warm lit windows). Opaque below ≈ y 470 down to 540. |
| `mid.svg` | 0 0 960 540 | same bottom line | transparent above ≈ y 290; nearer: a picket fence, tall flowers (tulips at dawn, sunflowers at noon, cosmos/asters at sunset, glowing lantern-flowers at night), a watering can, a trellis; muted. Opaque below ≈ y 490. |
| `ground.svg` | 0 0 960 200 | top of the tile at `groundY − 0.4·unit` (so **y = 40 of the tile is the lawn line `groundY`**); height `2·unit`, clipped at the screen bottom | the front lawn: grass blades and small flowers poking up from y 0–40, then an opaque lawn/soil band from y 40 down with **4 puddles** (flat ellipses ≈ 110×22) centred at x 120, 360, 600, 840 on y ≈ 58 (the renderer spawns bubbles there and draws ripples), pebbles, clover. Night: a few glow-worm dots in the grass. |
Palette hints (renderer gradient; artists match the horizon to them): dawn `#c9b4e6`→`#ffd3c4`; noon `#8fc9ef`→`#dff1f7`; sunset `#7a5aa8`→`#ffb07a`; night `#141c46`→`#34407a`.

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`drop` (pale blue raindrop), `streak` (thin rain streak, viewBox 0 0 8 48), `ripple` (flat ellipse ring), `splash` (little crown of droplets), `shard` (iridescent bubble-film fleck), `sparkle` (4-point star, white), `petal` (pink petal), `leaf` (small orange-green leaf), `mist` (soft wide white wisp, viewBox 0 0 64 32), `glow` (soft warm-green glow-worm dot), `star` (tiny 5-point, white-yellow), `puff` (soft round white cloud puff).

### 4.4 Zone constants (renderer, `ZONE_INFO`)
| zone | name | skyTop | skyBottom | rain alpha | hint |
|---|---|---|---|---|---|
| 0 | Dawn | `#c9b4e6` | `#ffd3c4` | 0.35 | "Float Nimbus to the bubbles!" |
| 1 | Noon | `#8fc9ef` | `#dff1f7` | 0.25 | "Gems make Nimbus grow!" |
| 2 | Sunset | `#7a5aa8` | `#ffb07a` | 0.4 | "Watch out for falling burrs!" |
| 3 | Night | `#141c46` | `#34407a` | 0.45 | "Fill the jar to see the rainbow!" |

## 5. Code architecture (`game/js/`, classic scripts on `window.NB`)
`rng.js` (given), `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js` (integrator).

### 5.1 `NB.World` (headless, deterministic for seed + inputs, fixed sub-steps 1/120 s)
- `new NB.World(opts)` calls `reset(opts)`; `reset({seed, difficulty:'easy'|'normal'|'hard', width, height, level:0})`. `NB.World.CONFIG` exported.
- `NB.World.computeLayout(w, h)` (static, §2). `setLayout(w,h)` recomputes the layout and **re-anchors** everything proportionally (x by width, y relative to groundY/topY, sizes by unit), so nothing jumps out of bounds on rotate/resize.
- **Input:**
  - `setTarget(x, y)` — absolute target (pointer/touch, already offset by main.js), clamped to the allowed box; `clearTarget()` keeps the last target.
  - `setMove(ax, ay)` — keyboard axis, each −1..1; while non-zero the target moves at `CONFIG.keySpeed·unit` px/s from the hero's position (the target is reset to the hero's position when keys start, so keys and pointer mix cleanly).
- `update(dt)` accumulates and runs fixed steps of `CONFIG.step` (1/120). Every moving thing stores `prevX/prevY` (and hero `prevR`) at the start of each step; the renderer lerps with `world.alpha`. `drainEvents()` → array, then cleared.
- `gotoLevel(i)` (emits `levelUp`), `getState()` → plain summary for tests, `spawnBubble(x, gem)` and `spawnBurr(x)` test hooks.
- **State:** `time, phase ('play'|'over'), level (0-based, endless), zone (= level % 4), loop (= ⌊level/4⌋), score, hearts, maxHearts, difficulty, gems (in this level), goal (gems needed this level), progress (0..1), combo (pop streak), comboT, maxCombo, wind {x, target, t} (px/s), layout`,
  `hero {x, y, prevX, prevY, vx, vy, tx, ty, size (1..5 int), grow (0..1 gems toward the next size: gemsInSize/gemsPerSize), r (hit radius px, eased toward the size's target), prevR, tilt (rad, from vx), squash (0..1 decays: set on pop/grow/hit), mood ('idle'|'happy'|'ouch'|'rain'), moodT, invuln (s), rainT (s left of the shower), blink (0..1), knockT}`.
  - Hit radius target: `rFor(size) = CONFIG.heroR·unit·(1 + CONFIG.growK·(size − 1))` (≈ 0.34u → 0.68u at size 5 with growK 0.25).
  `bubbles[] {id, x, y, prevX, prevY, vx, vy, r, gem (0..4), wob (phase), born (time), state:'rise'|'gone'}`, `burrs[] {id, x, y, prevX, prevY, vx, vy, rot, prevRot, spin, r (hit radius), variant (0|1), state:'hang'|'fall'|'roll'|'gone', t, bounced, hit}`, `stats {pops, gems, bumps, showers, escaped, levels, sizeMax, time}`.
- **Events:** `{type:'spawn', b}` (a bubble was born at a puddle: ripple), `{type:'pop', b, x, y, gem, points, size, combo, by:'hero'|'rain'}`, `{type:'escape', b}`, `{type:'grow', size}`, `{type:'shrink', size}`, `{type:'shower'}` (rain starts), `{type:'showerEnd'}`, `{type:'hang', burr}`, `{type:'drop', burr}`, `{type:'land', burr}` (bounce on the lawn), `{type:'bump', burr, x, y}`, `{type:'heartLost', hearts}`, `{type:'heartGain', hearts}`, `{type:'combo', combo}` (at 3, 5, 8, 12, 20…), `{type:'levelUp', level, zone, bonus}`, `{type:'gameOver'}`.
- **Rules:**
  - **Hero motion:** a spring toward the target: `a = ω²·(t − p) − 2ζω·v` with `ω = CONFIG.heroOmega / (1 + 0.15·(size − 1))` (bigger = floatier), ζ ≈ 0.75 (a hint of overshoot, cloud-like), speed capped at `CONFIG.heroMax·unit` px/s, plus a gentle idle bob (±0.04u, 0.6 Hz) in `y` while slow. `tilt` eases toward `clamp(vx / (heroMax·unit), −1, 1)·0.25` rad. `r` eases toward `rFor(size)` over ≈ 0.35 s (a soft puff-up, with `squash` kick).
  - **Bubbles:** born at a puddle x (4 puddles per 960-wide ground tile, i.e. at `(120 + 240·i)·k` + tiny jitter, only those on screen, or anywhere in portrait) just below `groundY`, `r = 0.30…0.42·unit` (smaller ones are rarer and rise faster). Rise with buoyancy toward a terminal speed `riseSpeed·unit` (per zone × difficulty, slightly random), horizontal wobble `sin` (amp 0.25u, 0.5–0.9 Hz) plus wind drift (`wind.x·0.8`), drag. Bubbles softly push each other apart if they overlap (no popping). Above `−r` → `escape` (combo resets). Spawn rate per zone; never more than `maxBubbles` alive. The gem index is random (uniform).
  - **Pop:** hero circle overlaps a bubble circle (`dist < hero.r + b.r·0.85`) → `pop`: `points = 10·size`, `score += points`, `gems += 1`, combo +1 if the last pop was < 1.2 s ago (else 1), hero `grow += 1/gemsPerSize`; when grow ≥ 1 and size < 5 → `size += 1`, `grow = 0`, `grow` event. At size 5 with grow ≥ 1 → **shower**: `rainT = CONFIG.showerTime` (2.5 s), mood 'rain', event `shower`; during the shower every bubble on screen pops (`by:'rain'`, staggered ≈ 0.08 s apart, each with points at the current size), burrs that are hanging are knocked loose harmlessly (state 'gone' with a fade — the renderer can show them washed away), `invuln` lasts the shower; at the end `score += 50·(level+1)`, `size = 1`, `grow = 0`, events `showerEnd` + `shrink`.
  - **Burrs:** chosen x (not within 1.3u of the hero's x on Easy when spawned), `state 'hang'` at `y = topY + 0.15·unit` for `hangTime` (Easy 1.6 s, Normal 1.1 s, Hard 0.85 s) with a wiggle (the renderer swings it; world keeps `t`), then `drop`: gravity `g = CONFIG.g·unit` (≈ 9.8 units/s²) with a light drag, wind pushes it a little, spins; on reaching `groundY − r` it bounces once (`vy = −0.35·vy`, `land` event), then `roll`s sideways (vx ± 1.5u/s, decaying) and fades after 1.2 s → 'gone'. Hit radius `r = 0.24·unit` (Easy ×0.85). Spawn interval per zone/difficulty (dawn Easy: ~1 per 9 s; night Hard: ~1 per 2.5 s), at most `maxBurrs` alive. A burr that is `hang`ing doesn't hurt; rolling burrs don't hurt either (only falling ones do) — keep it fair for kids.
  - **Bump:** a falling burr overlaps the hero (`dist < hero.r·0.9 + burr.r`) while `invuln = 0` and no shower → `bump`: one heart lost (`heartLost`), `size = max(1, size − 1)` with `grow = 0` (`shrink` if it changed), mood 'ouch', knock-back impulse away from the burr (`3·unit` px/s), `invuln = 1.5 s`, the burr bounces off (`vy = −|vy|·0.3`, sideways) and becomes harmless (`hit = true`).
  - **Wind:** `wind.target` changes every 4–8 s (seeded) within ± `windMax·unit` per zone (dawn 0.1u, noon 0.35u, sunset 0.6u, night 0.3u); `wind.x` eases toward it. It moves bubbles and burrs (not the hero).
  - **Levels:** `goal` gems per level = `CONFIG.goal[difficulty] + 2·loop`. When `gems ≥ goal` → `levelUp`: bonus `100·(zone+1)·(loop+1)`, +1 heart (up to max; `heartGain`), `level++`, `gems = 0`, bubbles on screen stay. Aim for 60–80 s per level for a casual player.
  - **Lose:** hearts reach 0 → phase `over`, `gameOver`; bubbles keep rising (they are pretty), no more spawns.
  - The first level must be easy for a 6-year-old: Easy = slower bubbles, lots of them, rare burrs with a long dangle, 5 hearts, a forgiving pop radius.
- **CONFIG** (units and why, at the top of `world.js`): `step, heroR, growK, gemsPerSize (4), heroOmega, heroZeta, heroMax, keySpeed, touchLift (0.7, used by main.js), g, showerTime, comboWindow, maxBubbles, maxBurrs, goal {easy, normal, hard}`, `difficulty {easy|normal|hard: {hearts, rise, spawn, burrEvery, hangTime, burrR, popK}}`, `zones [{rise, spawn (bubbles/s), burrEvery (s), windMax}]`.

### 5.2 `NB.Weather` — `new NB.Weather({width, height, seed})`, `setLevel(zone, {instant})`, `setGround(groundY, unit)`, `resize(w, h)`, `update(dt, wind)` (wind px/s), `burst(sprite, x, y, n, opts)`, `particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front'}`, `ambient {tint (css rgba or null), rain (0..1 strength)}`. Rain: thin `streak` particles falling fast at a slant from the wind, mostly in the back layer, a few in front (alpha ≤ 0.35), landing on the lawn spawns tiny `splash` bursts (bounded). dawn: light rain + low `mist` wisps near the ground (back); noon: lighter drizzle + floating `sparkle`s in the sunlight; sunset: rain + tumbling `leaf`s (pendulum/tumble motion); night: rain + `glow` worms drifting near the grass + twinkling `star`s high in the sky (y < 0.35·h). During a shower call `setShower(on)`: much heavier rain from Nimbus's position (main.js passes `burst('drop', …)` too). Front-layer particles are small, sparse, pale, and never look like gems or bubbles. Bounded counts (< 180). Works for any canvas size (portrait up to 720×1600). Burst opts `{speed, life, size, gravity, spread, up, spin, layer, drag}`.

### 5.3 `NB.Bot` — `new NB.Bot(world, {skill, seed})`, `bot.step(dt)`: every ~0.15 s picks a target bubble (scores reachable bubbles by time to reach vs. time to escape, prefers clusters), steers with `world.setTarget`, and avoids falling burrs by predicting their path (gravity arc) and stepping sideways when one will cross Nimbus within ~0.8 s (skill ≥ 0.4; reaction delay `(1 − skill)·0.35 s`, aim noise `(1 − skill)·0.5u`). skill 1 ≈ never hit; 0.5 ≈ casual player. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.NB.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), target(x, y) }`. Test flags are never saved to settings.

## 6. Customisation slots
`hero` (Nimbus: a custom picture is drawn round inside a procedural fluffy cloud ring of puffs that grows with her, with bob, squash and the mood tint), `gem` (a custom picture drawn round inside each bubble, with a coloured ring + its shape badge so the five kinds still differ), `bg_dawn`, `bg_noon`, `bg_sunset`, `bg_night` (a full-scene photo replaces sky gradient + sky + far + mid for that time of day; the ground strip stays).

## 7. Audio (WebAudio, synthesized)
SFX: pop "bloop" (pitch by bubble size, + a tiny rising step with the streak), gem "tink" into the jar, grow "puff-up" (rising wobble), shower (a whoosh + rain noise + a happy arpeggio), burr hang "creak-wiggle" (very soft), burr drop "whistle", burr land "thud" (soft), bump "ouch-boing", heart lost, heart gain, level-up (rainbow chime), game over (gentle tune), best score, button click. Music: a soft loop per time of day (dawn music-box, noon bright ukulele-pluck, sunset warm keys, night lullaby bells) over a quiet rain-noise bed; crossfade on level change. Unlock on the first gesture.

## 8. Mobile (iPhone / iPad) — same platform layer as the other daily games
- Pointer Events on the stage (not on UI): `pointerdown`/`pointermove` set the target (touch: `y − touchLift·unit`). UI buttons fire on click; the ghost click is swallowed.
- iOS: audio unlock in the first `touchend`; `visibilitychange` pauses and suspends audio; kid-proofing (no zoom, no rubber-band, no callouts, no text selection, `touch-action: none` on the stage).
- Home screen: `manifest.webmanifest` plus 180/192/512 PNG icons from `tools/render_mobile_icons.js`.
