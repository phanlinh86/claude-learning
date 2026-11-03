# Ember's Glow Castle — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace `window.EG`. Storage prefix `egc:`. Exe `EmbersGlowCastle.exe`, port 47620.
Fantasy in one sentence: **it must FEEL like lights falling with weight and snapping together into something brighter — every merge is a satisfying "pop-glow".**

## 1. Lessons from merge / drop games (keep / change)
| Reference idea (2048, "drop the number", Suika-style) | Keep | Change for us |
|---|---|---|
| Two equal things merge into the next tier | ✔ | items are lights with distinct shapes and colours (no numbers to read) |
| Drop into columns, gravity stacks | ✔ 5 × 7 grid | the drop is a real fall with a soft bounce, merges pull together with an ease-in |
| Next-item preview | ✔ | Ember holds the current one; a small "next" bubble shows the one after |
| Cascades / chains | ✔ combo | combo 5 calls Boo the helper (our twist) |
| Instant loss when a column overflows | ✘ | a full column just refuses (Ember shakes her head); game over only when nothing fits anywhere |
| Endless with no goals | ✘ | each castle place has a goal light; reaching it floats it away (frees room) and changes the scene |

## 2. Screen & coordinates
- Logical size and view rules are the same as the other daily games (`Renderer.computeView`): landscape ≥16:9 → 540 tall, up to 1280 wide; other landscape → 960 wide, up to 960 tall; portrait → 560 wide (720 when aspect ≥ 0.6), up to 1600 tall. The world gets `width,height` in `reset`/`setLayout`; nothing hard-codes 960.
- Units: px (logical), seconds. y grows downward.
- Board: `cols = 5`, `rows = 7` (Hard: rows 6). Row 0 is the **bottom** row.
- Layout (computed by `World.computeLayout(w,h,cols,rows)`, exposed as `world.layout`):
  - `top` = 128 in landscape (HUD 56 + Ember 72), 190 in portrait; `bottomPad` = 22 (landscape) / 60 (portrait).
  - `cell = floor(min((h - top - bottomPad) / rows, (w - 40) / cols, 104))`.
  - `boardW = cols*cell`, `boardH = rows*cell`, `boardX = round((w - boardW)/2)`, `boardY = h - bottomPad - boardH` (top edge of the grid).
  - `colX(c) = boardX + (c + 0.5)*cell`, `rowY(r) = boardY + boardH - (r + 0.5)*cell` (centre of a cell).
  - `emberY = boardY - cell*0.95` (Ember's body centre); the held light hangs at `emberY + cell*0.55`.
  - `itemSize = cell*0.86` (drawn size of a light), `layout {width,height,cols,rows,cell,boardX,boardY,boardW,boardH,emberY,holdY,itemSize,portrait}`.
- Landscape 960×540 → cell 55, board 275 × 385 at x 342, y 133. The side areas (left and right of the board) hold the HUD panels: left = goal + next, right = score + combo.
- The play band to keep calm is the board itself plus 30 px around it, and the strip above it where Ember flies.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search is for inspiration only; never copy or trace; no known characters, brands or mascots — Ember must not look like any famous cartoon dragon, Boo must not look like any famous cartoon ghost). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px (in the viewBox units given) in a dark tone of the fill (never pure black). "Haunted" = cosy and funny: soft purples and moonlight, smiling ghosts, snoring pumpkins. Nothing scary, no skulls, no sharp teeth, no blood. No `<text>`, fonts, scripts, `<image>`, external refs. `width`/`height` = viewBox. Transparent background unless stated.
**Colour separation:** the board is a dark violet-navy glass panel (`#1b1438` at ~80% alpha). The lights must pop on it, each with a different main hue AND a different silhouette:
| tier | key | look | main colour | drawn shape |
|---|---|---|---|---|
| 1 | `item_1` | one round green firefly, glowing tail | lime `#b6f04a` | small, round |
| 2 | `item_2` | two blue fireflies side by side | sky `#5cc8ff` | wide pair |
| 3 | `item_3` | three pink fireflies in a triangle | pink `#ff7ac8` | triangle cluster |
| 4 | `item_4` | glass jar with a cork, full of yellow-green glow | amber/gold glow `#ffd44a` + glass | jar |
| 5 | `item_5` | short candle with a happy flame, drip of wax | orange flame `#ff9a3c`, cream wax | tall-ish |
| 6 | `item_6` | round paper lantern, red-gold, little tassel | red `#ff5a5a` | round + top cap |
| 7 | `item_7` | chubby 5-point star with a smile | gold `#ffe14d` | star |
| 8 | `item_8` | full moon with a sleepy smile and craters | pearl-lavender `#e9e2ff` | big circle |
Every light has a soft outer glow ring baked into the SVG (radial gradient, low alpha) inside the viewBox. Backgrounds must avoid saturated lime, pink and gold in the area behind the board (the board panel covers it anyway).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `ember_idle.svg`, `ember_drop.svg`, `ember_happy.svg`, `ember_oops.svg` | 0 0 160 160 | `cell*1.75` square | Ember: a chubby baby dragon, **lavender-teal** body (`#7fd8c8` teal belly cream `#fff1c9`, small soft violet wings, tiny rounded horns, little round tail), big shiny eyes, rosy cheeks, front view slightly 3/4, **flying** (wings out). Body centre **(80, 78)**. **Hold point (80, 138)** — her two little front paws hold the light just under her chin/belly. idle: wings level, smile; drop: paws open downward, wings up, "o" mouth; happy: eyes ^^, open smile, a tiny warm puff from the nostrils; oops: shaking head pose — eyes squeezed, wavy mouth, small sweat drop. Body geometry identical across frames except wings/face/paws. Also **`ember_flap.svg`** = idle with wings raised (same body), so the renderer can alternate idle/flap for a 2-frame wing flap. |
| `boo.svg`, `boo_carry.svg` | 0 0 128 128 | `cell*1.4` | Boo, the shy castle ghost: a soft white-lilac sheet ghost (`#f3eeff`, shading `#cfc3f2`), wavy bottom, big oval eyes, blush, tiny smile, small arms. carry = arms up as if carrying, happy closed eyes. Centre (64, 60). Not like any famous ghost character (no round "Pac" ghost, no "Boo" from Mario: give him a little bow tie or a tiny night-cap). |
| `pumpkin.svg`, `pumpkin_awake.svg` | 0 0 96 96 | `itemSize` | sleepy pumpkin blocker: round orange pumpkin `#ff9b3d` with a curly stem and leaf, **closed sleepy eyes**, a small "z" shape is NOT allowed as text — draw a tiny bubble instead; awake = eyes open, surprised smile. Centre (48, 50). |
| `item_1.svg` … `item_8.svg` | 0 0 96 96 | `itemSize` (tier 8 drawn 1.08×) | see the table in §3. Centre (48, 48). Shapes fit inside a 80 px circle so neighbours never overlap. |
| `goal_ring.svg` | 0 0 96 96 | 52 | HUD frame for the goal light: a round gold-trimmed medallion with a soft violet inside; transparent centre (the renderer draws the light inside). |
| `icon.svg` | 0 0 256 256 | app icon | Ember's face and wings holding a glowing candle / star, on a round violet night badge with a little castle tower silhouette. Readable at 32 px. |

### 4.2 Castle scenes (environment artist) — `levels/<zone>/` with zone ∈ `courtyard`, `cellar`, `library`, `tower`
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `sky.svg` | 0 0 960 540 | full screen height, tiles horizontally, drift 4 px/s | **opaque**. The far background: courtyard = dusky violet-pink sky with a big soft moon and clouds; cellar = deep blue cave wall with glowing crystal veins; library = dark blue night through very tall arched windows (part of the wall); tower = deep starry night with milky way. Horizontally tileable. |
| `far.svg` | 0 0 960 540 | full height, tiles, drift 1.5 px/s | transparent; mid-distance silhouettes: courtyard = castle walls and towers with lit windows; cellar = stalactites + crystal clusters; library = tall bookshelves and ladders; tower = battlements / roofs of lower towers. Tileable. Bottom part (y > 380) can be dense; keep it soft and low-contrast. |
| `near.svg` | 0 0 960 540 | full height, static, centred (svg x 480 = screen centre); if the screen is wider than 960 it is repeated left/right | transparent; foreground frame: courtyard = hedges, a fountain on the left, a pumpkin patch on the right, grass floor; cellar = barrels, mushrooms, crystals at the sides, stone floor; library = armchair, globe, stacked books, rug; tower = telescope, banners, stone parapet. **x 300–660 must stay empty above y 500** (the board sits there) except the floor line. |
Palette per zone (dominant): courtyard `#5b3f8f` → `#e79bb8`; cellar `#13284f` → `#3fb6d9`; library `#1d2350` → `#d8b46a` (warm lamp light at the sides only); tower `#0b1030` → `#6f7fe0`.

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`glow` (soft round yellow-green glow dot, radial), `leaf` (small autumn leaf, orange-red), `drip` (water drop, pale cyan), `sparkle` (4-point star), `dust` (tiny soft warm dot), `page` (small floating book page, cream), `star` (5-point star), `puff` (soft round white puff), `heart` (small pink heart), `spark` (tiny warm orange ember spark).

## 5. Code architecture (`game/js/`, classic scripts on `window.EG`)
`rng.js`, `world.js`, `weather.js`, `bot.js` (mechanics engineer); `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js` (integrator).

### 5.1 `EG.World` (headless, deterministic for seed + inputs, fixed sub-steps 1/120 s)
- `new EG.World(opts)` calls `reset(opts)`; `reset({seed, difficulty:'easy'|'normal'|'hard', width, height, level:0})`.
- `EG.World.computeLayout(w, h, cols, rows)` (static) → `layout` (§2). `setLayout(w,h)` recomputes and snaps every item to its cell (and Ember to its column).
- Input: `aim(col)` → Ember flies to that column (clamped 0..cols-1). `drop(col?)` → aim (if given) and drop the held light as soon as Ember is within 6 px of the column centre (or after 0.18 s). If called while the board is busy (falling / merging / helper / level-up), the drop is **buffered** (only the latest one) and runs when the board is ready. A drop into a column that cannot take the light → event `refuse`, nothing else happens.
- `update(dt)` accumulates and runs fixed steps of `CONFIG.step` (1/120). Every moving thing stores `prevX/prevY` at the start of a step; the renderer lerps with `world.alpha` (leftover fraction 0..1).
- `drainEvents()` → array, then cleared.
- `canDrop(col, tier?)` → bool (column height < rows, or its top light has the same tier as the held one).
- `simulate(col)` → `{ok, merges, points, maxTier, heights[], holes, gameOver}` — a pure, instant copy-based simulation of dropping the held light into `col` (no events, no RNG advance). Used by the bot.
- `gotoLevel(i)` — jump to level i (clears the board gently, emits `levelUp`). `getState()` → plain summary object for tests.
- **State:** `time, phase ('aim'|'drop'|'fall'|'merge'|'helper'|'goal'|'over')`, `level` (0-based, endless), `zone` (= level % 4), `loop` (= ⌊level/4⌋), `score, combo, maxCombo, difficulty`, `cols, rows`, `grid[col][row]` → item id or 0, `items[]` (see below), `held {tier, kind:'light'|'pumpkin'}`, `next {tier, kind}`, `goalTier` (5,6,7,8; loops stay 8), `maxTier` (highest tier on the board so far this level), `ember {x, prevX, y, prevY, vx, col, targetCol, anim:'idle'|'drop'|'happy'|'oops', animT, tilt}`, `boo {active, x, y, prevX, prevY, targets[], t, state:'in'|'carry'|'out'}`, `stats {drops, merges, cascades, biggestGroup, boos, pumpkins, pumpkinsWoken, refused, byTier:[0..8]}`, `layout`.
- **Item:** `{id, kind:'light'|'pumpkin', tier (0 for pumpkin), col, row, x, y, prevX, prevY, vy, state:'falling'|'rest'|'merging'|'popping'|'carried'|'ascending'|'gone', t, scale (1 = normal; pops 0.6→1.15→1), squash (−1..1, + = wide), mergeTo (id), alpha}`. Items removed from the board are dropped from `items` once their exit animation ends.
- **Events:** `{type:'aim', col}`, `{type:'drop', col, tier, kind}`, `{type:'land', item, speed}` (first touch-down; speed px/s for the thud volume), `{type:'bounce', item}`, `{type:'refuse', col}`, `{type:'merge', tier, count, x, y, points, combo, cascade}` (tier = the NEW tier), `{type:'combo', combo}` (each time combo reaches 2+), `{type:'comboBreak', combo}` (a merge-less drop after combo ≥ 2), `{type:'pumpkinDrop'}`, `{type:'pumpkinWake', item}`, `{type:'helper', combo}` (Boo comes), `{type:'helperCarry', item}`, `{type:'helperDone'}`, `{type:'newTier', tier}` (first time a tier is made in this run), `{type:'goal', tier, x, y, bonus}` (the goal light was made and starts to ascend), `{type:'levelUp', level, zone}`, `{type:'danger', level:0..1}` (board fullness when it changes by a step), `{type:'gameOver'}`.
- **Rules:**
  - Merge: after a light comes to rest (or is created), find its 4-connected group of the same tier (lights only; pumpkins never merge). Size ≥ 2 → all items in the group slide into the **anchor** (the item that just landed / was created; ties → the lowest row) over `CONFIG.mergeTime` (≈0.18 s, ease-in), then become ONE light of tier+1 there that pops. Tier 8 + tier 8 → a "super moon" burst: both vanish for a big bonus (score 2× value(8)).
  - Points for making tier t: `5 * 2^(t-1)` × (1 + 0.5 × (groupSize − 2)) × (1 + 0.1 × min(combo, 10)), rounded.
  - Combo: +1 per merge (including cascades). A drop that causes no merge resets combo to 0. At combo 5, 10, 15 … → helper.
  - Gravity: after merges, every item above an empty cell falls (real fall: `g` px/s², bounce restitution ≈0.25 once, squash on landing). Then re-check groups for every item that moved or was created (cascade).
  - Pumpkins (normal/hard only, from zone ≥ 1): the `next` item is a pumpkin with probability `CONFIG.difficulty[d].pumpkinChance[zone]`; never two pumpkins in a row. A pumpkin next to (4-neighbour) any merge's anchor or group wakes up and rolls off the board (removed, +10 points).
  - Boo (helper): flies in from the top corner, picks up to `CONFIG.helperCarry` (3) targets: pumpkins first, then the lowest-tier lights, preferring higher rows; lifts each away (they fade out up and off), gives +5 points per item; then gravity + cascades run as usual. Combo is NOT reset by Boo.
  - Spawns: `held` and `next` tiers come from the seeded RNG with weights per zone and difficulty (`CONFIG.difficulty[d].spawn[zone]` = weights for tiers 1..4), never above `max(2, maxTierOnBoard − 1)`.
  - Goal: when a light of `goalTier` (or higher) is created → event `goal`, phase `goal`: it glows and ascends off the top of the screen (≈1.2 s), bonus `100 × (zone + 1) × (loop + 1)`, then `levelUp` (level++), the next goal is set, and a "tidy-up" removes all tier-1 lights with a little sparkle (they fly up). The board keeps everything else.
  - Lose: when Ember needs to drop and **no column** can take the held light → phase `over`, event `gameOver`.
  - The first level must be easy for a 6-year-old: Easy spawns tiers 1–2 only in zone 0 and never pumpkins.
- **CONFIG** (with units and why) at the top of `world.js`; per-difficulty presets in `CONFIG.difficulty`.

### 5.2 `EG.Weather` — `new EG.Weather({width,height,seed})`, `setLevel(zone,{instant})`, `resize(w,h)`, `update(dt, {boardX, boardY, boardW, boardH})`, `burst(sprite,x,y,n,opts)`, `particles[] {sprite,x,y,size,rot,flipX,alpha,layer:'back'|'front',glow?}`, `ambient {tint (css rgba overlay or null), glow (0..1)}`. Courtyard: fireflies (glow) wandering in soft curves (Perlin-ish), falling leaves with pendulum sway and tumble. Cellar: drips falling from the top with gravity and a tiny splash, crystal sparkles twinkling. Library: dust motes drifting slowly in a light shaft, 1–2 pages tumbling down like leaves (rotation + sway). Tower: twinkling stars (sparkle) and a shooting star every 6–10 s (fast streak with a trail of star particles). Front-layer particles must **avoid the board rectangle** (respawn or fade when they would cross it). Bounded counts (< 140). Works for any canvas size (portrait up to 720×1600).

### 5.3 `EG.Bot` — `new EG.Bot(world, {skill, seed})`, `bot.step(dt)`: when `phase === 'aim'` and its think timer (reaction 0.25–0.7 s, faster with skill) is up, scores each column with `world.simulate(col)` (+ points, + merges × 30, + adjacency to same tier, − height and − holes, big − for gameOver) plus a one-step lookahead with `next` at skill ≥ 0.8; picks the best with soft-max noise that grows as skill drops; calls `world.drop(col)`. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`; `window.EG.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), drop(col), aim(col), fillBoard(pattern) }`. `fillBoard(rows)` sets the grid from an array of column arrays of tiers (test helper on `World`: `world.setBoard(cols)`). Test flags are never saved to settings.

## 6. Customisation slots
`hero` (Ember), `item` (one picture for all light tiers: drawn at `itemSize × (0.78 + 0.04 × tier)` inside a ring of the tier's main colour plus small tier pips), `helper` (Boo), `bg_courtyard`, `bg_cellar`, `bg_library`, `bg_tower` (a full-scene photo replaces sky+far+near for that place). Custom characters get procedural motion (bob, squash, wobble).

## 7. Audio (WebAudio, synthesized)
SFX: aim tick (soft), drop "whoosh", land thud (volume by speed), soft bounce, merge "pop-glow" whose pitch rises with tier and with combo, cascade chime, combo jingle, Boo's "woo-hoo" (soft sine glide), carry sparkle, pumpkin drop "bonk" + snore, pumpkin wake "boing", refuse "nuh-uh" (two low blips), goal fanfare + rising whoosh, level-up, game over gentle tune, button click. Music: soft music-box + pad loop per place (courtyard lullaby waltz, cellar drippy marimba, library warm celesta, tower twinkly), crossfade on level change. Unlock on the first gesture (`touchend`/`pointerup`/`keydown`).

## 8. Mobile (iPhone / iPad) — same platform layer as the other daily games
- Pointer Events: `pointermove` over the stage aims (mouse only; touch aims on `pointerdown`); `pointerup` (tap) drops into the column under the finger. Dragging a finger sideways moves Ember; lifting drops. UI buttons fire on `pointerup`; the ghost click is swallowed.
- iOS: audio unlock in the first `touchend`; `visibilitychange` pauses and suspends audio; kid-proofing (no zoom, no rubber-band, no callouts, no text selection).
- Home screen: `manifest.webmanifest` plus 180/192/512 PNG icons from `tools/render_mobile_icons.js`.

## 9. Changes after build and QA (2026-11-03)
- **Night creeps** (new rule, mechanics engineer): from `riseFrom` (Normal/Hard level 1, Easy level 2) every `riseEvery[zone]` drops, `riseCount[zone]` sleepy pumpkins rise from the bottom of distinct columns, pushing them up one cell; event `{type:'rise', col, item}`; `world.riseIn` counts down. Without it the refuse-only rule meant nobody ever lost. The HUD shows "rise in N".
- Woken pumpkins have state `'rolling'`; 8 + 8 makes a "super moon" (`merge` with `super: true`); Boo only carries tiers ≤ 3 (`helperMaxTier`).
- Layout: the cell is also capped so Ember fits above the board (landscape `(h − pad − 8)/(rows + 1.85)`) and so the portrait HUD strip fits (`(h − pad − 180)/(rows + 1.75)`); portrait side margin 96.
- Tier 3 is magenta `#ff5fa2` (colour-blind separation from tier 2).
