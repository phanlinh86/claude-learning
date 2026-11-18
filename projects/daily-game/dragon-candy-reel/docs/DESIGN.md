# Taffy's Candy Reel — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.PR` (kept from the scaffold `panda-arctic-reel`). Storage prefix `dcr:`. Exe `TaffysCandyReel.exe`, port 47626.
Fantasy in one sentence: **it must FEEL like fishing on a windy candy lake — the bobber sinks with weight, floats back with buoyancy, the line bows and sways in every gust, and every good reel tap gives a satisfying tug.**

## 1. Lessons from fishing games (keep / change)
| Reference idea | Keep | Change for us |
|---|---|---|
| One-input fishing (hold to drop, release to rise) | ✔ hold = sink, release = float up | the hook is pushed sideways by the wind (more when deeper) |
| Fish swim across at different depths, deeper = worth more | ✔ depth bands with value | sugar snowflakes drift inside soda bubbles; gummy fish are decoration |
| Timing reel meter (needle + sweet zone) | ✔ needle, green zone, gold Perfect centre | the zone jumps after every tap |
| Hazard that cuts the line | ✔ sour gummy | pouty-cute; it puffs up sour-faced and drifts away, the line goes "boing" + fizz |
| Rare golden fish | ✔ golden snowflake = 50 (5× pink) | faster, glitters, needle a bit quicker |
| Wind in fishing games (bobber drift) | ✔ **twist**: gusts that change direction | announced 1.5 s early by a windsock + whoosh; always readable, never sudden |
| Long tutorials | ✘ | level 1 teaches itself: slow drift, soft gusts, no gummies for the first 10 s |

## 2. Screen & coordinates
- Logical size: landscape 16:9 → **960×540** (width up to 1280 at 540 tall on wider screens); other landscape → 960 wide, height up to 960; portrait → 560 wide (720 when aspect ≥ 0.6), height up to 1600. All world code uses `W`,`H` passed to `reset`; nothing hard-codes 960.
- Units: px (logical), seconds. y grows downward.
- Vertical layout (logical px):
  - `SURFACE_Y = 150` — top of the wafer dock deck (Taffy's seat line).
  - dock deck 150 → 190 (candy-cane posts may dip to ~205). `WATER_TOP = 190` (water surface just under the dock).
  - `FLOOR_Y = H - 34` — lake bed line.
  - Gap: centred at `holeX = round(W/2)`, 64 px wide gap in the dock (render clips the dock layer).
  - Hook range: `minHookY = WATER_TOP + 14`, `maxHookY = FLOOR_Y - 22`. Hook x = `holeX + hook.sway` (wind, see §5.1).
  - Depth bands (fractions of `minHookY..maxHookY`): shallow 0–0.36 (berry, pink), middle 0.36–0.68 (lime, green), deep 0.68–1 (grape, purple). Golden may appear in any band.
- Taffy sits on the dock left of the gap: sprite placed so his **rod tip** lands at about `(holeX - 4, 70)`.
- Play band (calm, no overlays): `holeX ± 160` from `WATER_TOP` to `FLOOR_Y`. HUD in the top-left/top-right corners of the sky; the **windsock** HUD widget sits top-centre-right of the sky (`holeX + 150, 40`), never over the water; the reel meter sits right of the hook (`hookX + 120`), mirrored left in portrait if it would leave the screen.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search is for inspiration; never copy or trace; no known characters, brands or mascots — Taffy must not look like any famous cartoon dragon, and no real candy brands/logos). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (viewBox units) in a dark tone of the fill (never pure black). Soft, sweet, saturated palette; nothing scary. No `<text>`, fonts, scripts, `<image>`, external refs. `width`/`height` = viewBox. Transparent background unless stated.
**View:** side view, slightly from the front. Taffy faces **right** (towards the gap). Swimmers face **right**; the renderer flips them.
**Colour separation:** water is turquoise/aqua → teal-blue → deep blue (a "blue soda" lake) → snowflakes are **pink, lime green, grape purple, gold** with a white sugar rim; sour gummies are **orange** with a sugar-crystal coat; Taffy is **mint/seafoam green with a peach belly, a little pink scarf and tiny lilac wings**. Backgrounds avoid saturated pink/lime/purple/orange/gold in the play band (candy colours belong to the shore, sky and far hills).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `taffy_idle.svg`, `taffy_reel.svg`, `taffy_happy.svg`, `taffy_oops.svg` | 0 0 160 160 | 128 × 128 | Taffy the baby dragon sitting on an upturned candy-striped bucket-stool, 3/4 side view facing right: round mint-green body, peach belly with soft scale stripes, two tiny rounded cream horns, small lilac wings, curly tail behind, pink knitted scarf (ends flutter back-left), big shiny eyes, blush. Holds a short peppermint-stick fishing rod with a little reel, angled up-right. **Seat line y = 150** (placed on `SURFACE_Y`). **Body centre (68, 96)**. **Rod tip: idle (150, 22)**; reel: rod raised/bent, tip ≈ (146, 14), paw turning the crank; happy: rod tip as idle, other paw up, ^^ eyes, open smile, a tiny pink puff of candy smoke allowed; oops: surprised "o" mouth, wings up, rod tip as idle. Body geometry identical across frames. Report each frame's rod tip. |
| `jar.svg` | 0 0 64 64 | 44 × 44 | glass candy jar with a pink lid, a few sugar snowflakes inside. Bottom centre (32, 62) on `SURFACE_Y`, drawn left of Taffy. |
| `hook.svg` | 0 0 32 48 | 24 × 36 | round pink-and-white swirl-candy bobber on top (y 2–16) + silver hook below. **Line attach (16, 2)**. Hit centre (16, 32). |
| `flake_berry.svg`, `flake_lime.svg`, `flake_grape.svg`, `flake_gold.svg` | 0 0 64 64 | 40 × 40 (gold 44) | six-armed sugar snowflakes, each a different shape (berry = round-tipped arms, lime = branchy fern arms, grape = star-plate with hexagon centre, gold = big ornate one with sparkle). White sugar rim + highlight so they read on dark water. Centre (32, 32). |
| `bubble.svg` | 0 0 96 96 | 62 × 62 | transparent soda bubble wrapping a snowflake: thin pale rim, glossy highlight top-left, tiny fizz dots, fill alpha ≤ 0.18. Centre (48, 48). |
| `gummy.svg`, `gummy_puffed.svg` | 0 0 96 80 / 0 0 96 96 | 64 × 53 / 80 × 80 | pouty-cute sour gummy fish facing right, orange with a sparkly sugar coating, pouty mouth, little fins. puffed = round sour-faced ball, puckered lips, eyes squeezed, sugar crystals sticking out (funny, not scary). Centre (48, 40) / (48, 48). |
| `fish_a.svg`, `fish_b.svg` | 0 0 80 48 | 50 × 30 | decorative friendly gummy fish facing right: a (translucent cherry-red jelly fish), b (small striped blue/white candy fish). Centre (40, 24). Tail on the left. |
| `spool.svg` | 0 0 64 64 | 34 | HUD icon: spool with red licorice fishing line (a "life"). |
| `windsock.svg` | 0 0 96 64 | 72 × 48 | candy-striped windsock (pink/white) on a little lollipop pole; drawn pointing **right** (blowing right). Pole bottom (10, 62); sock attaches at (14, 14). Renderer flips/stretches it with the wind. |
| `icon.svg` | 0 0 256 256 | app icon | Taffy's face peeking over the dock holding up a sparkling pink sugar snowflake, on a round pastel badge; readable at 32 px. |

### 4.2 Weather scenes (environment artist) — `levels/<lvl>/` with lvl ∈ `sunny`, `rain`, `wind`, `snow`
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 200 | y 0–200, tiles, drift 5 px/s | **opaque** sky + clouds. Horizontally tileable. sunny: bright blue with cotton-candy clouds, a sun; rain: soft pink-grey sky, heavy rain clouds; wind: bright breezy sky, long streaky clouds; snow: lilac evening sky, first stars, snow clouds. |
| `far.svg` | 0 0 960 200 | y 0–200, tiles, drift 2 px/s | transparent; distant candy shore along the horizon, bottom ≈ y 165: gumdrop hills, lollipop trees, candy-cane fence, a gingerbread house (snow: lit windows, snow caps). Tileable. |
| `dock.svg` | 0 0 960 80 | drawn at y 140–220 (svg y 10 = `SURFACE_Y`) | tileable wafer-biscuit dock: deck top edge at svg y 10, icing drips along the front, wafer texture to y ≈ 50, candy-cane posts every ~160 px going down into the water to y ≈ 65; transparent above y 4 and below. snow: sugar snow on the deck; rain: wet shine. Render cuts a 64 px gap at `holeX`. |
| `water.svg` | 0 0 960 400 | stretched once to `W × (H − 170)` from y 170 | **opaque** soda-water gradient (lighter at top), soft light rays (sunny/wind only), no sharp details. |
| `reef.svg` | 0 0 960 320 | bottom = `H`, tiles, drift 3 px/s | transparent; lake bed of sugar sand and candy pebbles in the bottom 40 px (top ≈ svg y 286 = `FLOOR_Y`), rock-candy crystals, swirl-lollipop "plants", gumdrop rocks, licorice weeds. **Keep x 320–640 low and calm** (≤ 60 px tall). |
Also `dock_gap.svg` (0 0 96 80, drawn 96×80 centred on `holeX`, svg y 10 = `SURFACE_Y`): the two rounded wafer ends at the gap (left and right), transparent between (shared by all levels).
Water palette (top → bottom): sunny `#8fe3e0 → #2f9bb5`; rain `#7cc4cf → #2e6f8f`; wind `#86dcd6 → #2a8aa6`; snow `#4f7fb8 → #1c2e63`.

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`snowflake` (small sugar snow flake, white), `bubble_s` (tiny soda bubble), `sprinkle` (rainbow sprinkle rod — white/neutral body; renderer tints are NOT available, so make 1 file with a pink sprinkle and the renderer rotates; also `sprinkle_b` blue, `sprinkle_y` yellow), `floss` (puff of candy floss, pink-white), `wrapper` (tiny twisted candy wrapper), `ring` (water ripple ellipse, white stroke), `sparkle` (4-point star), `drop` (droplet), `star` (5-point star for catch bursts), `puff` (soft round white puff).

## 5. Code architecture (`game/js/`, classic scripts on `window.PR`)
`rng.js`, `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js` (integrator).

### 5.1 `PR.World` (headless, deterministic for seed + inputs, fixed sub-steps ≤ 1/120 s)
- `new PR.World()`; `reset({seed, difficulty:'easy'|'normal'|'hard', width, height, level:0})`.
- Input: `press()`, `release()`. In `roam` press starts sinking (held until release). In `reel` press is a reel tap. After a reel ends `holding` is cleared.
- `update(dt)` — fixed steps of `CONFIG.step` (1/120). Every moving object stores `prevX/prevY` (hook also `prevX`); the renderer lerps with `world.alpha`.
- `drainEvents()` → array, then cleared. `setLayout(width,height)` on resize.
- State: `time, phase ('roam'|'reel'|'snap'|'over')`, `level` (0-based, endless), `zone` (= level % 4: 0 sunny, 1 rain, 2 wind, 3 snow), `loop`, `score`, `lines, maxLines (3)`, `flakesInZone, flakesNeeded, totalFlakes, perfects, difficulty`, `layout {width, height, surfaceY, waterTop, floorY, holeX, minHookY, maxHookY, bands:[y0,y1,y2,y3]}`, `hook {x, y, prevX, prevY, vx, vy, sway, holding, tilt}`, `items[] {id, kind:'flake'|'gummy'|'fish', type ('berry'|'lime'|'grape'|'gold' | 'a'|'b' | 'gummy'), x, y, prevX, prevY, vx, r, phase, state ('swim'|'hooked'|'escape'|'caught'|'puffed'|'leave'), t, puff}`, `reel {active, itemId, needle, dir, speed, zone, width, perfect, stepPx, slips, maxSlips, tug}`, `taffy {anim:'idle'|'reel'|'happy'|'oops', t}`, `invuln`, `wind {value (−1..1, eased, + = blowing right), target, next (s until the next gust), warn (s; > 0 while a coming gust is announced), warnDir (−1|1), strength (0..1 for this level)}`, `stats {casts, hooks, catches, escapes, snaps, perfect, good, slip, gusts, byType:{…}}`.
- Events: `{type:'hook', item}`, `{type:'reelGood', perfect, y}`, `{type:'reelSlip', slips}`, `{type:'escape', item}`, `{type:'catch', item, points, x, y}`, `{type:'snap', x, y}`, `{type:'puff', item}`, `{type:'lineBack'}`, `{type:'levelUp', level, zone}`, `{type:'golden', item}`, `{type:'gameOver'}`, `{type:'sinkStart'}`, `{type:'splash', x, y}`, **`{type:'gustWarn', dir}`** (1.5 s before), **`{type:'gust', dir, strength}`** (the wind target flips).
- Rules: points berry 10, lime 20, grape 30, gold 50; +5 per Perfect. Good = 1 step, Perfect = 2. Slip = ½ step; 3 slips → escape. Gummy touch in roam (not during `invuln`) → snap: lines −1, gummy puffs and drifts away, hook resets after 1.0 s, `invuln` 1.5 s. Lines 0 → `over`. Level cleared → `levelUp`, +1 line (max 3), gummies swim off. No gummies in the first 10 s of level 0.
- **Wind (the twist):**
  - Gusts every `gustEvery [min,max]` s by difficulty (easy ≈ [11,15], normal [8,12], hard [6,10]); the wind level (zone 2) ×0.75 interval and stronger. First gust no earlier than 6 s into a level. Each gust **flips the direction** (target sign = −sign of current target, magnitude uniform 0.55..1). `gustWarn` is emitted `gustWarnTime` = 1.5 s before; `wind.value` eases toward `target` (critically damped / exponential, ~1.2 s to settle) — never a jump.
  - Hook sway: the bobber's sideways target is `sway* = wind.value · driftMax · depthFrac` where `depthFrac = (hook.y − waterTop)/(maxHookY − waterTop)` (0 at the surface → 1 at the bottom); `driftMax` px by difficulty (easy ≈ 34, normal 52, hard 70; wind zone ×1.4; clamp so `hook.x` stays inside `[60, W−60]`). `hook.sway` follows it as a damped spring (it lags and overshoots slightly like a real line in a current), `hook.x = holeX + hook.sway`. Collisions use `hook.x`. While reeling the hooked flake follows `hook.x`; sway keeps working (gently, ×0.5).
  - Current: swimmers' effective x speed = `vx + wind.value · current · (1 − 0.5·depthFrac(item))`, `current` px/s by difficulty (easy ≈ 8, normal 14, hard 20; wind zone ×1.4). Never let an item stall or reverse: keep at least 40% of its own speed in its own direction.
  - Sunny level strength 0.6, rain 0.8, wind 1.0, snow 0.8 (× the difficulty values above).
- CONFIG (with units and why) at the top of `world.js`, presets in `CONFIG.difficulty`.

### 5.2 `PR.Weather` — `new PR.Weather({width,height,seed})`, `setLevel(zone,{instant})`, `resize(w,h)`, `update(dt, {hookX, hookY, surfaceY, waterTop, wind})` (`wind` = world.wind.value), `burst(sprite,x,y,n,opts)`, `particles[] {sprite,x,y,size,rot,flipX,alpha,layer:'sky'|'back'|'front',glow?}`, `ambient {tint (css rgba or null), glow (0..1 flake glow), dark (0..1)}`.
- Sky (above `surfaceY`), all pushed sideways by `wind` (light things more): sunny — a few floss puffs drifting; rain — sprinkles (`sprinkle`, `sprinkle_b`, `sprinkle_y`) falling at an angle set by the wind, each spawning a `ring` ripple at `waterTop` when it lands in the open water (outside the dock band x? the dock covers y 150–190, rings appear at `waterTop` + 2 only in view); wind — floss tufts and `wrapper`s tumbling fast with spin, streaks; snow — `snowflake` with depth layers (size/speed/alpha by depth) and sway, sideways by the wind.
- Water: soda `bubble_s` rising with wobble (all levels, more in sunny), bent by the wind current; hook trail bubbles while the hook moves; snow level: soft glow `sparkle`s. Bounded (< 160 particles). Works for any canvas size up to 720×1600.

### 5.3 `PR.Bot` — `new PR.Bot(world, {skill, seed})`, `bot.step(dt)`: in roam steers the hook depth to the best reachable flake (value / time-to-reach), **predicting where the wind-swayed hook and the drifting flake will meet**, avoiding gummies; in reel taps when the needle is in the zone with reaction delay + error that grow as skill drops. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.PR.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), press(), release(), spawnGold(), gust(dir) }`. Test flags are never saved to settings.

## 6. Customisation slots
`hero` (Taffy), `flake` (replaces all four snowflake pictures; they keep a coloured glow ring so values stay readable), `gummy`, `bg_sunny`, `bg_rain`, `bg_wind`, `bg_snow` (a full-scene photo replaces sky+far+water+reef for that level; dock and gap stay). Custom characters get procedural motion (bob, squash on catch, wobble).

## 7. Audio (WebAudio, synthesized)
SFX: sink (soft descending blip loop while holding), splash, hook "plink", reel ratchet click per good tap (higher on Perfect + chime), slip "wob", escape "bloop", catch sparkle arpeggio (golden = longer, brighter), snap "boing", puff "pff", level-up fanfare, game over gentle tune, button click. Extra: gust whoosh (filtered noise swell, panned toward the new wind direction) on `gustWarn`, sprinkle plinks (rain, sparse). Music: soft music-box + pad loop per level (sunny bright major, rain gentle with pizzicato drops, wind swaying 6/8 with airy pad, snow twinkly celesta), crossfade on level change. Unlock on the first gesture (`touchend`/`pointerup`/`keydown`).

## 8. Mobile (iPhone / iPad) — same platform layer as the other daily games
- Pointer Events: hold anywhere on the stage = sink, tap = reel. UI buttons fire on touch `pointerup`; the ghost click is swallowed. Multi-touch: hold counts while any pointer is down.
- iOS: audio unlock in the first `touchend`; `visibilitychange` pauses and suspends audio; kid-proofing (no zoom, no rubber-band, no callouts, no text selection).
- Home screen: `manifest.webmanifest` plus 180/192/512 PNG icons from `tools/render_mobile_icons.js`.
