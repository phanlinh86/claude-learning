# Spike's Dino Jam — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.DJ`**. Classic scripts, no build step.
Sister game with proven integration code: `projects/daily-game/puff-volcano-catch` (storage, assets, audio, ui, main, mobile layer, Go wrapper, tests). Copies of its integration files are in `game/js/` and are being adapted by the integrator.

## 1. Lessons from snake games (keep / change)
| Classic Snake / slither-style | Spike's Dino Jam |
|---|---|
| Grid, 4 directions, instant 90° turns | **Smooth steering** with a turn rate (min radius ≈ 38 px) — feels like carving on a skateboard; touch-friendly (steer toward the finger) |
| Walls kill | Edges are soft bushes: Spike **bounces** off (reflect heading), no damage |
| Biting your tail = game over | A **bonk** costs a heart and breaks the trail at that point; the cut-off notes scatter and can be re-collected for 4 s |
| No escape tool | **Kickflip** hop (0.65 s airborne, 3 s recharge) jumps over the trail or a pillow |
| Endless sameness | 4 biomes, each a "song" of N notes with its own tune; clear goal every ~45–90 s |
| Nothing threatens you but yourself | **Mumbles** the tiny pterodactyl every 30 s throws 3 soft pillows with shadow telegraphs (the twist) |
| Food is abstract | Each note plays the next note of the biome tune; the trail is a bouncy melody train |

## 2. Screen & coordinates
- Logical canvas `VW × VH` (see §8; desktop default **960 × 540**). y down; px; seconds. Static scene, no scrolling.
- **World coordinates = logical canvas coordinates.** The renderer tells the world the playable rectangle with `world.setArena(x0, y0, x1, y1, avoid)`; default arena for 960×540 is `(28, 76, 932, 516)` (top 64 px is the HUD band + margin). `avoid` = list of `{x,y,r}` circles where notes must not spawn (the touch kickflip button).
- Arena edge = the inner side of the bush border. Spike's centre is kept ≥ `cfg.spikeR` inside it.
- Draw order: ground tiles → edge border → decor (back) → shadows (pillows, Spike, notes) → loose notes → trail (back to front by y) + Spike + Mumbles' pillows (y-sorted) → front particles → Mumbles (flies above everything) → fx → HUD.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search is for inspiration; never copy or trace; no known characters/brands). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px in a dark tone of the fill (never pure black), saturated but soft palette, kid-friendly: nothing scary. No `<text>`, fonts, scripts, filters with external refs, or external images. `width`/`height` = viewBox. Transparent background unless stated.
**View:** a 3/4 top-down camera (like many cozy top-down games): ground is seen from above, characters are drawn upright facing the viewer, slightly from above. Characters face **right** by default (code flips for left).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `spike_idle.svg`, `spike_happy.svg`, `spike_ouch.svg`, `spike_jump.svg` | 0 0 100 100 | 64 × 64 | Spike the hedgehog, standing on (but NOT including) the board, body facing right 3/4. **Feet line y = 88**, body centre (50, 56). Soft brown-orange spines (rounded tufts, not sharp), cream face/tummy, big eyes, tiny blush, little red sneakers, maybe a tiny cap backwards. Body geometry identical across frames; only face/arms change. happy = ^^ eyes, open smile; ouch = dizzy swirl eyes, wobbly mouth (cute, not hurt); jump = arms up, excited open mouth, knees tucked a little. |
| `board.svg` | 0 0 96 40 | 60 × 25 | skateboard seen **from above**, long axis horizontal (nose pointing right, +x), deck with grip pattern, 4 wheels peeking out. Centre (48, 20). Code rotates it by the heading. |
| `note_0.svg` … `note_3.svg` | 0 0 48 48 | 30 × 30 | musical notes, centre of mass (24, 26): 0 = single eighth note (pink), 1 = quarter note (sky blue), 2 = beamed pair (mint green), 3 = eighth note (sunny orange). Chunky, outlined, with a highlight and a tiny happy face on the note head. |
| `note_gold.svg` | 0 0 48 48 | 34 × 34 | golden beamed note with sparkle. |
| `ptera_fly1.svg`, `ptera_fly2.svg`, `ptera_throw.svg` | 0 0 140 100 | 112 × 80 | Mumbles: a tiny grumpy-cute baby pterodactyl (lilac/purple, pale belly, little crest, big eyes with a pouty brow, puffed cheeks), seen from the front-below, wings spread; body centre (70, 50). fly1 = wings up, fly2 = wings down, throw = wings forward, holding nothing, mouth "hmph". Same body geometry. NOT scary: round, small teeth-free beak. |
| `pillow.svg` | 0 0 64 48 | 44 × 33 | soft square pillow, pastel striped / polka dots, puffy corners, centre (32, 24). |
| `heart_full.svg`, `heart_empty.svg` | 0 0 48 48 | 28 | HUD |
| `flip.svg` | 0 0 48 48 | 40 | kickflip button icon: a small skateboard tilted with a curved arrow (no text). |
| `songbar.svg` | 0 0 64 64 | 44 | HUD icon: a music scroll/page with a note. |
| `icon.svg` | 0 0 256 256 | app icon | Spike on his board with two notes on a round leafy-green badge with a tiny dino silhouette; readable at 32 px. |

### 4.2 Biomes (environment artist) — `biomes/<meadow|swamp|canyon|snow>/`
| File | viewBox | Use |
|---|---|---|
| `ground.svg` | 0 0 512 512 | **opaque**, **seamlessly tileable in both x and y** top-down ground: grass texture with soft blobs (meadow), mossy ground with a few small water/puddle blobs (swamp), sandstone with cracks and pebbles (canyon), snow with soft blue shadows (snow). Low contrast, mid-tone, calm: Spike (brown/cream), notes (pink/blue/mint/orange/gold) and the trail must pop. |
| `edge.svg` | 0 0 512 72 | transparent, **horizontally tileable** border strip seen from above: bushes/ferns (meadow), reeds + lily pads (swamp), red boulders (canyon), snowdrifts + small pines (snow). The **bottom edge (y≈56–72) faces the play area**; code rotates the strip for all 4 sides of the arena. Solid enough to read as a wall. |
| `decor_0.svg` … `decor_3.svg` | 0 0 128 128 | transparent decoration props drawn on the border and the screen margins (outside the arena), feet/base at y≈112: meadow = fern clump, flower patch, mossy rock, sleepy long-neck dino head + neck peeking (friendly); swamp = lily-pad cluster, cattails, mushroom stump, small swamp dino peeking; canyon = cactus, sandstone rock, bones-free dino egg nest, horned dino peeking; snow = pine tree, snowman-ish rock pile (no face), ice crystal, fluffy dino peeking. |

Palette per biome: meadow = fresh greens + sunny yellow; swamp = teal/blue-green, misty; canyon = warm terracotta/sand, orange sky light; snow = white/ice-blue/lilac. Avoid large saturated pink/blue/mint/orange/gold areas in the ground tile (notes must read).

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred, transparent edges)
`leaf.svg`, `butterfly.svg`, `firefly.svg`, `mist.svg` (soft white blob), `dust.svg` (sandy wisp), `snow.svg` (flake), `sparkle.svg` (4-point twinkle), `feather.svg` (white fluffy pillow feather), `petal.svg` (pink petal).

## 5. Code architecture (`game/js/`)
`rng.js` `world.js` `weather.js` `bot.js` **[mechanics]** · `storage.js` `assets.js` `audio.js` `render.js` `ui.js` `main.js` **[integration]**

### 5.1 `DJ.World` (headless, deterministic for seed + inputs, fixed sub-steps ≤ 1/120 s)
```js
DJ.CONFIG = { ... }                  // all tunables with units + rationale comments
DJ.DIFFICULTY = { easy:{...}, normal:{}, hard:{...} }   // overrides of CONFIG keys
DJ.BIOMES = ['Fern Meadow','Misty Swamp','Red Rock Canyon','Snowy Peaks']
const w = new DJ.World({ seed, config });   // config overrides DJ.CONFIG
w.setArena(x0, y0, x1, y1, avoid);  // may be called any time (rotation): clamps Spike, trail is kept, notes/pillows re-placed if outside
w.reset();          // level 0, score 0, full hearts, state 'ready'; Spike at arena centre heading right, trail empty
w.startLevel(i);    // biome = i % 4, lap = floor(i / 4); clears trail/notes/pillows, keeps score/hearts
w.setDir(dx, dy);   // keyboard direction (unit-ish, or 0,0 = keep heading)
w.setTarget(x, y);  // pointer target in world coords, or null
w.action();         // kickflip if charged
w.update(dt); w.drainEvents();
// state
w.state            // 'ready' (~1.2 s, Spike rolls slowly, no boss) | 'playing' | 'cleared' (~2.4 s) | 'dead'
w.level, w.biome /*0..3*/, w.lap, w.time, w.levelTime
w.score, w.hearts, w.heartsMax, w.song /*notes collected this level*/, w.songTarget, w.notesTotal, w.bonks, w.pillowHits, w.flips, w.dodges
w.spike { x, y, heading /*rad*/, speed /*px/s*/, turn /*rad/s current*/, lean /*-1..1 visual*/, jump /*0 = grounded, else seconds airborne*/, z /*hop height px*/, flip /*0..1 charge*/, dizzy /*s left*/, invuln /*s*/, frame /*'idle'|'happy'|'ouch'|'jump'*/, facing /*1 right, -1 left*/ }
w.trail [{ x, y, kind /*0..3 colour*/, gold, z /*bounce height px*/, phase }]   // index 0 = right behind Spike
w.notes [{ id, x, y, kind, gold, t /*age*/, state /*'spawn'|'idle'|'loose'*/, life /*loose: s left*/, vx, vy, z, vz }]  // loose = scattered, fly in an arc then sit, blink before vanishing
w.boss { state /*'away'|'enter'|'hover'|'leave'*/, x, y, t, next /*s until next visit*/, frame /*'fly1'|'fly2'|'throw'*/, facing }
w.pillows [{ id, x, y /*landing spot (ground)*/, sx, sy /*throw start*/, t, dur /*flight time*/, z /*height above ground px*/, rot, state /*'fall'|'landed'*/, life }]
w.cfg; // and `_px,_py` on spike, trail items, notes, pillows and boss saved at the start of each fixed step (render interpolation)
```
Events: `start`, `biome {biome, level}` (each level start incl. 0), `note {x,y,kind,gold,points,song,index /*tune index*/}`, `bonk {x,y,hearts,lost /*notes cut*/}`, `bounce {x,y}` (edge), `flip`, `land`, `flipready`, `dodge {x,y,points}`, `bossin`, `throw {x,y}`, `pillowland {x,y,hit}`, `pillowhit {x,y,lost}`, `regrab {x,y}` (loose note re-collected, counts as `note` too), `songdone`, `cleared {bonus, level}`, `dead {score}`.

Rules / feel:
- Spike rolls forward at `speed` (normal ≈ 150 px/s level 1, +6 px/s per biome, +8 % per lap, slight +0.6 px/s per trail note, capped). Steering: desired heading from `setDir` or the target point; turn toward it at max `turnRate` (≈ 4.2 rad/s) with eased angular velocity (no snap). If the pointer target is within 24 px, keep heading (no orbiting jitter).
- Edges: when Spike's centre would leave the arena, reflect the heading component, push inside, small speed dip, `bounce` event, 0.15 s steering lock. Never stuck in corners.
- Trail: Spike records a path history (points every ~3 px); trail note i sits at arc length `(i+1) × spacing` (≈ 24 px) behind Spike along the path, with a small bounce `z` (|sin|) and phase offset → a bouncy melody train. New notes join at the end with a short pop.
- Self-collision: Spike vs trail notes with index ≥ `safeNeck` (4, easy 6), distance < `bonkR` (≈ 17, easy 14); ignored while airborne (z > 6) or `invuln`. Bonk → hearts −1, `invuln` 1.5 s, trail cut at the hit index: notes from there on become `loose` (scatter outward with an arc, re-collectable for 4 s, then pop), `dizzy` 0.6 s (steering weakened, frame 'ouch').
- Kickflip: when `flip >= 1`: airborne `jumpTime` (0.65 s, easy 0.8) with z = parabola up to ~28 px, board spins in the renderer; charge refills in `flipRecharge` (3 s, easy 2.4). Notes are still collected while airborne (generous).
- Notes: keep `notesOnField` (2 normal, 2 easy, 1 hard) idle notes; spawn ≥ 120 px from Spike, not on the trail, not in `avoid`, ≥ 40 px inside the arena, 'spawn' pop-in 0.3 s; pick radius `spikeR + 16`. 8 % golden. `songTarget` 10/14/18/22 (easy 8/11/14/17, hard 12/16/20/24) + 2 per lap.
- Boss Mumbles: first visit at `bossFirst` (12 s into each level, so level 1 meets him early but gently), then every **30 s** (`bossEvery`). Enters from a side above the arena top, hovers across over ~4 s, throws 3 pillows (0.9 s apart) aimed at Spike's predicted position + spread (first one exactly predicted, others ±70 px), then leaves. Pillow flight `dur` 1.3 s (easy 1.6) from Mumbles to the landing spot: ground shadow grows during the fall. Landing within `spikeR + 18` of a grounded Spike → `pillowhit`: dizzy 1 s, 3 notes from the END of the trail become loose (re-collectable), no heart. If Spike is airborne over it at landing → `dodge` +15. Landed pillow sits 1.5 s then puffs into feathers (no collision).
- Not in level 1's first 12 s; never in 'ready'/'cleared'. Level 1 on Normal must be very winnable for a 6-year-old (wide arena, slow speed, short song, generous neck).
- Song done → `songdone`, state 'cleared' (bonus hearts × 100, `cleared`), boss leaves, pillows vanish; next level after ~2.4 s. Hearts +1 (max heartsMax) on clear.
- Score: note = (10 + 2 × trail length) × (gold ? 3 : 1); regrab = 5.

### 5.2 `DJ.Weather` — `new DJ.Weather({width,height,seed})`, `setBiome(b,{instant})` (alias `setSeason`), `resize(w,h)`, `update(dt, {spike, boss})`, `particles[] {sprite,x,y,size,rot,flipX,alpha,layer:'back'|'front',color?}`, `ambient {tint, fog}`. Sprites from §4.3 (names without `.svg`) + `'dot'`. Meadow: butterflies wandering (flap = flipX/size wobble) + a few petals drifting; swamp: mist blobs drifting slowly (back, low alpha) + fireflies blinking; canyon: dust wisps blown sideways in gusts; snow: falling snow in 3 depth layers with sway. Bounded particle counts (< 160). Works for any canvas size (portrait up to 720×1600).

### 5.3 `DJ.Bot` — `new DJ.Bot(world, {skill, seed})`, `bot.step(dt)` drives `setDir`/`setTarget`/`action`: steers to the best note (distance, loose first), avoids its own trail with look-ahead samples along its turning arc, kickflips when a bonk or a pillow landing is imminent and can't be steered around; skill < 1 adds reaction delay + aim noise. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N`; `window.DJ.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), bossNow() }`.

## 6. Customisation slots
`hero` (Spike, all frames; the board is still drawn under the custom picture; procedural bob/lean keeps it alive), `note` (all notes use it; a coloured ring shows the kind; gold gets a gold ring), `pillow`, `bg_meadow|bg_swamp|bg_canyon|bg_snow` (replaces the ground tile: drawn as "cover" over the arena; the border strip is still drawn on top). Same storage/processing rules as the sister games. Storage prefix `sdj:`.

## 7. Performance rules (from day one)
Pre-render the whole static background (tiles + border + decor) once per biome and size into one device-pixel canvas and blit it pixel-exact; render interpolation; pre-warm the next biome in idle time; backing store capped (desktop 1920×1080, touch 3.2 MP) + adaptive quality + debounced resize; no per-frame allocations in hot loops where easy.

## 8. Mobile (iPhone / iPad) — same platform layer as `puff-volcano-catch` / education games
- **Layout:** the canvas fills the screen. Logical size: landscape ≥ 16:9 → 540 tall, width up to 1280; other landscape → 960 wide, height up to 960; portrait → 560 wide (720 when aspect ≥ 0.6), height up to 1600. Beyond the clamps it letter-boxes.
- **Arena:** the whole logical canvas minus safe-area insets, minus the HUD band at the top (64 px + inset), minus a 28 px border. The world gets it via `setArena` on every relayout.
- **Input:** Pointer Events. One steering finger with pointer capture (Spike skates toward the finger). A second finger = kickflip. On touch the kickflip button (≥ 66 CSS px) sits bottom-right; notes never spawn under it. UI buttons fire on touch `pointerup`; the ghost click is swallowed. Rotation releases the steering finger.
- **iOS:** audio unlock in the first `touchend`; `visibilitychange` pauses and suspends audio; kid-proofing (no zoom, no rubber-band, no callouts).
- **Home screen:** `manifest.webmanifest` plus 180/192/512 PNG icons from `tools/render_mobile_icons.js`.

## 9. Changes after QA (2026-10-31)
- **Contract additions from the mechanics engineer** (see `docs/MECHANICS.md`): `w._acc` for interpolation; pillows interpolate `_pcx,_pcy,_pz` (draw at `cx, cy − z`, shadow at `x, y`); events `go`, `loosegone`, `pillowpuff`; `Weather.burst(sprite,x,y,n)`.
- **Playtest tuning** (`docs/reports/playtest.md`):
  - Easy: speed0 105, safeNeck 7, bonkR 12, songs 8/10/12/14.
  - Normal: safeNeck 6, bonkR 14, songs 10/12/14/16.
  - Easy and Normal: trailSpacing 22.
  - All levels: `targetDead` 48 (fixes orbiting a note at high speed).
  - New `bounceGrace` 0.8 s: no self-bonk right after a bush bounce (0 on Hard).
- **Touch button:** pillows and loose notes are pushed out of the `avoid` circles (`World._outOfAvoid`).
- **Visual QA:**
  - two-tone, marching pillow landing ring
  - board squashed to the 3/4 view
  - Spike drawn over the first notes of his tail
  - bigger HUD on phones on a backing plate, with an 80 px HUD band
  - floating texts kept below the HUD
  - decor moved onto the bush strip
  - CSS fixes for small phones
