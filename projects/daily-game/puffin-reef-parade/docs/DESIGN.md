# Dottie's Reef Parade — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.RP`**. Classic scripts, no build step.
Scaffold: this game started as a copy of `projects/daily-game/spike-dino-jam` (same genre, proven snake engine, mobile layer, Go wrapper, tests). Internal field names were kept where they still fit (`w.hero` = Dottie, `w.notes` / `note` events = sea stars on the sand, `w.trail` = the parade, `biome` = season) so the tested code stays intact.

## 1. Lessons from snake games (keep / change)
| Classic Snake / slither-style | Dottie's Reef Parade |
|---|---|
| Grid, 4 directions, instant 90° turns | **Smooth swimming** with a turn rate (min radius ≈ 36 px), touch-friendly (swim toward the finger) |
| Walls kill | Reef edges are soft coral: Dottie **bounces** off, no damage |
| Biting your tail = game over | A **bonk** costs a heart and breaks the parade; cut-off stars drift and can be re-collected for 4 s |
| No escape tool | **Flip** (0.65 s somersault up toward the surface, 3 s recharge) passes over the parade |
| Endless sameness | 4 seasons, each a "song" of N stars with its own tune; a clear goal every ~45–90 s |
| Food just sits there | The **golden sea star** (the twist) pops out of the sand and scoots away — a little chase worth 5 |
| Food is abstract | Each star plays the next note of the season's tune |

## 2. Screen & coordinates
- Logical canvas `VW × VH` (desktop default **960 × 540**; mobile rules §8). y down; px; seconds. Static scene.
- **World coordinates = logical canvas coordinates.** `world.setArena(x0, y0, x1, y1, avoid)`; default `(28, 76, 932, 516)`. `avoid` = `{x,y,r}` circles (the touch flip button) where stars never spawn.
- The camera looks **down through the water** at the sandy sea floor. "z" = height above the sand (toward the surface/camera): Dottie swims at a small cruising height and her soft shadow sits on the sand under her; a flip lifts her higher (shadow shrinks and fades).
- Draw order: sand tiles → coral edge border → decor → light caustics (render) → shadows → loose stars → parade + Dottie (y-sorted) → front particles → fx → HUD.

## 3. Art style guide (ALL art agents)
Original hand-written SVG only (web search is for inspiration; never copy or trace; no known characters/brands). Flat cartoon, rounded shapes, big friendly eyes, one-step cel shading + one highlight, outline ≈ 3 px in a dark tone of the fill (never pure black), saturated but soft palette, kid-friendly: nothing scary. No `<text>`, fonts, scripts, filters with external refs, or external images. `width`/`height` = viewBox. Transparent background unless stated.
**View:** 3/4 top-down (sea floor seen from above; characters drawn as if seen from slightly above, readable). Dottie faces **right** by default (code flips for left).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn size | Anchor / notes |
|---|---|---|---|
| `puffin_idle.svg`, `puffin_happy.svg`, `puffin_ouch.svg`, `puffin_jump.svg` | 0 0 100 100 | 64 × 64 | **Dottie**, a chubby round Atlantic-puffin-style bird swimming underwater, body horizontal-ish (swimming pose, slightly tilted up), facing right: black-navy back (use deep navy `#1f2a44`-ish, never pure black), white round face and tummy, big friendly eye, the famous colourful triangular beak (orange/coral with a yellow-grey band — rounded, cute), orange webbed feet trailing behind, short wings used as flippers. A tiny trail of 2–3 bubbles from the beak is OK. **Body centre (50, 52)**, the drawing must fit a 76 px circle around it. Body geometry identical across frames; only face and wings change. idle = wings mid-stroke, happy = ^^ eyes + open smile, wings up; ouch = dizzy swirl eyes, wobbly mouth (cute, not hurt), feathers puffed a little; jump = somersault-ready: wings spread wide, excited open beak. |
| `star_0.svg` … `star_3.svg` | 0 0 48 48 | 30 × 30 | chunky 5-armed sea stars with rounded arm tips, centre (24, 24), little dotted texture + tiny happy face. 0 = coral pink `#ff7aa8`, 1 = sky blue `#5ec8ff`, 2 = mint `#5fe0a8`, 3 = lavender `#b48cff`. Strong outline + highlight so they read on sand. |
| `star_gold.svg` | 0 0 48 48 | 36 × 36 | golden sea star with sparkle glints and an excited face; must be clearly richer than the 4 normal stars. |
| `heart_full.svg`, `heart_empty.svg` | 0 0 48 48 | 28 | HUD (a cute heart; the empty one is a pale outline). |
| `flip.svg` | 0 0 48 48 | 40 | flip-button icon: a tiny puffin silhouette inside a curved looping arrow (no text). |
| `songbar.svg` | 0 0 64 64 | 44 | HUD icon: a scallop shell with a small sea star on it. |
| `icon.svg` | 0 0 256 256 | app icon | Dottie with two sea stars following her, on a round turquoise-water badge with a coral silhouette; readable at 32 px; **opaque full-bleed background** (used for iOS icons). |

### 4.2 Seasons (environment artist) — `biomes/<spring|summer|autumn|winter>/`
| File | viewBox | Use |
|---|---|---|
| `ground.svg` | 0 0 512 512 | **opaque**, **seamlessly tileable in x and y**: top-down sandy sea floor with soft ripple lines, a few pebbles/tiny shells, gentle blobs. Low contrast, mid-tone, calm. Spring = pale golden sand with a hint of peach; summer = bright pale turquoise-white sand; autumn = warm amber/ochre sand; winter = cool blue-grey sand. Avoid large saturated pink/blue/mint/lavender/gold areas (stars must pop), and keep it distinct from Dottie (navy + white + orange). |
| `edge.svg` | 0 0 512 72 | transparent, **horizontally tileable** reef border strip seen from above; **bottom edge (y≈56–72) faces the play area**; code rotates it for all 4 sides. Solid enough to read as a wall. spring = pink/peach branching coral + anemones; summer = brain coral, bright fan coral, sea grass; autumn = kelp holdfasts + orange sponges + brown rocks; winter = icy blue rocks, pale blue soft coral, a dusting of frost. |
| `decor_0.svg` … `decor_3.svg` | 0 0 128 128 | transparent props drawn on the border/margins, base at y≈112. spring: anemone with a clownfish-like (original) little fish, pink coral bush, clam with a pearl, seahorse; summer: sea turtle peeking (friendly), fan coral, sea-grass tuft, sandcastle-like rock; autumn: kelp clump, orange sponge, hermit crab, friendly octopus peeking; winter: icy rock pile, glowing soft coral, a friendly narwhal-ish/seal pup peeking, blue starfish-free shell cluster. |

### 4.3 Particles — `particles/` (viewBox 0 0 32 32 unless stated, centred, transparent edges)
`bubble.svg` (clear bubble with highlight), `spawn.svg` (pink coral-spawn speck, soft), `fish.svg` (tiny side-view fish facing right, yellow), `ray.svg` (**viewBox 0 0 64 256**: soft vertical light shaft, white→transparent), `kelp.svg` (kelp leaf blade), `snow.svg` (marine-snow fleck, soft white), `jelly.svg` (tiny cute glowing jellyfish, soft pink-lilac), `sparkle.svg` (4-point twinkle), `sand.svg` (sandy puff).

## 5. Code architecture (`game/js/`)
`rng.js` `world.js` `weather.js` `bot.js` **[mechanics]** · `storage.js` `assets.js` `audio.js` `render.js` `ui.js` `main.js` `extras.js` **[integration]**

### 5.1 `RP.World` (headless, deterministic for seed + inputs, fixed sub-steps 1/120 s)
Same API as before (see `docs/MECHANICS.md` for details); the **boss and pillows are removed** and the golden star is added:
```js
RP.CONFIG, RP.DIFFICULTY {easy, normal, hard}, RP.BIOMES = ['Spring Bloom','Summer Shallows','Autumn Kelp','Winter Glow']
const w = new RP.World({ seed, config }); w.setArena(x0,y0,x1,y1,avoid); w.reset(); w.startLevel(i);
w.setDir(dx,dy); w.setTarget(x,y|null); w.action(); w.update(dt); w.drainEvents(); w.getState();
w.state 'ready' | 'playing' | 'cleared' | 'dead';  w.level, w.biome, w.lap, w.time, w.levelTime
w.score, w.hearts, w.heartsMax, w.song, w.songTarget, w.notesTotal, w.bonks, w.flips, w.golds, w.goldMissed
w.hero  { x, y, heading, speed, turn, lean, jump, z, flip, dizzy, invuln, frame 'idle'|'happy'|'ouch'|'jump', facing }
w.trail [{ x, y, kind, gold, z, phase, pop }]          // parade, index 0 right behind Dottie
w.notes [{ id, x, y, kind, gold, t, state 'spawn'|'idle'|'loose'|'flee'|'hide', life, vx, vy, z, vz, heading }]
```
- **Golden star**: at most one at a time (a `notes` item with `gold: true`, `state: 'flee'`). First appearance `goldFirst` (10 s of 'playing' per level), then `goldEvery` (18 s) after the previous one is caught or hides. Spawn ≥ 160 px from Dottie. It pops out of the sand ('spawn' 0.4 s), then scoots with a gentle wander: target speed `goldSpeed` (≈ 0.42 × Dottie's speed, Easy 0.32), turning away from Dottie when she is within `goldFear` (≈ 170 px), wall-aware (never pinned in a corner: slides along walls and darts sideways when cornered), wobbling heading. Lifetime `goldLife` 9 s (Easy 11), the renderer blinks it when `life < 2`; then `state 'hide'` 0.5 s burrow, `goldhide` event, removed. Catching it: song += `goldWorth` (5, capped at songTarget), points = star points × `goldMul` (5), one golden star joins the parade, events `note {gold:true, points, worth:5}` + `gold {x,y,points}`. Normal stars never spawn gold (`goldChance` 0). Each parade item carries `worth` (1, gold 5); a golden star that gets cut off by a bonk stays gold and keeps its worth when re-grabbed (regrab points stay 5).
- Normal stars: unchanged rules (see MECHANICS). `w.song` = sum of `worth` over the parade (the song *is* the parade), so a bonk lowers it and regrabs restore it.
- Events: `start`, `biome`, `go`, `note`, `gold`, `goldspawn {x,y}`, `goldhide {x,y}`, `regrab`, `bonk`, `bounce`, `flip`, `land`, `flipready`, `loosegone`, `songdone`, `cleared {bonus, level}`, `dead {score}`. (Removed: `bossin`, `throw`, `pillow*`, `dodge`.)

### 5.2 `RP.Weather` — `new RP.Weather({width,height,seed})`, `setBiome(b,{instant})`, `resize(w,h)`, `update(dt, {hero})`, `burst(sprite,x,y,n)`, `particles[] {sprite,x,y,size,rot,flipX,alpha,layer:'back'|'front'}`, `ambient {tint, fog}`.
Spring: pink coral-spawn specks drifting **up** slowly with sway + small fish schools (3–6 fish swimming together across, back layer); summer: 3–5 `ray` light shafts swaying slowly (back, low alpha) + bubbles rising (wobble, speed up a bit as they rise) + a fish school; autumn: kelp leaves drifting sideways in a current that slowly changes, tumbling (pendulum + rotation); winter: marine snow in 3 depth layers sinking slowly + 2–3 jellies pulsing (bell squeeze, slow rise between pulses). Dottie leaves a few bubbles when she turns hard or flips (`burst('bubble',…)` from render on events is fine too). Bounded (< 160). Works for any canvas size (portrait up to 720×1600).

### 5.3 `RP.Bot` — `new RP.Bot(world, {skill, seed})`, `bot.step(dt)`; steers to the best star (golden first when reachable, loose next), avoids its parade with look-ahead along its turning arc, flips when a bonk is imminent; skill < 1 adds reaction delay + aim noise. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&skill=S&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N`; `window.RP.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), goldNow() }`.

## 6. Customisation slots
`hero` (Dottie, all frames; procedural bob/flap/lean keeps it alive), `note` (the sea star: all stars use it, a coloured ring shows the kind; gold gets a gold ring + sparkle), `bg_spring|bg_summer|bg_autumn|bg_winter` (replaces the sand tile, drawn as cover over the arena; the reef border is still drawn on top). Storage prefix `prp:`.

## 7. Performance rules
Pre-render the static background (tiles + border + decor) once per season and size, blit pixel-exact; render interpolation; pre-warm the next season in idle time; backing store capped (desktop 1920×1080, touch 3.2 MP) + adaptive quality + debounced resize.

## 8. Mobile (iPhone / iPad)
Unchanged from the scaffold (`spike-dino-jam`, already on the shared mobile layer): canvas fills the screen; logical size landscape ≥ 16:9 → 540 tall (width ≤ 1280), other landscape → 960 wide, portrait → 560 wide (720 when aspect ≥ 0.6); arena = canvas − safe areas − HUD band − 28 px border; one steering finger with capture, second finger = flip, flip button ≥ 66 CSS px bottom-right on touch; `apply.py` audio patch + extras.js (Volume slider, Score Card).

## Character art notes
Generated by `node tools/art-characters/gen.js`; QA sheet: `node tools/art-characters/sheet.js [dir] [png] [small|big|anchors|composed|cb|all]` (default `tests/out/art/characters_sheet.png`).
- **Dottie** (`puffin_*`, 100×100): body ellipse (46,56) rx27 ry19 rot −12 + head circle (63,39) r17 + tail → visual centre ≈ (50,52), identical in all frames. Beak hinge (74,41.5), tip (87,41.5). Feet trail to x≈10 (a few px outside the 76 px circle on the left); everything else fits. Faces right. Palette: navy `#1f2a44` (hi `#3a4f7d`, line `#0e1528`), white `#ffffff` / shade `#d5dfec`, beak `#ff7a3d` + yellow band `#ffd23f` + blue-grey plate `#9fb2c6` (line `#8e3414`), feet `#ff9a3c` (line `#9a4a12`), eye `#1b1f33` with coral ring `#ff6b5a`, blush `#ff9eb0`. `ouch` adds two small puffed crest tufts and dizzy sparkles above the head (outside the body geometry).
- **Stars** (48×48, centre (24,24), arm tip radius 17.4): each kind has its own white-ish pattern so it doesn't rely on hue — 0 pink `#ff7aa8` = dots, 1 blue `#5ec8ff` = stripes across the arms, 2 mint `#5fe0a8` = ring round the face, 3 lavender `#b48cff` = pale arm-tip caps. Gold `#ffd23f` (gradient, glow halo, rivet dots, 3 sparkles, open-mouth face), tip radius 18.4.
- `icon.svg` is opaque full-bleed (deep-sea gradient `#2fb6c9`→`#0b4f78`); `tools/render_mobile_icons.js` background changed to match.

## Environment art notes (environment artist)
Generated by `tools/art-environment/gen.js` (seeded, deterministic); QA sheets by `tools/art-environment/sheet.js` → `tests/out/art/` (3×3 ground seam test, 3× edge strip with the renderer's 3-row outward stacking, 960×540 scene mirroring `render.js` background(), decor sheet, particle sheet on the 4 sands).

| Season | Sand base / blobs | Ripple groove / crest | Reef edge (wall / lumps / accents / outline) | Decor 0–3 |
|---|---|---|---|---|
| spring | `#e9cf9f` / `#e4c595` `#eed6aa` + peach `#eebf9c` | `#cfae7c` / `#f6e2bd` | `#b4645f` / `#c87a74` / peach coral `#f4a07e`, anemones `#e88a6c` `#d98aa4` / `#8a3f44` | anemone + little fish, peach coral bush, clam with pearl, seahorse |
| summer | `#dcefe6` / `#d3e9df` `#e5f4ec` | `#b4d3c8` / `#f6fcf8` | `#5e9f98` / `#7fb7ae` / brain coral `#e2d2a6`, fan coral `#f0866a`, sea grass `#62b07a` / `#2f6a66` | turtle peeking, fan coral, sea-grass tuft, castle rock |
| autumn | `#cf9f62` / `#c8975a` `#d6a96d` | `#ad7c44` / `#e3bb84` | `#6e4c34` / `#8f6a4c` / kelp `#a8843c`, sponges `#ee9a46` / `#4e3220` | kelp clump, orange sponge, hermit crab, octopus peeking |
| winter | `#bac6d1` / `#b2bfcb` `#c3ced8` | `#98a8b8` / `#dde6ee` | `#6f90b0` / `#8fb0cc` + frost caps `#f4f9fd`, soft coral `#cfe4f4` / `#3e5a7a` | icy rock pile, glowing soft coral, seal pup peeking, shell cluster |

- Ground: low-contrast blobs + soft S-shaped ripple dashes + pebbles + tiny pale shells (no star-shaped marks, so nothing on the sand looks collectible). Extras: summer tiny sea-grass sprouts, autumn 4 faded kelp bits, winter settled marine-snow specks.
- Edge: solid wall band to y≈46 (so the renderer's 3 stacked rows read as one reef mass), inner row of outlined lumps at y≈44–62, soft contact shadow to y≈68.
- Deviations: winter decor 2 is a seal pup (not a narwhal); the season dark fill colours used behind the strips in `render.js` (`BIOME_INFO[].dark`) should become spring `#7a3f3a`, summer `#2f6a6a`, autumn `#5a3a22`, winter `#34485e`. The gold star is the weakest contrast on autumn amber sand: keep its dark outline/ring strong. `assets.js` still lists the old biome/particle names and must be switched to `spring|summer|autumn|winter` and the new particle set (integration).
