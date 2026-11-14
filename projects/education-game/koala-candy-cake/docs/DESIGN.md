# Koko's Cake Tower — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.CK`**, storage prefix **`ck:`**. Classic `<script>` files, no build
step, node-safe at load (touch the DOM lazily). The code base is a copy of `../giraffe-jungle-tower/` (Lulu's Jungle
Tower: state machine, tower-stacking world, voice, input, storage, loud audio with volume, ui, main, tests) with
`JT → CK`, `jt: → ck:` already replaced. **Everything not changed here stays exactly as in
`../giraffe-jungle-tower/docs/DESIGN.md` and `../giraffe-jungle-tower/docs/MECHANICS.md`** (read them first). The tower
world is re-skinned into a cake world and gets a new finale, a bee and a weather cycle.
Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Lulu's Jungle Tower
| Lulu's Jungle Tower | Koko's Cake Tower |
|---|---|
| Lulu the giraffe calf (`lulu_*`), tall | **Koko the koala baker** (`koko_*`), short and round, left of the cake |
| square wooden blocks S×S | **wide soft cake layers** `LW × LH` (LW = round(1.3·S), LH = round(0.78·S)); squishier landing + jelly jiggle |
| old tree stump | **cake stand** (`env/stand.svg`, a pedestal plate) |
| bananas on a branch (goal) | **a cherry on a little cotton-candy cloud** floating at the goal height (`characters/cherry.svg`, `env/cloud_candy.svg`) |
| monkey swings in, flowers bloom | **cherry plops on top → candles pop up one per layer on the top and light while counting → Koko blows them out (smoke puffs) → sprinkles rain** |
| butterfly surprise | **honey bee** surprise (`characters/bee.svg`, `bee_up.svg`) |
| jungle, morning → noon → sunset → night | **Candy Village**, weather per chapter: **sunny → breezy → rain → rainbow** (chapter index 0..3, always in this order; topics rotate as before) |
| jungle animals | **animal cookies**: `CK.ANIMALS = ['bunny','bear','cat','dog','duck','pig','cow','sheep']` |
| leaf pad under the 2nd tray row | **a round cake board / plate** (`BlockArt.drawPlate`) |

## 2. Screen and layout (deltas to Lulu §2)
- `layout.S` (item scale): age ≤ 4 → **124**, 5+ → **110**, never below **92** (shrink rule as Lulu, but with the tower
  height `maxBlocks · LH`). `layout.LW = round(1.3·S)`, `layout.LH = round(0.78·S)` (age 4: 161 × 97).
- All tower/tray/drop maths that used S for a block's width now uses **LW**, for a block's height **LH**:
  `drop.x0/x1 = tower.x ∓ (LW/2 + 60)`, slot spacing `LW + 26`, rest y `groundY − LH/2 − 6`, 2nd row `y − LH − 40`,
  goalY = `baseTop − N·LH − 8`, `tower.baseW = LW + 60`.
- Piece hit test: `|dx| ≤ LW/2 + 16` and `|dy| ≤ 0.6·S + 14`; the nearest centre wins.
- **Koko**: FEET point + height: landscape `x = ins.left + 120`, `y = groundY − 4`, `h = 330` (W < 1100: 300); portrait
  `x = ins.left + 110`, `y = tower.baseTop + 70`, `h = 300` (drawn behind the tray). Hit box: x ± 0.38·h, h tall (+20).
- `layout.goal = { x, y /*bottom of the cherry*/, cloudY }`: the cherry (80×90 drawn at 72 px tall) sits on the
  cloud (cloud drawn 180 × 100, its top surface 18 px above the cherry's bottom). goalH ≈ 110 replaces bananas' 104.
- No `monkeyFrom`. Everything else (bubble, HUD keep boxes, insets, tall portrait rules) as Lulu.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no famous cartoon koala, no
  candy-brand mascot, no gingerbread character from a film, no Candy-Crush look). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at
  viewBox 256) in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (unchanged hex, base/dark/light)**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). `CK.PALETTE` in `content.js`.
- **Koko**: koala, fur **soft grey `#A9B1BC`**, shade `#8C95A3`, outline `#56606E`, big round ears with fluffy
  **cream-white `#F4F1EC`** insides and tufts, belly/muzzle `#E6E8EC`, a **big oval nose `#3B3946`** (with a highlight),
  eyes `#2F2A3A` with catch-light, pink cheeks `#F6B1A0`, a **cream chef's hat `#FFFDF6` (outline `#C9BBA3`)** and a
  **mint apron `#9ED8CB` / `#5FA597`** with a small cream heart pocket. Koko never wears an answer colour. Chubby,
  toddler proportions (head ≈ 45 % of height).
- **Cake layers** (drawn by code in `block_art.js`): a soft sponge layer seen from the front with a thin top face
  (pseudo-3D, top 16 % of LH), rounded corners r = 0.18·LH, a band of cream filling, and **frosting on top that drips
  over the front edge in 4–6 rounded drips** (drip pattern varies by block id). *Colour* layers: frosting AND sponge in the
  answer colour (frosting base, sponge light, outline dark 5 px). Other layers: **vanilla sponge `#F6DFAE` / top
  `#FBEFD2` / outline `#B98A4E`, white frosting `#FFFDF7` / shade `#EFE6D8`** with a decoration on the front face:
  shape (fondant shape in its colour, dark outline), candy dots (chocolate drops `#5A3A22`, dice layout), numeral
  (piped chocolate, bold rounded), animal cookie sticker (`items/animal_<x>.svg`), letter / text (chocolate). Ages ≤ 4:
  shapes on layers are in different colours; below age 5 never blue+purple, red+green, yellow+orange, green+orange in one
  choice set.
- **Candy Village**: PASTEL and CALM (saturation ≤ 45 %, lighter than the answer colours, yellower overall):
  gingerbread cottages with frosting roofs, lollipop trees, gumdrop bushes, candy-cane fence, wafer bridge, cream path.
  Ground: a smooth cream/biscuit plaza (`#F3E2C0` / `#E6CC9E`) with a few sprinkles — calm in the middle band where
  layers rest. Sky: sunny `#A9DDF5 → #FFF4DA`, breezy `#BFDDEB → #F3EEDF` (fast clouds), rain `#8FA0B8 → #CBD5E0`
  (grey-lilac clouds, darkness 0.15), rainbow `#9FD6F0 → #FFF1D6` (a soft rainbow arc behind the village).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & UI — character artist A (generator `tools/art_koko.py`)
| File | viewBox | Notes |
|---|---|---|
| `characters/koko_{idle,blink,talk,happy,cheer,think,oops,hold,blow}.svg` | 0 0 300 400 | Koko standing 3/4 view facing RIGHT (towards the cake), **feet anchor (150, 392)**, identical body/legs in every frame; happy = big smile; cheer = both arms up, eyes closed smile; think = head tilt, paw on chin; oops = "hmm?" head tilt (never sad); talk = mouth open; **hold = both paws raised forward to the right, palms at x ≈ 285, y ≈ 150 (steadying the cake in a breeze)**; **blow = puffed cheeks, round "o" lips pointing right at (270, 140), eyes closed** |
| `characters/koko_full_wave.svg` | 0 0 300 400 | title pose (one paw raised, waving) |
| `characters/cherry.svg` | 0 0 80 90 | one glossy cherry (deep red `#C8243A`, NOT the answer red: darker, glossy highlight) with a green stem + leaf; **bottom anchor (40, 86)** |
| `characters/bee.svg`, `characters/bee_up.svg` | 0 0 96 80 | round friendly honey bee (warm amber `#F2B64A` + brown stripes, NOT answer yellow: darker/amber), wings open / up (flap frames) |
| `characters/candle.svg` | 0 0 24 72 | a thin striped birthday candle (cream + pastel stripes), wick at top (12, 4); flame drawn by code |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Koko's head in the chef's hat beside a 3-layer cake (red, yellow, blue layers) with a cherry, pastel Candy Village background, full-bleed |

### 4.2 Cake layers & animal cookies — character artist B
- `items/animal_<x>.svg` (0 0 128 128) for `CK.ANIMALS`: each a **gingerbread-style animal cookie face** (warm cookie
  base, iced details in white/pastel, rosy cheeks) with a white sticker border — readable at 60 px, every animal
  instantly distinct by silhouette (bunny ears, bear round ears, cat pointy ears + whiskers, dog floppy ears, duck beak,
  pig snout, cow horns + spots, sheep fluffy wool). Generator `tools/art_animals.py`.
- **`game/js/block_art.js`** → `CK.BlockArt`:
  ```
  CK.BlockArt.drawBlock(ctx, block, LW, LH, opt)  // a cake layer; origin = CENTRE; opt: { glow 0..1, lift 0..1, dpr, id (drip seed), img(name) }
  CK.BlockArt.drawGhostHand(ctx, size, t)         // friendly pointing hand (hint), origin = fingertip
  CK.BlockArt.drawCandle(ctx, h, lit 0..1, out 0..1, t)  // origin = candle BASE; flame flickers with t; out → smoke puff
  CK.BlockArt.drawPlate(ctx, w, h)                // round cake board under the 2nd tray row (origin = top-centre of its surface)
  CK.BlockArt.drawSprinkle(ctx, len, color, rot)  // a single sprinkle (rounded rod) for confetti
  CK.BlockArt.drawGlow(ctx, w, h, t, strength)
  CK.BlockArt.COLORS = CK.PALETTE
  ```
  `block = { kind, value, color?, shape?, n?, text?, animal?, size? }` as Lulu (`size: 'big'|'small'`: small = 0.72× both
  dims). Cache static faces per (key, LW, LH, dpr, drip seed) in offscreen canvases. Shapes: `CK.SHAPES` unchanged.

### 4.3 Environment — environment artist (generator `tools/art_env.js`)
- `env/far_<m>.svg` (0 0 1200 420), `env/mid_<m>.svg` (0 0 1200 380), `env/ground_<m>.svg` (0 0 1200 260) for
  `m ∈ sunny|breezy|rain|rainbow`: horizontally tileable, bottom-anchored, transparent above. far = pastel candy hills
  with tiny distant cottages; mid = gingerbread cottages, lollipop trees, gumdrop bushes, candy-cane fence; ground = the
  cream plaza (calm middle band). Rain: wet sheen, darker; breezy: trees leaning slightly; rainbow: fresh sparkly.
- `env/stand.svg` (0 0 260 120): cake stand — round plate top (cut surface at **y = 18** across x 20–240) on a short
  pedestal; anchor bottom-centre (130, 116). Soft porcelain cream `#FFF8EC` + pastel mint trim (not answer green).
- `env/cloud_candy.svg` (0 0 200 110): cotton-candy cloud (pale pink-lilac `#F6D9EA` / `#E9C2DC`, soft) — the cherry sits on
  its top centre at **(100, 22)**.
- `env/sun.svg` (0 0 200 200), `env/rainbow.svg` (0 0 1200 600, a soft pastel arc, semi-transparent), `env/cloud_{a,b,c}.svg`
  (0 0 320 170, white fluffy), `env/cloud_rain.svg` (0 0 320 170, grey-lilac).
- Particles (0 0 32 32): `sparkle`, `sugar` (glint), `wrapper_a`, `wrapper_b` (little candy wrappers fluttering in the
  breeze), `blossom` (pastel petal), `raindrop` (soft blue streak), `splash`, `puff`, `dust`, `confetti_a`, `confetti_b`
  (white, tinted by code), `star` (registered as `pstar`).

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `block_art.js` | character artist B |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/smoke.js` | lead |
Script order unchanged.

### 5.1 Content (`content.js`) — deltas
```
CK.ANIMALS = ['bunny','bear','cat','dog','duck','pig','cow','sheep']
CK.ANIMAL_SOUND = { cat:'meow', dog:'woof', duck:'quack', pig:'oink', cow:'moo', sheep:'baa', bunny:null, bear:null }  // null = never asked by sound
```
Everything else as Lulu (`round.surprise`: `null | 'breeze' | 'bee'`).

### 5.2 `CK.World` — deltas to Lulu §5.2
- Geometry with `LW/LH` (§2). Landing: squash `sy 0.75 → spring back` with a lower damping (jelly: ζ ≈ 0.25), the layers
  below compress a bit more (0.08) — soft sponge. Sway physics unchanged (never falls). `blockPose(i, alpha)` unchanged.
- `setBreeze(v 0..1)`: main passes the weather wind; the cake gets a gentle sinusoidal torque (|θ| ≤ 0.02 rad from it).
- `w.goal = { x, y, cloudY, state:'float'|'drop'|'on', bob, cherryY, _pcherryY }` replaces bananas (float bob ±4 px,
  1.1 Hz; at round start the cloud+cherry float in from the top with a soft overshoot).
- `w.candles = [ { i, lit 0..1, out 0..1, x /*offset on the top layer*/ } ]` (n candles evenly across 0.7·LW on the top).
- `w.koko = { x, y, mood /*idle|talk|happy|cheer|think|oops|hold|blow*/, moodT, blinkT, look }` replaces `w.lulu`
  (keep `w.lulu` as an alias getter for older tests if cheap, else update tests).
- **done** sequence (≈ 3.6 s, `doneMax` safety): `towerDone {n}` → `cherry` (the cherry drops from the cloud onto the top
  with a squash, the cloud puffs away; `goal.state 'on'`) → `count {i}` every 0.45 s for i = 1…n (layer i glows, candle i
  pops up and lights) → `blow` (Koko mood `blow` 0.9 s; a breath gust makes the cake jiggle a little) → `candlesOut`
  (smoke puffs) → `sprinkles` → `roundDone {round, stars, misses}`. **clear** as Lulu: the layers (top first, cherry with
  the top one) hop off to the right edge and puff (`clearBlock {i}`).
- Surprise `breeze` as Lulu's (`gust`, Koko `hold` 1.5 s); `bee` replaces `butterfly` (`w.bee = {x, y, t, state, flap}`,
  events `bee`, `beeTap {x, y}`; after a tap it loops once and buzzes off).
- Events otherwise as Lulu (`round`, `deal`, `ask`, `grab`, `tapPiece`, `drop`, `land`, `stack`, `wrong`, `miss`, `hint`,
  `idle`, `pokeKoko` (replaces `pokeLulu`), `level`, `talk`, `talkAsk`, `talkResult`, `levelDone`, `sessionDone`).

### 5.3 `CK.Weather` — `setWeather(i)` 0 sunny, 1 breezy, 2 rain, 3 rainbow (crossfade 2.5 s), `resize(W,H)`,
`update(dt)`, `ambient = { skyTop, skyBottom, tint, sun, sunX, sunY, darkness /*rain 0.15*/, wind 0..1 (breezy ≈ 0.8 with
gusts, others ≤ 0.15), rain 0..1, rainbow 0..1, cloudSpeed, mood:'sunny'|'breezy'|'rain'|'rainbow' }`, `clouds[]`
(`{x, y, s, kind 'a'|'b'|'c'|'rain'}`), particles: sunny sugar glints + blossoms; breezy wrappers + blossoms flying
sideways; rain streaks + splashes on the ground; rainbow sparkles; session party `party()` = sprinkle confetti + sparkles.
Cap 120. Particle `{ kind /*asset name*/, x, y, rot, s, a, tint? }`.

### 5.4 `CK.Bot` — as Lulu (taps the bee sometimes).

### 5.5 Test hooks — as Lulu with `kokoScreen()` (replaces `luluScreen`), `beeScreen()`; World `kokoHit()`.

## 6. Voice, language — as Lulu §6 with helper **Koko** (written and spoken "Koko" in both languages), a cheerful little
koala baker: pitch ≈ 1.2, rate ≈ 0.9. Animal cookies: bunny "con thỏ", bear "con gấu", cat "con mèo" (meow / "meo meo"),
dog "con cún" (woof / "gâu gâu"), duck "con vịt" (quack / "cạp cạp"), pig "con heo" (oink / "ụt ịt"), cow "con bò"
(moo / "bò… ò ò" — the engineer picks a natural VI sound word), sheep "con cừu" (baa / "be be").
- `p.colors` "Stack the {color} layer!" / "Bé ơi, xếp tầng bánh màu {color} nhé!", `p.shapes` "Put the {shape} layer on
  top!", `p.countUp` "Layer number {n}!", `p.count` "Find the layer with {n} candy dots!", `p.animals` "Stack the {animal}
  cookie layer!", `p.sound` "Who says {sound}? Stack that layer!", `p.size` "Stack the {size} layer!", letters etc. as Lulu.
  3 wordings each.
- `sayStack` names the layer and counts the cake ("Red! Two layers tall!" / "Màu đỏ! Bánh cao hai tầng rồi!"),
  `sayWrong` ("Boing! That's the blue layer. Let's find red!"), `sayTap`, `count.<n>`, `towerDone[]` ("We reached the
  cherry!"), `candles[]` ("Candles! Let's count them!"), `blow[]` ("Make a wish… fffff!"), `hint[]`, `idle[]`,
  `praise[]`, `great[]` with `{child}`, `talk.*`, `weather.0..3` ("Sunny day in Candy Village!", "Whoosh, it's breezy!
  Hold on, cake!", "Pitter-patter, sugar rain!", "Look, a rainbow!"), `surprise.breeze`, `surprise.bee`, `bee.tap`
  ("Bzzz! Bye-bye, bee!"), `gust` ("Whoa, a breeze! I've got it!"), `deal[]` ("Let's bake a cake up to the cherry!"),
  `topic.*`, `session.done`, `ui.*` incl. `ui.volume`, logo lines "Koko's" / "Cake Tower", VI "Koala Koko" / "Tháp Bánh Kem".
- Remove every jungle/giraffe/banana/monkey/butterfly/time-of-day word from the texts.

## 7. Integration (lead) — title (Koko waving beside a 3-layer cake with the cherry), settings with volume, HUD, bubble,
pause with −/+, chapter banner, Talk time, session done (rainbow party: sprinkles, Koko cheering, a big cake).
Audio: loud chain; SFX: soft flump (pitch rises per layer), jelly wobble, boing, whoosh (drop), pick-up pop, deal taps,
count chimes (rising), candle fwip, blow (filtered noise), sprinkle twinkles, bee buzz, star dings, fanfare; ambience per
weather (birds / wind / rain patter / sparkly); music per weather.

## 8. Performance — ≤ 6 layers, ≤ 4 pieces, cached layer faces, ≤ 160 particles; adaptive quality as Lulu.
