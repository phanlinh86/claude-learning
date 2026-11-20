# Pip's Reef Tower — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.RT`**, storage prefix **`rt:`**. Classic `<script>` files, no build
step, node-safe at load (touch the DOM lazily). The code base is a copy of `../koala-candy-cake/` (Koko's Cake Tower:
state machine, tower world, voice, input, storage, loud audio with volume, ui, main, tests) with these renames ALREADY
applied in code and tests: `CK → RT`, `ck: → rt:`, `koko → pip` (`Koko → Pip`, `pokePip`, `pipHit`, `pipScreen`, …),
`cherry → crown` (the goal; `crownPose`, `crownOn`, …), `candle → pearl` (`w.pearls`, `pearlOffsets`, `drawPearl`, …),
`bee → puffer` (`w.puffer`, `pufferTap`, `pufferScreen`, surprise type `'puffer'`). Texts, art and docs still talk about
cakes — that is what this sprint replaces. **Everything not changed here stays exactly as in
`../koala-candy-cake/docs/DESIGN.md` and `../koala-candy-cake/docs/MECHANICS.md`** (read them first).
Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Koko's Cake Tower
| Koko's Cake Tower | Pip's Reef Tower |
|---|---|
| Koko the koala baker | **Pip, a little octopus** (`pip_*`), left of the tower, 8 short arms |
| wide soft cake layers 1.3·S × 0.78·S | **shell blocks** `LW × LH`, LW = round(**1.12**·S), LH = round(**0.80**·S) (age 4: 139 × 99) |
| drag up + let go (tap = hop home + name) | **TAP TO SEND** (primary) — and drag + release still works exactly as before |
| drop with gravity 2600 | **sinking through water**: bubble lift, then slow sink with water drag, leaf-like rocking, bubble trail |
| jelly landing | soft *plonk* (squash 0.18, ζ 0.35) + a **sand puff**; the tower sways in the water (lower damping, slower) |
| cake stand | **a flat seabed rock** (`env/rock.svg`) |
| cherry on a cotton-candy cloud | **golden starfish crown** (`characters/crown.svg`) riding a **little pink jellyfish** (`env/jelly_ride.svg`) |
| candles light, Koko blows them out, sprinkles | **a glowing pearl pops up per block while counting → Pip blows bubbles → the pearls float up as bubbles and pop into sparkles + a fish school swirls** |
| honey bee | **puffer fish** (`characters/puffer.svg` normal, `puffer_up.svg` puffed round); tap → it puffs up, spins once, zooms off |
| breeze | **sea current** (same physics: `setBreeze`, `gust`, Pip `hold`) |
| animal cookies | **sea animals** `RT.ANIMALS = ['fish','crab','turtle','whale','seahorse','dolphin','jellyfish','shrimp']` |
| Candy Village sky | **underwater**: a water gradient, light rays from the surface, a wavy surface line at the top, rising bubbles |

## 2. Screen and layout (deltas)
- `CONFIG.layerW = 1.12`, `CONFIG.layerH = 0.80`; all other layout maths unchanged (uses LW/LH).
- Pip: FEET point + height as Koko (landscape `x = ins.left + 120`, `y = groundY − 4`, `h = 300/330`; portrait as Koko).
  Pip art is wider than tall-ish: viewBox 0 0 300 400 is kept, the octopus fills ≈ 300 × 330 with arms at the bottom.
- `layout.goal = { x, y /*bottom of the crown*/, cloudY /*top of the jellyfish bell*/ }`: the starfish crown (drawn 72 px
  tall) sits on the jellyfish bell top (jellyfish drawn 150 × 150, its tentacles hang below; bell top 18 px above the
  crown's bottom). The field is still called `cloudY` in code.
- The "tray" pieces rest on the sand (`groundY`). Everything else (bubble, HUD keep boxes, insets, tall portrait) unchanged.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Nemo/Dory/clownfish
  look-alikes, no SpongeBob, no Octonauts, no Finding-Nemo crab, no famous mascot). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at
  viewBox 256) in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (unchanged hex, base/dark/light)**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). `RT.PALETTE` in `content.js`.
- **Pip**: a round little octopus, body **soft peach `#F6B08E`**, shade `#E09372`, outline `#A85E45`,
  **cream spots `#FCE3D2`** on the head, suckers on the arm undersides `#FCD9C6`, eyes `#2F2A3A` with big catch-lights,
  rosy cheeks `#F58C8C`, and a **mint diving mask `#9ED8CB` / strap `#5FA597` pushed up on her forehead**. Head ≈ 55 %
  of height, 8 short curly arms (front 4 visible clearly, back ones peeking). Never an answer colour. Facing RIGHT
  (towards the tower).
- **Shell blocks** (drawn by code in `block_art.js`): a chunky rounded block seen from the front with a thin top face
  (pseudo-3D, top 14 % of LH), corner radius 0.2·LH, **a scalloped shell ridge along the top edge** (5–7 bumps, pattern by
  block id) and 2–3 soft ridge lines fanning on the front, a tiny barnacle/pearl detail in one corner. *Colour* blocks:
  the whole block in the answer colour (base front, light ridges/top, dark 5 px outline). Other blocks: **sand-stone
  `#F3DDB2` / top `#FBEFD4` / outline `#B98A4E`** with a decoration on the front: shape (in its colour, dark outline), dots
  (small **pearl dots** `#FFFFFF` with a grey-lilac rim `#9C95B8`, dice layout — readable on sand), numeral (dark teal
  `#1F5E6B`, bold rounded), animal sticker (`items/animal_<x>.svg`), letter / text (dark teal). Ages ≤ 4: shapes in
  different colours; below age 5 never blue+purple, red+green, yellow+orange, green+orange in one choice set.
- **Underwater world**: CALM and PASTEL (saturation ≤ 45 %, lighter than the answer colours; blue-green but the BLUE
  answer colour must stay distinct — the background is teal/aqua and pale, never `#3C8DE8`-like): soft coral mounds in
  muted peach/lilac/sage, swaying seaweed in sage `#8FBF9F`, sand dunes `#F1E2BE` / `#E3CC9C`, shells and pebbles, a
  sunken little anchor far away. Ground: a smooth pale sand floor, calm in the middle band where blocks rest.
  Water gradient (ambient skyTop → skyBottom): sunny `#7FD0E3 → #DDF4EC`, breezy `#88C7DA → #D5EDE4`,
  rain `#6C93AB → #BCD1D6` (darkness 0.15), rainbow `#86D2E8 → #E9F6EA`.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & UI — character artist A (generator `tools/art_pip.py`)
| File | viewBox | Notes |
|---|---|---|
| `characters/pip_{idle,blink,talk,happy,cheer,think,oops,hold,blow}.svg` | 0 0 300 400 | Pip 3/4 view facing RIGHT, **feet anchor (150, 392)** (= the bottom of the curled arms), identical body/arms base in every frame; happy = big smile; cheer = two arms up waving, eyes closed smile; think = head tilt, an arm-tip on chin; oops = "hmm?" head tilt (never sad); talk = mouth open; **hold = two arms reaching forward to the right, tips at x ≈ 290, y ≈ 170 (steadying the tower)**; **blow = puffed cheeks, round "o" lips pointing right at (265, 150), eyes closed** |
| `characters/pip_full_wave.svg` | 0 0 300 400 | title pose (one arm raised, waving) |
| `characters/crown.svg` | 0 0 80 90 | a chubby golden starfish (warm gold `#F5B83D` / dark `#B67A16` / light `#FFE29A`, glossy, little sparkle dots, a tiny smile) — must not read as answer yellow: deeper golden-amber with texture dots; **bottom anchor (40, 86)** |
| `characters/puffer.svg`, `characters/puffer_up.svg` | 0 0 120 100 | friendly little puffer fish (soft lime-cream `#E8E2A4` back, cream belly `#FFF6DE`, brown speckles, NOT an answer colour), normal (oval, small fins) / puffed (round ball, soft round spikes, surprised happy face), facing LEFT |
| `characters/pearl.svg` | 0 0 48 48 | a glowing pearl on a tiny open shell (pearl white-lilac `#F6F3FF` with pink-blue sheen; shell cream `#F8E6D0`); centre of the pearl at (24, 22), bottom anchor (24, 46) |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Pip beside a 3-block shell tower (red, yellow, blue) with the starfish on top, underwater background with light rays, full-bleed |

### 4.2 Shell blocks & sea animals — character artist B
- `items/animal_<x>.svg` (0 0 128 128) for `RT.ANIMALS`: each a friendly sea-animal face/body sticker (white sticker
  border, rosy cheeks) readable at 60 px, every animal instantly distinct by silhouette: fish (simple round fish, NOT
  orange-white stripes), crab (two big claws), turtle (shell pattern), whale (big round with water spout), seahorse
  (curly tail, snout), dolphin (beak + dorsal fin), jellyfish (bell + wavy tentacles), shrimp (curled with long antennae).
  Each animal's main colour should NOT be a pure answer colour (soft tints are fine). Generator `tools/art_animals.py`.
- **`game/js/block_art.js`** → `RT.BlockArt` (same API as Koko's, re-drawn):
  ```
  RT.BlockArt.drawBlock(ctx, block, LW, LH, opt)  // a shell block; origin = CENTRE; opt: { glow 0..1, lift 0..1, dpr, id (ridge seed), img(name) }
  RT.BlockArt.drawGhostHand(ctx, size, t)         // friendly pointing hand (hint) — keep; it now TAPS (bobs down/up)
  RT.BlockArt.drawPearl(ctx, h, lit 0..1, out 0..1, t)  // origin = pearl BASE; lit → soft glow halo + twinkle; out 0..1 → the pearl lifts (−1.2·h), wrapped in a bubble, fading
  RT.BlockArt.drawPlate(ctx, w, h)                // a flat sandy shell tray under the 2nd row of pieces (origin = top-centre)
  RT.BlockArt.drawSprinkle(ctx, len, color, rot)  // confetti → draw a tiny FISH (len = body length) tinted color, facing rot
  RT.BlockArt.drawBubble(ctx, r, a)               // NEW: a soap-like water bubble of radius r (thin rim, highlight, alpha a) — used for the lift bubble and trails
  RT.BlockArt.drawGlow(ctx, w, h, t, strength)
  RT.BlockArt.COLORS = RT.PALETTE
  ```
  `block = { kind, value, color?, shape?, n?, text?, animal?, size? }` as before. Cache static faces per
  (key, LW, LH, dpr, seed) in offscreen canvases. Shapes: `RT.SHAPES` unchanged.

### 4.3 Environment — environment artist (generator `tools/art_env.js`)
- `env/far_<m>.svg` (0 0 1200 420), `env/mid_<m>.svg` (0 0 1200 380), `env/ground_<m>.svg` (0 0 1200 260) for
  `m ∈ sunny|breezy|rain|rainbow`: horizontally tileable, bottom-anchored, transparent above. far = hazy distant reef
  silhouettes (pale, blue-green, low contrast); mid = coral mounds, sea fans, seaweed clumps, rocks with shells, a small
  sunken anchor; ground = pale sand floor with ripples, a few shells/pebbles at the edges (calm middle band).
  breezy: seaweed and sea fans leaning right; rain: darker, greyer; rainbow: brighter, a few glowing anemones.
- `env/rock.svg` (0 0 260 120): flat-topped seabed rock with a little sea grass and a shell — top flat surface at
  **y = 18** across x 20–240; anchor bottom-centre (130, 116). Soft grey-lilac stone `#C9C3D6` / `#A79FBA`, not an answer colour.
- `env/jelly_ride.svg` (0 0 200 200): a little friendly pink jellyfish (pale pink-lilac `#F6D3EA` / `#E2AACB`, translucent
  feel, happy face, wavy tentacles hanging down) — the crown sits on the top centre of its bell at **(100, 30)**.
- `env/sun.svg` (0 0 200 200) → a soft round **sun glow seen through the water** (pale yellow-white, very soft edge).
- `env/rays.svg` (0 0 600 700): 4–6 soft diagonal light rays (white, alpha ≤ 0.35, gradient fading downwards).
- `env/surface.svg` (0 0 1200 90): tileable wavy water surface band (lighter cyan line with soft highlight ripples,
  transparent below); drawn at the very top of the screen.
- `env/rainbow.svg` (0 0 1200 600): soft pastel arc (seen above the surface, drawn semi-transparent at the top).
- `env/cloud_{a,b,c}.svg` (0 0 320 170) → reinterpret as **soft drifting plankton/light patches** (very pale, alpha) —
  weather.js still moves "clouds"; `env/cloud_rain.svg` → a darker grey-blue shadow patch.
- Particles (0 0 32 32): `sparkle`, `sugar` → **`bubble`** (small water bubble ring), `wrapper_a`, `wrapper_b` → **a small
  seaweed leaf / a drifting sea-grass bit**, `blossom` → **plankton speck (pastel)**, `raindrop` → **a falling drop streak
  seen above / just a soft white streak**, `splash` → **a surface ripple ring**, `puff` → **sand puff**, `dust` → **sand
  grain**, `confetti_a`, `confetti_b` (white, tinted by code: a tiny fish / a round bubble), `star` (registered as `pstar`).
  Keep the FILE NAMES `sugar, wrapper_a, wrapper_b, blossom, raindrop, splash, puff, dust` so weather.js keeps working,
  and ADD `bubble.svg`.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `block_art.js` | character artist B |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | lead |

### 5.1 Content (`content.js`) — deltas
```
RT.ANIMALS = ['fish','crab','turtle','whale','seahorse','dolphin','jellyfish','shrimp']
RT.ANIMAL_SOUND = { crab:'claws', turtle:'shell', whale:'spout', seahorse:'tail', fish:null, dolphin:null, jellyfish:null, shrimp:null }
```
`RT.ANIMAL_SOUND` keeps its name and the `p.sound` prompt key, but now holds **clue ids** ("Who has big claws?"); a null
clue is never asked. `params.sound` = the clue id. Age-6 "first letter" word table (`WORD_OF`) updated for the new animals
(en: fish, crab, turtle, whale, seahorse, dolphin, jellyfish, shrimp; vi: cá, cua, rùa, cá voi, cá ngựa, cá heo, sứa,
tôm) — the generator must keep initials unique inside one choice set (VI: many start with C — the self-check guarantees it).
`round.surprise`: `null | 'breeze' | 'puffer'`.

### 5.2 `RT.World` — deltas
- **Tap to send.** `pointerUp` on a piece with a TAP (moved < 24 px, < 0.35 s) in phase `ask`, piece free, not locked →
  `this._send(p)` and emit `{type:'tapPiece', … , send:true}` and then `{type:'drop', pieceId, x, y, right, via:'tap'}`
  (main says the name on `tapPiece` and treats `drop` exactly as a drag drop). `_send(p)`: the piece gets
  `p.bubble = 1` (wrapped in a lift bubble), flies on a smooth arc (≈ 0.55 s, ease-in-out, apex above the drop point,
  `p.state = 'lift'`) to `dropPoint` (above the tower top), the bubble pops (event `bubblePop {x, y}`), then the normal
  fall/land or bounce logic runs from there (right → lands, wrong → bonks off the tower and drifts home as today).
  The *hint* ghost hand now shows a TAP on the right piece (no drag path). The old tap-assist stays harmless.
- **Water physics for the fall** (`_startFall` onward): gravity `gWater` ≈ 900 px/s², quadratic drag to a terminal
  speed ≈ 420 px/s, a leaf-like rocking `rot = A·sin(2π·1.3·t)` with A 0.12 rad decaying as it nears the top, a small
  side sway ±6 px, steer to the landing x (spring) — it must still land within `landWithin`. Emit `trail {x, y}` every
  ≈ 0.09 s while sinking or lifting (render spawns little bubbles). Landing: squash `landSquash 0.18`, `squashZeta 0.35`,
  event `land` gets `{… , sand:true}` (render spawns a sand puff). Tower sway: `swayK 14`, `swayC 1.9` (slower, more
  watery) but the never-falls caps stay. Home arcs/bounces use `gWater`-like slower ballistic motion (g ≈ 1500).
- Deal: new pieces **drift down from above** into their slots (sinking, slight rock) instead of dropping.
- `w.goal` as Koko's (float-in, bob ±4 px, 1.1 Hz — a jellyfish pulse `goal.pulse` 0..1 at 0.9 Hz for the renderer).
- `w.pearls = [ { i, lit 0..1, out 0..1, x } ]` exactly as Koko's candles; `out` now means the pearl floats up.
- **done** sequence: `towerDone {n}` → `crown` (starfish drops from the jellyfish onto the top with a squash, the
  jellyfish swims up and away; `goal.state 'on'`) → `count {i}` every 0.45 s (block i glows, pearl i pops up and lights)
  → `blow` (Pip mood `blow` 0.9 s; a soft water push makes the tower sway a little) → `pearlsOut` (pearls float up as
  bubbles) → `sprinkles` (renderer: fish school + bubbles) → `roundDone`. **clear**: the blocks (top first, crown with the
  top one) float up and away in bubbles (`clearBlock {i}`).
- Surprise `breeze` (sea current) unchanged physics; `puffer` replaces the bee: `w.puffer = {x, y, t, state, flap}`;
  the puffer swims in from the right, hovers near the tower top, swims out. Tap → state `'loop'`: it puffs up
  (`w.puffer.puff` 0..1 → render uses `puffer_up`), spins one loop, deflates and zooms off right. Events `puffer`,
  `pufferTap {x, y}`.
- Events otherwise unchanged (`round`, `deal`, `ask`, `grab`, `tapPiece`, `drop`, `land`, `stack`, `wrong`, `miss`,
  `hint`, `idle`, `pokePip`, `level`, `talk`, `talkAsk`, `talkResult`, `levelDone`, `sessionDone`) + new `bubblePop`, `trail`.

### 5.3 `RT.Weather` — same API/fields. Under water: `ambient.skyTop/skyBottom` = water gradient (§3), `sun` = light-ray
strength, `wind` = current strength (breezy ≈ 0.8 with surges), `rain` → drops hitting the **surface** (`splash`
particles = ripple rings at y ≈ ins.top + 20..60) and a darker tone, `rainbow` 0..1. Particles: ALWAYS a few `bubble`s
rising from the sand and from Pip; sunny plankton specks drifting slowly; breezy seaweed bits + plankton flowing
sideways; rain ripples at the surface + slower greyish specks; rainbow sparkles + bubbles; `party()` = fish confetti
(`confetti_a`) + bubbles + sparkles. Particles move with water feel (slow, drifting, rising — nothing falls fast). Cap 120.

### 5.4 `RT.Bot` — taps the right piece (uses `pointerDown/pointerUp` at the piece centre) most of the time, drags
sometimes; taps the puffer sometimes.

### 5.5 Test hooks — as Koko's with `pipScreen()`, `pufferScreen()`; World `pipHit()`.

## 6. Voice, language — helper **Pip** (written and spoken "Pip" in both languages; VI "bạch tuộc Pip"), a cheerful
little octopus girl: pitch ≈ 1.2, rate ≈ 0.9. Sea animals (VI with classifier): fish "con cá", crab "con cua", turtle "con
rùa", whale "con cá voi", seahorse "con cá ngựa", dolphin "con cá heo", jellyfish "con sứa", shrimp "con tôm".
Clues (`p.sound`): claws "Who has big claws? Find that block!" / "Bé ơi, bạn nào có đôi càng to nhỉ?", shell "Who
carries a shell on its back?", spout "Who sprays water up high?", tail "Who has a curly tail?".
- `p.colors` "Find the {color} block!" / "Bé ơi, tìm khối màu {color} nhé!", `p.shapes` "Put the {shape} block on top!",
  `p.countUp` "Block number {n}!", `p.count` "Find the block with {n} pearls!", `p.animals` "Find the {animal} block!",
  `p.size` "Find the {size} block!", letters etc. as before. 3 wordings each. Tapping is the verb ("Tap the …" may appear).
- `sayStack` names the block and counts the tower ("Red! Two blocks tall!" / "Màu đỏ! Tháp cao hai tầng rồi!"),
  `sayWrong` ("Bloop! That's the blue block. Let's find red!"), `sayTap`, `count.<n>`, `towerDone[]` ("We reached the
  starfish!"), `pearls[]` (replaces candles: "Pearls! Let's count them!"), `blow[]` ("Bubbles… fffff!"), `hint[]`,
  `idle[]`, `praise[]`, `great[]` with `{child}`, `talk.*`, `weather.0..3` ("Sunny day under the sea!", "Whoosh, a sea
  current! Hold on, tower!", "Pitter-patter, rain on the waves!", "Look, a rainbow above the waves!"), `surprise.breeze`,
  `surprise.puffer`, `puffer.tap` ("Puff! Look how round! Bye-bye, puffer fish!"), `gust` ("Whoa, a current! I've got
  it!"), `deal[]` ("Let's build a tower up to the starfish!"), `topic.*`, `session.done`, `ui.*` incl. `ui.volume`, logo
  lines "Pip's" / "Reef Tower", VI "Bạch Tuộc Pip" / "Tháp San Hô".
- Remove every cake/koala/cherry/candle/bee/sprinkle/candy/cookie/bake word from the texts.

## 7. Integration (lead) — title (Pip waving beside a 3-block tower with the starfish), settings with volume, HUD,
bubble, pause with −/+, chapter banner, Talk time, session done (rainbow party: fish confetti, bubbles, Pip cheering).
Render: water gradient, rays, surface band, far/mid/ground layers, rising bubbles, lift bubble around a sent piece,
bubble trails, sand puffs, jellyfish + crown, pearls, fish school, puffer. Audio: loud chain; SFX: bloop (bubble lift),
pop, plonk landing (pitch rises per block), bonk, whoosh, count chimes, pearl ding, bubble stream (blow), fish swirl
twinkle, puffer boing-puff, star dings, fanfare; ambience per weather (underwater hum + bubbles / current whoosh /
muffled rain / sparkly); music per weather.

## 8. Performance — ≤ 6 blocks, ≤ 4 pieces, cached block faces, ≤ 160 particles; adaptive quality as before.
