# Foxy's Reef Memory — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.RF`**. Classic scripts, no build step.
Sister project for reference/reuse: `projects/flappy` (same stack: canvas + plain JS, Go WebView2 exe).

## 1. Lessons from classic memory games (keep / change)
| Classic "Concentration" | Foxy's Reef Memory |
|---|---|
| Grid of face-down pairs, flip 2 | Same, clam-shell card backs on the reef floor |
| Mismatch → flip back after a pause | 0.8 s pause; tapping a 3rd card closes the pair early (fast players never wait) |
| No time pressure | Air meter (timer) + refill on match → gentle tension, never frantic on Easy |
| Static board | **Gravity twist**: after a match, cards slide into the gap in the level's water-gravity direction, slowly and visibly |
| Score = moves | Score = matches × combo multiplier + air bonus; cupcakes counter |
| Abstract | Hero Foxy reacts: swims to eat each cupcake, cheers on combos, "oops" face on mismatch |

## 2. Screen & coordinates
- Logical canvas **960 × 540**, letterboxed, rendered per performance rules (§7). y grows downward, px, seconds.
- **Board tray**: centre (585, 298); max size 590 × 430. Cards **84 × 98** (drawn), gap **10**. Grid sizes: Spring 4×3 (6 pairs), Summer 4×4 (8), Autumn 5×4 (10), Winter 6×4 (12). Cells laid out centred in the tray. Card position = centre of its cell.
- **Foxy's zone**: left strip x 20–250, y 90–470 (she swims there and to cupcakes; cupcakes float from the matched cards toward her).
- **Seabed**: floor strip drawn y 450–540 (opaque, tileable), behind the tray.
- **HUD**: season pill top-left (16,16, 196×46), score top-centre, **air meter** top-right under the HUD buttons (x 700–940, y 80) — renderer owns layout.

## 3. Art style guide (ALL art agents)
Identical to Family Flappy (proven): original hand-written SVG only (web search = inspiration only; never copy/trace; no brand/known characters), flat cartoon, rounded friendly shapes, big eyes, one-step cel shading + highlight, outline ≈ 3 px at viewBox scale in a dark tone of the fill (`stroke-linejoin/linecap="round"`), saturated not neon, kid-friendly. No `<text>`, fonts, scripts, external refs, filters (single light blur max). width/height attrs = viewBox. Transparent unless stated.
Underwater palette: teals/aquas, coral pinks, warm sand. Characters must pop against blue water: Foxy orange `#ff8a3d`-ish, cards cream fronts, teal/lavender backs.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & cards (character artist)
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `fox_swim1.svg`, `fox_swim2.svg`, `fox_swim3.svg` | 0 0 140 120 | 110 × 94, centre = body centre | Facing RIGHT. Little orange fox, cream muzzle/chest, big eyes, fluffy tail, wearing a clear round **bubble diving helmet** (glass circle with highlight + rim) and tiny air tank. Frames = paddling paws/tail positions; head/helmet/body IDENTICAL across frames. Body centre ≈ (66, 62). |
| `fox_eat.svg` | same | same | mouth open wide (happy chomp), eyes ^ ^ |
| `fox_oops.svg` | same | same | surprised/sheepish "oops" (mismatch), NOT sad/crying |
| `fox_cheer.svg` | same | same | paws up, sparkle eyes (combo ≥3 / level clear) |
| `card_back.svg` | 0 0 84 98 | 84 × 98 | Rounded card (r≈12) with a scalloped **clam shell** emblem, teal→lavender, subtle pearl. Opaque. |
| `card_front.svg` | 0 0 84 98 | 84 × 98 | Cream/sand card with soft inner frame; symbols are drawn on top. Opaque. |
| `face_00.svg` … `face_11.svg` | 0 0 64 64 | 60 × 60 on card centre | 12 sea creatures, each with a **unique silhouette AND unique dominant colour** (colour-blind safe): starfish, seahorse, octopus, crab, pufferfish, sea turtle, striped reef fish (original), jellyfish, whale, scallop shell, dolphin, sea snail. Cute faces where it fits. |
| `cupcake.svg` | 0 0 48 48 | 34 × 34 | Default treat: cupcake with pink frosting + cherry, inside a faint bubble ring (it floats). |
| `heart.svg` | 0 0 48 48 | | hit/cheer burst |
| `icon.svg` | 0 0 256 256 | app icon | Foxy in helmet + a shell card, round sea-blue badge, readable at 32 px |

### 4.2 Seasons (environment artist) — `seasons/<spring|summer|autumn|winter>/`
| File | viewBox | Use |
|---|---|---|
| `water.svg` | 0 0 960 540 | opaque backdrop: water gradient (lighter at top), surface light; static |
| `far.svg` | 0 0 960 540 | distant reef silhouettes/rocks, hazy, **tileable horizontally**, slow drift (renderer: 3 px/s) — content y 300–470 |
| `mid.svg` | 0 0 960 540 | coral, kelp, anemones, season-coloured, **tileable**, drift 8 px/s; keep calm/darker behind the board region (x 280–890) — busy detail at edges |
| `floor.svg` | 0 0 960 90 | sandy seabed strip drawn at y=450, tileable, opaque, pebbles/shells/sea grass |
| `rays.svg` (optional) | 0 0 960 540 | soft god-rays from the surface (transparent), drawn with additive blend |
Looks: **Spring** turquoise, pink coral, fresh green sea grass · **Summer** bright aqua shallows, sunny rays, yellow/orange corals · **Autumn** golden-amber water, orange/red kelp forest · **Winter** deep navy/indigo, pale blue corals, frosty tones.

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred)
`bubble.svg`, `plankton.svg` (tiny glowing sparkle), `fish_a.svg` + `fish_b.svg` (small school fish, tail frames, facing right), `kelp_bit.svg`, `jelly_a.svg` + `jelly_b.svg` (small glowing jellyfish pulse frames), `sparkle.svg`, `snow.svg` (sea snow flake/dot).

## 5. Code architecture (`game/js/`)
`rng.js` `world.js` `weather.js` `bot.js` **[mechanics]** · `storage.js` `assets.js` `audio.js` `render.js` `ui.js` `main.js` **[integration]**

### 5.1 `RF.World` (headless, deterministic for seed + inputs)
```js
const w = new RF.World({ seed, config });   // config overrides RF.CONFIG
w.reset();                 // level 0 (spring), score 0, full air, state 'ready'
w.startLevel(i);           // deal level i (season = i % 4, lap = floor(i/4))
w.select(cardId) → bool    // player taps a card; ignored if not selectable. 3rd tap while a mismatch is showing closes it immediately and then flips the new card.
w.cardAt(x, y) → cardId|null    // hit test in logical coords (uses current animated positions)
w.moveCursor(dx, dy); w.selectCursor();   // keyboard play (cursor jumps over gone cards)
w.update(dt);              // any dt; fixed sub-steps ≤ 1/120 s
w.drainEvents();
// state
w.state      // 'ready' (deal animation + optional peek) | 'playing' | 'cleared' (level clear celebration, then auto next level) | 'dead'
w.level, w.season /*0..3*/, w.lap, w.time, w.levelTime
w.score, w.combo, w.bestCombo, w.matches, w.mistakes, w.cupcakes
w.air, w.airMax         // seconds; 'dead' when air ≤ 0 during 'playing'
w.gravity               // {x,y} unit-ish direction for this level: spring (0,-1), summer (0,0), autumn (1,0) or (-1,0), winter (0,1)
w.cols, w.rows, w.tray  // {x,y,w,h}
w.cursor                // {col,row}
w.cards = [{ id, face /*0..11*/, col, row, x, y /*centre, animated*/, vx, vy, flip /*0 back … 1 face*/, state /*'down'|'up'|'matched'|'gone'*/, wiggle /*0..1 mismatch shake*/, glow /*0..1 match glow*/, scale, alpha }]
w.fox   = { x, y, vx, vy, angle, flipX /*±1 facing*/, frame /*'swim1'|'swim2'|'swim3'|'eat'|'oops'|'cheer'*/, mood, bob }
w.cupcakes = [{ id, x, y, vx, vy, rot, alive, scale }]   // released on match, float/drift toward Foxy, eaten when she reaches them
```
Events: `deal`, `flip {id}`, `match {ids,x,y,points,combo}`, `mismatch {ids}`, `slide {ids}`, `cupcake {x,y}` (released), `eat {x,y}`, `airlow`, `cleared {bonus,level}`, `season {season,level}`, `dead {score}`.

Rules/feel:
- Deal: cards fly in from the tray edge with stagger; Easy → peek (all face-up 2 s) before 'playing'.
- Flip is a 0.18 s eased scale-x flip (renderer draws back when flip<0.5, front when ≥0.5).
- Match: both glow, pop (scale up then shrink to 0), become 'gone'; release 1 cupcake; combo++ ; points = pointsPerMatch × min(combo, comboCap). Air refill `airPerMatch`.
- Mismatch: wiggle, Foxy 'oops', after `mismatchShow` flip back; combo = 0; mistakes++.
- **Gravity slide**: after a removal, for each affected column (vertical gravity) or row (horizontal), the remaining cards compact toward the gravity side, preserving order; target cell positions update and cards move there with gentle physics (accelerate ≈ 900 px/s² capped ~260 px/s, slight overshoot/settle bob). Cards cannot be selected while moving (or allow — your call, document it). Summer: no slide.
- Air drains 1/s; airMax per level from CONFIG (more pairs → more air); low-air warning at 25 %.
- Level cleared → bonus = round(air) × airBonusPerSec, 'cleared' 2.5 s (celebration) → next level (season advances; after winter, lap+1 with slightly less air).
- Foxy: idle swim/bob in her zone; on cupcake release she swims (smooth steering, no teleport) to it, eats (frame 'eat'), returns; faces her movement direction (flipX).

### 5.2 `RF.Weather` — same contract as Flappy: `new RF.Weather({width,height,seed})`, `setSeason(i,{instant})`, `update(dt,{current})`, `particles[] {sprite,x,y,size,rot,flipX,alpha,layer:'back'|'front',color?}`, `ambient {tint,rays,fog}`. Sprites: names from §4.3 without `.svg` (+ `'dot'` with `color`). Underwater motion: bubbles rise with wobble and grow slightly; plankton drift/twinkle; fish schools swim across in loose formation (boids-lite) alternating fish_a/b; kelp bits tumble in the current; sea snow falls slowly with depth layers; jellyfish pulse (alternate jelly_a/b) and drift up on each pulse.

### 5.3 `RF.Bot` — `new RF.Bot(world, {skill, seed})`, `bot.step(dt)`: human-like memory player: remembers seen card faces by **position** with probability ∝ skill, may lose track of cards that slid (prob ∝ 1−skill), think delay 0.3–0.9 s; skill 1 = perfect memory. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N`. `window.RF.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), select(id), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i) }`.

## 6. Customisation slots
`hero` (Foxy, all frames), `treat` (cupcake), `cardback`, `bg_spring|bg_summer|bg_autumn|bg_winter`. Same storage/processing rules as Flappy (characters ≤512 px WebP, bg ≤1280×720 JPEG, round sticker for opaque photos, rollback on storage failure).

## 7. Performance rules (apply from day one)
Pixel-exact full-screen layer draws (no stretching), render interpolation of moving things, pre-warm next season in idle time, backing store capped 1920×1080 + adaptive quality + debounced resize, gradients cached. See `projects/flappy/docs/reports/performance_report.md`.
