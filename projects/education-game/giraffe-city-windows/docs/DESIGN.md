# Gigi's Peekaboo Windows — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.GW`**, storage prefix `gw:`. Classic `<script>` files, no build step.
The code base is a **copy of `../duckling-forest-memory/`** (Dee's Forest Memory: memory world, content, bot, voice, input,
storage, loud audio with volume, ui, main, tests) with `DM → GW` already renamed. Its original docs are the reference for
everything this file does not change: `../duckling-forest-memory/docs/{DESIGN,MECHANICS,VOICE}.md`.
**Keep Dee's world API names** (`cards`, `phase`, events `flip/tap/match/mismatch/hint/idle/…`) so main/render/tests carry over.
Target: iPhone + iPad Safari first, portrait and landscape. Short side 720 logical px (same layout maths as Dee).

## 1. What changes versus Dee's Forest Memory
| Dee's Forest Memory | Gigi's Peekaboo Windows |
|---|---|
| cards in a grid on a forest clearing | **windows of a city apartment building**; the grid is the building's window grid; a building facade is drawn around it |
| 3D card flip (scaleX = \|cos πflip\|) | **two wooden shutters swing open on their outer hinges** (`open` 0 closed … 1 open, spring with overshoot ≤ 1.12); inside: a warm lit room with the face |
| Dee the duckling stands beside the grid | **Gigi the giraffe calf** on the pavement; her **neck stretches** (spring) so her head peeks at the window that opened |
| match → cards spin, burst, a reward flies to a perch | match → both windows **stay open and light up** (`light` 0..1), a **flower box blooms** under each (`bloom` 0..1, overshoot), the two faces bounce. **No perched rewards** |
| next round: new cards dealt from a deck | round done → building cheers (all windows glow, confetti from the roof) → **street scroll**: the camera pans `scroll` px, the old building leaves left, a new one (other colours) slides in from the right, Gigi trots (walk frames) |
| seasons spring → winter | **sunny → breezy → rain → rainbow** (one per chapter) |
| surprises shuffle / golden / pond | surprises **pigeon** (lands on a sill), **bus** (rolls along the street), **balloon** (floats up past the windows) — tap = fun, never a mistake |
| forest animals, identical-animal pairs | city-friendly animals + their **homes** (age 4–5 topic `homes`: animal ↔ home) |

## 2. Layout (logical px; as Dee §2/§3 unless stated)
- `groundY = H − ins.bottom − 90` = top of the pavement. Road band from `groundY + 40` to the bottom (cars drive there, behind Gigi).
- **Gigi** (`layout.gigi = {x, y, h}` feet anchor): landscape `x = ins.left + 110, y = groundY + 22, h = 150`; portrait
  `x = ins.left + 100, y = groundY + 24, h = 140`. `h` = height of the BODY box (legs, torso, neck base). The head box is
  `0.62·h` square. Keep-out box for boards: Dee's h × h box above the feet, widened to `1.2·h` (Gigi's idle head sits above it,
  see §4.1). Taps on body box or head box → `'gigi'` (repeat the prompt, never a mistake).
- Bubble, HUD, boards, grid fitting, window hit test (+10 px): exactly Dee's. Card (window) aspect w:h = **0.78**, min width 120 px
  (ages ≤ 4) / 104 px (5+), cap 210 px, gap = max(18, 0.16·cw) (a bit wider than Dee: shutters swing into the gap).
- **Building** (`layout.grid.building = {x, y, w, h, roofH}`): facade = grid.rect grown by `pad = max(22, 0.22·cw)` on the
  sides and top, from the top row down to `groundY + 4` (the ground floor behind Gigi is just facade + a door drawn in the
  free space, never under a window), roof/cornice band `roofH = 0.32·cw` above (may go under the HUD/bubble: purely visual).
  Every window keeps ≥ 0.5·gap of facade on every side.
- **Scroll**: `w.scroll` = camera x offset in px (parallax: far 0.15, mid 0.4, facade/ground 1.0). During the scroll phase the
  old building is drawn at `x − scrollT·W`, the new at `x + (1 − scrollT)·W` (world gives `w.prevBuilding` + `w.scrollT`).

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character, brand, logo or real bus livery.
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill, never pure black. One-step cel shading + one soft highlight upper-left.
- Stickers (animals, homes): white sticker border ≈ 6 px + faint drop shadow inside the SVG (opacity .18, +3 y).
- SVG: no `<text>`, fonts, scripts or external refs; ≤ 1 light `feGaussianBlur`; `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark)**: red `#E84A4A`/`#A8282E`, blue `#3C8DE8`/`#1F5BA8`, yellow `#FFD23F`/`#C99A12`,
  green `#4CC26B`/`#2A8343`, orange `#FF9A2E`/`#C4650C`, purple `#9B6BE0`/`#6840A8`, pink `#FF8FC0`/`#C9558A` (pink from age 6).
- **Gigi**: coat warm sand `#F3CE85`, shade `#E3B465`, patches caramel `#B97A3F` (browner than `orange`), outline `#7E5226`,
  muzzle cream `#FBEBCB`, ossicones with dark-brown knobs `#6B4421`, mane `#9C6532`, hooves `#6B4421`, eyes `#2F2622` +
  catch-light, cheeks `#F5AFB4`, a small **mint scarf** `#7CCFB8` / dark `#4C9C88` (not an answer colour). Gigi never stands
  on the building; she is beside / below it.
- **Buildings** (calm, lighter and less saturated than any answer colour): facades from the set brick-rose `#E6B8A2`, cream
  `#F2E3C6`, sage `#C9D8B6`, sky-grey `#C8D6E2`, lilac-grey `#D9CFE0`, sand `#EAD4AE`; trims white `#FBF7EE`, outlines a darker
  tone of the facade. **Shutters** per building from teal `#5E9E97`, slate blue `#6C86A6`, olive `#8E9A5B`, terracotta `#B9775E`
  (muted, darker than the facade; identical on every window of a building — no cue). Window interior: warm cream `#FFF6E2`
  (lit: `#FFE9A8` glow), sill white, flower box wood `#A8744A`.
- Faces inside windows are drawn exactly like Dee's card fronts (colour things, shapes, dots, numerals, letters, text, parity
  frame) on the cream interior; animals/homes are stickers.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Gigi & UI — character artist A
| File | viewBox | Notes |
|---|---|---|
| `characters/gigi_body_{stand,walk_a,walk_b,hop}.svg` | 0 0 256 256 | ¾ view facing RIGHT; legs, torso, tail, short neck stub. **Feet anchor (128, 244). Neck socket (172, 96)** = centre of the neck base; the neck leaves up-right. walk_a/b = trot frames (identical torso), hop = legs tucked |
| `characters/gigi_head_{idle,blink,talk,happy,cheer,think,oops}.svg` | 0 0 192 192 | head + ossicones + ears + mane top, facing RIGHT; **neck joint (70, 160)** = where the neck enters the head (bottom-left). happy = big smile, cheer = eyes ^ ^ + open mouth, think = eyes up, oops = gentle "hm?" (never sad) |
| `characters/gigi_title.svg` | 0 0 320 480 | full Gigi (body + neck + head waving with one front hoof raised) for the title screen |
| `characters/pigeon.svg`, `pigeon_flap.svg` | 0 0 128 128 | grey-lilac city pigeon, feet anchor (64, 120), facing right |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | gold star / grey outline star |
| `icon.svg` | 0 0 512 512 | full-bleed: Gigi's head peeking into an open window with shutters, sky-blue background |
Artist A also owns **`game/js/gigi_art.js`** (`GW.GigiArt`, §6.3): the neck drawn by code + the anchors.

### 4.2 Windows, buildings, faces — character artist B: **`game/js/window_art.js`** (`GW.WindowArt`, §6.4), all code-drawn.

### 4.3 Animals and homes — character artist C (0 0 128 128, centred, ≈ 110 px, sticker border, must read at 70 px)
`items/animal_<dog|cat|bird|fish|bee|rabbit|duck|hen|spider>.svg` (puppy, kitten, little blue-grey songbird (not `blue`),
goldfish (`#F59A52`, softer than `orange`), bee, white-grey bunny, yellow duckling (`#FFE27A`, softer than `yellow`), white hen
with red comb, cute round spider with big eyes) and
`items/home_<kennel|basket|nest|bowl|hive|hutch|pond|coop|web>.svg` (doghouse, cat basket with cushion, twig nest with eggs,
round fish bowl with water + weed, beehive skep, rabbit hutch with straw, little pond with reeds + lily pad, hen house, spider
web on twigs). Pairs: dog–kennel, cat–basket, bird–nest, fish–bowl, bee–hive, rabbit–hutch, duck–pond, hen–coop, spider–web.
Homes must be empty (no animal inside) so the pair is a real match; distinct silhouettes.

### 4.4 Environment — environment artist (bottom-anchored, **horizontally tileable**, transparent above)
Moods `m ∈ sunny|breezy|rain|rainbow`: `env/far_<m>.svg` (0 0 1200 420, parallax 0.15: city skyline silhouettes, a TV-tower-like
spire (generic), soft hills), `env/mid_<m>.svg` (0 0 1200 360, parallax 0.4: low shops with awnings, cafe tables, round trees in
planters, lamp posts, a park corner), `env/ground_<m>.svg` (0 0 1200 260: pavement (top edge ≈ y 40, drawn at `groundY − 30`),
kerb, road with lane dashes below). breezy: awnings/flags tilted, leaves; rain: darker wet tones, puddles, umbrellas at the
café; rainbow: wet shine, puddles with reflections. Plus `env/sun.svg` (0 0 200 200), `env/cloud1..3.svg` (0 0 300 160),
`env/rain_cloud.svg`, `env/rainbow.svg` (0 0 1200 600, arc, soft), `env/car_a.svg`, `env/car_b.svg` (0 0 240 120, side view
facing right, muted colours), `env/bus.svg` (0 0 480 200, a friendly round little bus with 3 windows, generic livery),
`env/kite.svg` (0 0 96 128, breezy sky). Particles (0 0 32 32): `drop` (rain streak), `splash`, `leaf_a`, `leaf_b`, `paper`
(a little paper/petal), `sparkle`, `star`, `puff`, `confetti_a`, `confetti_b` (neutral, tinted by code).

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `gigi_art.js` + `characters/*`, `ui/*`, `icon.svg` (generator `tools/art_gigi.py`) | character artist A |
| `window_art.js` (+ `tests/unit/window_art.test.js`) | character artist B |
| `items/*` (generator `tools/art_animals.py`) | character artist C |
| `env/*`, `particles/*` (generator `tools/art_env.js`, composed scenes `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, gigi_art, window_art, render, ui, main.
`card_art.js` is deleted once `window_art.js` exists.

## 6. Module APIs
### 6.1 Content (`GW.Content`) — as Dee §5.1 / MECHANICS §2 with:
- `GW.ANIMALS = ['dog','cat','bird','fish','bee','rabbit','duck','hen','spider']`, `GW.HOMES = {dog:'kennel', cat:'basket',
  bird:'nest', fish:'bowl', bee:'hive', rabbit:'hutch', duck:'pond', hen:'coop', spider:'web'}`.
- `GW.AGE_TOPICS = {3:['colors','shapes','size','animals'], 4:['colors','shapes','count','homes'], 5:['shapes','count','letters','homes'],
  6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven']}`; `AGE_POOLS` rotate (≥ 5 per age; 4: colors, shapes,
  count, homes, animals, size).
- `colors`: face `{kind:'color', value:'red', obj:'umbrella'|'balloon'|'car'|'kite'|'cup'|'boot'}`; ages ≤ 4 the two cards of a
  pair show the same object; age 5+ two different objects of the same colour. Colour-safety rules of Dee kept (≤ 3 colours below 6).
- **`homes`** (new): pair key `h:dog`; faces `{kind:'animal', value:'dog', sprite:'animal_dog'}` + `{kind:'home', value:'kennel',
  sprite:'home_kennel', animal:'dog'}`; name kinds `animal` / `home`; `match` event carries `animal, home`. Warm-up 2 pairs.
- `animals` / `size` / `initial` use the new animal list. Words: en dog D, cat C, bird B, fish F, bee B, rabbit R, duck D, hen H,
  spider S; vi chó (skip, ch), mèo M, chim (skip), cá C, ong O, thỏ (skip), vịt V, gà G, nhện (skip) → 5 initials M C O V G.
- `count`: numeral ↔ dots (dots drawn as round coloured lights in a dice layout).
- Talk `homes`: "Where does the {animal} live?" with 3 home pictures (`show` = the animal face); `animals`: as Dee.

### 6.2 `GW.World` — Dee's world (MECHANICS §1, §3–§6) with these changes
- Cards = windows: keep `w.cards[]` and every field; replace `flip` semantics by **`open`** (0 closed … ~1.12 overshoot, alias
  `flip` kept = min(1, open) for old code/tests); `c.light` 0..1 (lamp on after a match), `c.bloom` 0..1.2 (flower box spring),
  `c.bounce` (face hop offset px, decays), `c.wiggle` (face rot, mismatch), `c.glow` (hint). Matched cards stay `state:'matched'`
  (never `gone`). Peek/hide waves, third-tap, mismatch timing, hints, idle, stars, chapter limit, adaptive hold: unchanged.
- **Shutter motion:** target 1 open / 0 closed; spring ω 16, ζ 0.42 (opens with a visible overshoot ≈ 1.1 and settles; closes
  with a small bounce at 0 clamped as a "clack": when `open` crosses 0 going down, `open = 0`, velocity × −0.25 → event `clack`).
  Breezy weather: shutters of open windows sway ±0.03 with `wind`. Hint = open to 0.3 (a crack) and back.
- **Match:** hold 0.25 s, then `light` → 1 (0.4 s), `bloom` spring (ω 14, ζ 0.35) to 1 with flowers popping, both faces bounce
  (12 px hop, g 2000) twice; `match` event at the check, `bloom {id}` events when each box pops. Phase back to `play` 0.4 s after.
- **Round done:** `cheer` phase 1.2 s (event `cheer {x, y}` at the roof centre for confetti; every matched window bounces in a wave),
  then `roundDone` as before, then the **scroll** (`phase 'scroll'`, `w.scrollT` 0 → 1 over 1.6 s smooth-step, `w.scroll`
  increases by W, `w.prevBuilding` = the old building + its cards (frozen, for drawing), event `scroll`), Gigi walks during it
  (`gigi.walk` phase 0..1 cycles at 2.2 Hz), then the next round's building is in place and its windows are already closed
  (no deal flight): `peek` starts. `w.building = {facade, trim, shutter, roof:'flat'|'gable'|'arch', door, seed}` chosen per
  round, never the same facade/shutter as the previous building.
- **Gigi:** `w.gigi = {mood, moodT, hop, walk, walking, headX, headY, _phx, _phy, neckBaseX, neckBaseY, lookX, lookY, blink}`.
  The head follows a target with a spring (ω 9, ζ 0.55 → a springy stretch). Target: idle = rest pose (neck socket +
  (0.12·h, −0.6·h)); after a `flip`/`tap` on window c (3 s, then rest) = the point nearest to c on the circle of radius
  `neckMax = 1.6·h` around the neck base, pushed out of `grid.rect` grown by 16 px (the head never covers a window), with
  y ≥ ins.top + 0.35·h and the head box inside the screen. `neckLen` = |head − base| ≥ 0.45·h. Moods as Dee (`happy` hop 14 px,
  `cheer` 3 hops, `oops`, `think`). `GW.World.gigiHead(w)` returns the head box for hit tests and the renderer.
- **Surprises** (round index 2 of each chapter, type rotates per session): `w.critter = {type:'pigeon'|'bus'|'balloon', x, y,
  _px, _py, rot, state, t, flap, face, color}`: pigeon flies in on an arc, lands on a random sill (window bottom edge), pecks,
  tap → flies off (event `critter {type, action:'tap'}`, never a mistake, no idle reset needed); bus enters along the road from the
  left at 120 px/s, stops 2 s mid-screen, drives off right; tap → `honk` bounce; balloon rises from the pavement at 40 px/s
  swaying (pendulum string), tap → twirls up fast + sparkle. `pointerDown` returns `'critter'` for these taps (window hits win).
- **Traffic** (ambient, world-owned for determinism): `w.traffic[] = {kind:'car_a'|'car_b', x, y, vx, face}` 0–2 cars on the
  road every 6–14 s (not during Talk), drawn behind Gigi.
- Events added: `clack {id}`, `bloom {id}`, `cheer {x, y}`, `scroll {}`, `critter {type, action}`, `walk {}`. Removed:
  `deal`, `reward`, `land` (keep `deal` only if cheap; main does not need it).

### 6.3 `GW.GigiArt` (artist A, `gigi_art.js`)
```
GW.GigiArt.ANCHORS = { body: {w:256, h:256, feet:[128,244], socket:[172,96]}, head: {w:192, h:192, joint:[70,160]} }
GW.GigiArt.drawNeck(ctx, bx, by, hx, hy, thick, opt)   // tapered spotted neck from base (bx,by) to head joint (hx,hy) in the
     // current transform; thick = width at the base (top = 0.72·thick); a slight S-curve (opt.bend −1..1), caramel patches
     // that stretch with the length, mane strip along the back side, outline; opt.mood unused. Fast (no allocations per frame).
GW.GigiArt.headAngle(bx, by, hx, hy) → radians to tilt the head (small, ≤ 0.35)
```
The renderer draws: body svg (feet anchor) → neck (from socket to head joint) → head svg rotated by headAngle at the joint.

### 6.4 `GW.WindowArt` (artist B, `window_art.js`) — node-safe at load, caches bitmaps per (face, size bucket, dpr)
```
GW.WindowArt.COLORS                                   // as Dee's CardArt.COLORS
GW.WindowArt.drawWindow(ctx, w, h, face, open, opt)   // centred at 0,0; frame + sill + interior + face (if open > 0.05) +
     // two shutters hinged at the outer frame edges: each shutter's visible width = (w/2)·cos(min(1,open)·π/2·1.05)… drawn as
     // a skewed panel (perspective: the outer edge stays, the inner edge swings out past the frame for open > 0.5, darker as
     // it turns); overshoot >1 swings slightly further. opt: {shutter:'#hex', trim, light 0..1 (warm interior + halo),
     // glow 0..1 (hint halo), bloom 0..1.2 (flower box under the sill, flowers pop with scale), bloomColor, bounce px (face y),
     // wiggle rad (face rot), sprite(name, x, y, size) renderer callback for animal/home faces, rain 0..1 (drops on the glass),
     // alpha}
GW.WindowArt.drawFace(ctx, w, h, face, opt)            // the face alone (Talk-time choices, title)
GW.WindowArt.drawBuilding(ctx, rect, building, opt)    // facade, trims, roof (flat/gable/arch), cornice, door + steps at the
     // bottom (opt.doorX), drainpipe, little details (plant, sign without text); rect = layout.grid.building; opt.light 0..1
GW.WindowArt.drawThing(ctx, obj, colorKey, size)       // umbrella | balloon | car | kite | cup | boot in an answer colour
GW.WindowArt.drawBunting(ctx, x0, y0, x1, y1, t)       // roof bunting for the cheer (muted multi-colour flags, sways)
GW.WindowArt.drawBalloon(ctx, colorKey, size, t)        // surprise balloon (+ string)
GW.WindowArt.drawStar(ctx, size, text?)                 // as Dee
```
Face kinds: `color` (drawThing), `shape`, `dots` (round lights), `number`, `letter`, `text`, `animal` / `home` (sprite callback),
parity frame colour (odd blue, even orange window frame).

### 6.5 Weather (`GW.Weather`) — Dee's API, moods 0 sunny, 1 breezy, 2 rain, 3 rainbow (crossfade 2.5 s)
`ambient = {skyTop, skyBottom, horizon, tint, wind, gust, sway, sun, sunX, sunY, darkness, rain 0..1, rainbow 0..1, wet 0..1,
cloudSpeed, mood}`. sunny: clear blue, sun, 3 soft sparkles; breezy: wind 22 + gusts, fast clouds, `leaf_a/b` + `paper`, 1–2 kites
(`w.kites` in weather: `{x, y, rot, tail}` on a string from off-screen); rain: grey-blue sky, darkness 0.18, 90 rain streaks
(`drop`, slanted by wind) + splashes on the pavement line, `wet` 1; rainbow: rain fades out over the first 6 s, rainbow fades in,
sky clears, sparkles, `wet` decays to 0.4. Cap 140 particles.

### 6.6 Bot, test hooks — as Dee (`GW.debug`; `cardScreen(id)` → CSS px rect; add `gigiScreen()`, `critterScreen()`).

## 7. Voice, language — as Dee §6 with helper **Gigi** (bubble "Gigi" in both languages; Vietnamese speech says "Gi Gi"),
a cheerful, slightly breathy calf: pitch ≈ 1.25, rate ≈ 0.9. VI titles "Hươu Gigi". Names: dog "dog"/"con chó" (accept "cún"),
cat/"con mèo", bird/"con chim", fish/"con cá", bee/"con ong", rabbit (say "bunny")/"con thỏ", duck/"con vịt", hen/"con gà",
spider/"con nhện"; homes kennel "kennel"/"nhà chó", basket "basket"/"cái giỏ", nest "nest"/"tổ chim", bowl "fish bowl"/"bể cá",
hive "beehive"/"tổ ong", hutch "hutch"/"chuồng thỏ", pond "pond"/"cái ao", coop "hen house"/"chuồng gà", web "web"/"mạng nhện";
things umbrella/cái ô, balloon/quả bóng bay, car/chiếc ô tô, kite/con diều, cup/cái cốc, boot/chiếc ủng.
Lines: `p.<topic>` (homes: "Who lives where? Find each animal's home!"), flip names ("A red umbrella!", "The kennel!"), `sayMatch`
(homes: "The dog lives in the kennel!"), `sayMismatch` (kind), `peek[]`, `hide[]`, `hint[]`, `idle[]`, `praise[]`, `great[]`,
`cheer[]` (building done: "The whole building is shining!"), `walk[]` ("Let's go to the next building!"), `critter.pigeon/bus/balloon`,
`weather.0..3` ("What a sunny day!", "Whoosh — it's windy!", "Pitter-patter, rain!", "Look — a rainbow!"), `talk.*` (incl.
`talk.homes`), `ui.*`, logo "Gigi's" / "Peekaboo Windows", VI "Hươu Gigi" / "Mở Cửa Sổ".

## 8. Integration (lead)
Title (Gigi waving next to a little building whose windows open on their own), settings with volume, HUD, bubble, pause with
−/+, chapter banner, Talk time, session done (the whole street at rainbow time, every window lit). Audio: loud chain (kept),
SFX: shutter creak-swing (rising pitch on open), wooden clack on close, name chime, match two-note chime + flower "pop-pop",
mismatch soft "hmm-hmm", cheer fanfare + confetti, footsteps clip-clop during the scroll, pigeon coo/flutter, bus "beep beep",
balloon squeak, rain ambience in chapter 3; music per mood.

## 9. Performance — ≤ 12 windows, cached faces and shutters, ≤ 140 particles, adaptive quality as Dee.
