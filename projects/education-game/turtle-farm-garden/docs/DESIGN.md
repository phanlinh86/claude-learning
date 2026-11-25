# Tumi's Flower Farm — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.FT`**, storage prefix **`ft:`**. Classic `<script>` files, no build
step, node-safe at load. The code base is a copy of `../panda-bakery-icing/` (Mochi's Icing Bakery, a proven *trace* game)
with `IB → FT` already replaced. Its contract is kept in `docs/bakery_ref/DESIGN.md` (+ MECHANICS / VOICE): **everything
not changed here stays exactly as there** (layout maths, trace tracking, state machine, events, hint / assist / idle rules,
Talk time, test hooks, the loud audio chain). Target: iPhone + iPad Safari first, portrait + landscape.

**Internal names are kept on purpose** (less churn, the tests keep working): `tray` = the garden bed, `cookie` / `ck` =
a sign / a bed patch, `bag` = the seed packet (choice) / the watering can (tool), `icing` = planted rows, `chips` =
carrots, `sprinkles` = petals, `rack` / `rackCookies` = the fence and its rosettes, `bird` = the butterfly surprise,
`sack` + `mouse` = the hay bale + the chick, `mochi` = Tumi (world field names `w.mochi`, `layout.mochi` stay).

## 1. What changes versus Mochi's Icing Bakery
| Mochi's Icing Bakery | Tumi's Flower Farm |
|---|---|
| kitchen counter, seasons through a window | **outdoors**: sky, hills, a farm in the distance, a meadow; seasons are the whole scene |
| baking tray | a raised wooden **garden bed** with dark soil (same inner box 600 × 400 picture px) |
| icing bags (colour choices) | **seed packets** (paper packet with a flower picture of that colour) |
| choice cookies (shape / numeral / letter / animal) | **wooden garden signs** on a stake (shape cut-out, painted numeral / letter, animal picture) |
| the big cookie on the tray | a **soil patch** on the bed (round raked patch, a shape-cut patch, a numeral sign lying in the soil) |
| icing flows under the finger | a little **watering can** rides under the finger; a **planted row** grows behind it: furrow → sprouts → buds → flowers |
| chocolate chips | **carrots**: tap a spot, a carrot pops up out of the soil (leaves first, then the orange top), counted aloud |
| animal walks an icing road | the animal walks a **pebble path** (stepping stones + grass tufts) to its home |
| sprinkles rain | **petals** flutter down + 2–3 small butterflies fly up from the flowers |
| cookie hops onto the cooling rack | a **prize rosette** (ribbon rosette with a mini picture of the finished bed) hops onto the **fence** |
| bird / mouse in flour sack | **butterfly** across the sky (tap: loop + petal shower) / **chick** peeking from a **hay bale** (tap: straw puff) |
| Mochi the panda | **Tumi** the baby turtle |

## 2. Screen and layout — unchanged (bakery §2): `layout.tray`, `choices`, `mochi`, `bag`, `rack`, `sack`, `birdY`.
The rack strip is now the fence (render draws `FarmArt.drawFence(ctx, rack)`, rosettes at `rack.slots`).

## 3. Art style guide (ALL artists)
- **Original only.** Web search for references only (real raised garden beds, seed packets, wooden garden signs, baby
  turtles, prize ribbon rosettes, farm meadows). Never copy a known character/brand (no Franklin the Turtle, no Teenage
  Mutant Ninja Turtles, no Squirtle, no Crush from Finding Nemo, no Peppa Pig, no Hey Duggee, no Stardew Valley / FarmVille
  look). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact)** — `FT.PALETTE` in `content.js` (unchanged): red `#E84A4A/#A8282E/#F7A0A0`, blue
  `#3C8DE8/#1F5BA8/#A6CCF5`, yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange
  `#FF9A2E/#C4650C/#FFCB8E`, purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2`.
- **Soil / bed** (never an answer colour): soil `#6B4630`, soil light `#8A5E40`, soil dark `#4A2F1F`, crumbs `#9C6E4C`;
  bed frame wood `#C9935E` / shade `#9C6B3E` / outline `#6E4526` / light `#E2B27E`. Raked patch: `#8A5E40` with darker
  rake lines. Signs: pale wood `#F0D3A0` / shade `#CFA36C` / outline `#8A5A2E`, glyphs painted `#5A3A28` (glyph height
  ≥ 56 px at 116 px choice size). Stems / leaves: `#5FA046` / dark `#3E7A2E` (darker than answer green so a green flower
  still reads as a flower); flower centre `#FFE08A` (`#C99A12` rim; red/yellow flower: brown centre `#8A5A2E`).
- **Planted row** (`drawIcing`): the furrow = a darker soil groove (width `22 picture px`), then plants every ≈ 26 px of
  arc length. Growth is by distance from the polyline's END (the finger): < 30 px → a seed / tiny sprout, 30–90 px → two
  leaves + a bud in the row colour, > 90 px → a full 5-petal flower (petals base colour, dark-tone outline, light-tone
  inner highlight), slight per-plant size / rotation jitter (deterministic from the index). `opt.bloom 0..1` (finish)
  opens every plant fully with a little overshoot. `opt.road` = pebble path: flat grey-beige stepping stones
  (`#D9CFC0` / `#B3A58F`) + grass tufts, no flowers.
- **Guide dots**: as bakery (cream dots r 7 every 22 px, soft brown shadow; start = pulsing white ring + gold glow + arrow,
  stroke-number badge) — they must read on dark soil (add a 2 px `#4A2F1F` rim shadow if needed).
- **Tumi**: a round baby sea/land turtle, 3/4 view facing RIGHT. Skin soft sage-olive `#B9CC93` (shade `#97AE72`, outline
  `#5E7446`) — NOT answer green; shell domed caramel `#C68B4F` with lighter plates `#E2B27A` and outline `#7E5228`; cream
  belly plate `#F4E6C4`; cheeks `#F6B1A0`; a floppy **straw sun hat** `#F2D59A` (shade `#D6B46E`) with a cream band
  `#FFF6E2` and one tiny daisy (white petals, yellow centre). No answer colour on Tumi.
- **Farm scene** (calm, sunny, slightly desaturated so the flowers pop): sky `#BFE3F2 → #EAF6F4`, far hills `#A9CC8E` /
  `#93BA7A`, meadow `#9CC77A` (shade `#85B266`), dusty-rose farmhouse/barn far away `#C98A7A` (never saturated red),
  cream windmill, hay bales `#E6C77E`, wooden fence `#D7B58A`. Seasons: spring — blossom trees, petals; summer — bright
  sun, sunflowers along the fence, sparkles; autumn — amber sky tint, orange/brown trees, pumpkins, leaves on the wind;
  winter — pale blue sky, snow on hills/roofs/ground edges, a snowman far away, snowflakes. The meadow right under the
  bed stays readable (not white) in winter: a light snowy-grass `#DDE8E4` with green showing through.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Tumi & surprises & icon — character artist A (`tools/art_tumi.py` or `.js` generator)
| File | viewBox | Notes |
|---|---|---|
| `characters/tumi_{idle,blink,talk,happy,cheer,think,oops,wave,pipe,point}.svg` | 0 0 300 300 | Tumi 3/4 view facing RIGHT (towards the bed), eyes on the child, **feet anchor (150, 292)**, identical body in every frame; happy = big smile; cheer = both front flippers up, eyes ^^; think = head tilt, flipper on chin; oops = "hmm?" (never sad); talk = mouth open; wave = one flipper high; pipe = right flipper forward at chest height (pouring); point = right flipper pointing up-right. The watering can is NOT in the SVG: write the right-hand grip point per frame + the "spout direction" (deg, canvas convention, from the grip towards the spout tip) to `docs/art/tumi_hand.json` in the same format as `docs/art/mochi_hand.json` (the old file, delete it when done). |
| `characters/tumi_title.svg` | 0 0 300 300 | title pose: waving, holding a single big flower (red petals) in the other hand |
| `characters/butterfly.svg`, `characters/butterfly_flap.svg` | 0 0 160 120 | a big friendly butterfly, soft lilac `#C9B6E4` wings with cream spots (NOT an answer colour), facing RIGHT, centre anchor; flap = wings folded up |
| `characters/hay.svg` | 0 0 160 140 | a round-cornered hay bale `#E6C77E` (shade `#C9A45A`, straw strands), a dip on top where the chick peeks, bottom anchor (80, 136); the rim (where the chick is clipped) at y ≈ 52 |
| `characters/chick.svg`, `characters/chick_happy.svg` | 0 0 120 100 | a fluffy pale-cream chick `#FFF0B8` (warmer than answer yellow, shade `#EBD488`, beak `#F2A65A`) peeking (head + wing tips over a rim), bottom anchor (60, 98); happy = eyes ^^, beak open |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | full-bleed: Tumi with the watering can beside a row of colourful flowers, sunny sky |
Delete `characters/mochi_*`, `bird*`, `sack`, `mouse*` once the new files exist. Contact sheets → `docs/art/chars_*.png`.

### 4.2 Farm art — character artist B: `game/js/farm_art.js` → `FT.FarmArt` (canvas 2D + Path2D, node-safe at load)
Same API as `cookie_art.js` (read it first; `FT.CookieArt = FT.FarmArt` alias at the end so old callers keep working;
delete `cookie_art.js`, `tools/cookie_sheet.js`, `tests/unit/cookie_art.test.js` when replaced):
```
FT.FarmArt.drawTray(ctx, box, opt)         // the raised garden bed: wooden plank frame ≤ layout.frame px OUTSIDE box, dark
    //   soil inside (crumbs, a few pebbles, subtle texture, NOT busy: dots must read); opt {glow 0..1 (gold rim), frame, time}
FT.FarmArt.drawRack(ctx, rack, opt)        // the fence strip: 2 rails + rounded pickets across rack {x,y,w,h}
FT.FarmArt.drawBadge(ctx, ck, size, opt)   // NEW: a prize rosette (ribbon tails + pleated ring in ck.hex || gold #FFD23F
    //   blend, white centre disc with a MINI picture of ck: the patch/sign + its rows (ck.icing) + carrots (ck.chips)), origin
    //   = centre, size = ring diameter; it hangs from a little nail at the top. opt {sx, sy, wob, glow, sparkle, time}
FT.FarmArt.drawCookie(ctx, ck, size, opt)  // origin = centre. ck = { kind:'round'|'shape'|'glyph'|'animal'|'home', shape?,
    //   text?, animal?, home?, icing?: [{pts, hex, width}], chips?: [{x,y,r}], icingBox? } (same as bakery).
    //   opt.look: 'sign' (default: choices) — a wooden sign on a short stake (stake below, the board ≈ size); 'shape' signs are
    //     CUT in that shape, 'glyph' signs painted with the numeral / letter, 'animal' signs show the animal, 'home' the home;
    //   'bed' — what lies ON the garden bed: round → a round raked soil patch; shape → a lighter raked patch cut in the shape;
    //     glyph → the same wooden sign lying flat (no stake) so the numeral still shows; animal → the animal itself standing
    //     (no sign); home → the home itself (kennel, hive on a post, nest in a little bush, pond with a lily pad, barn, burrow
    //     mound, hen coop, pig sty with a mud puddle), ≈ size tall, bottom at +0.45 size;
    //   'walker' — the animal alone, walking (opt.step 0..1 leg phase), facing RIGHT;
    //   'badge' — same as drawBadge.
    //   icing in ck is drawn with drawIcing({bloom:1}); chips as carrots. opt { lift, wob, glow, dim, selected, sparkle,
    //   sx, sy, time } as bakery.
    //   FT.ANIMALS = dog bee bird frog duck cow sheep rabbit hen pig;  FT.HOMES = kennel hive nest pond barn burrow coop sty
FT.FarmArt.drawPacket(ctx, hex, size, opt) // NEW (colour choices): a paper seed packet, flower picture in that colour, a
    //   colour band on top; origin = centre, size = height (≈ 2.4 r); opt { lift, wob, glow, selected, dim, time }
FT.FarmArt.drawIcingBag(ctx, hex, size, angle, opt)  // the WATERING CAN tool. Origin = SPOUT TIP (water comes out exactly
    //   at the origin = under the finger). At angle 0 the can body sits ABOVE the tip (body centre ≈ 0.5·size up, tipped
    //   for pouring); + clockwise. A small tin can (`#B8C4CC` / `#8B98A2` / light `#E3EAEE`) with a colour band + a tiny
    //   flower decal in `hex` (null → cream). opt { squeeze 0..1 (pouring: a few water drops fall from the tip, the can
    //   tilts a little more), lift, wob, glow, selected, dim, time }
FT.FarmArt.drawGuide(ctx, path, state, opt)   // as bakery (must read on dark soil)
FT.FarmArt.drawIcing(ctx, pts, hex, width, opt)  // the planted row (see §3); opt { wet 0..1 (fresh: a darker wet furrow +
    //   a few water glints), alpha, bloom 0..1, road (pebble path), time (leaves sway gently) }
FT.FarmArt.drawChip(ctx, r, opt)           // a carrot pulled up: feathery green top + the orange shoulder out of a soil
    //   mound; origin = mound centre; opt {squash (sy factor), grow 0..1 (0 = just a soil bump, 1 = full)}
FT.FarmArt.drawSprinkle(ctx, hex, len, rot) // a falling petal (len ≈ size) in hex
FT.FarmArt.drawIcon(ctx, thing, size)      // Talk time: 'blob'{color} (a flower of that colour) | 'shape'{shape,color} |
    //   'animal'{animal} | 'home'{home} | 'number'{n} | 'letter'{text} | 'dots'{n} (n carrots / dots) | 'size'{size}
    //   (big / small flower) | 'cookie'{…ck}
FT.FarmArt.drawGhostHand(ctx, size, press) // as bakery
FT.FarmArt.drawFlourPuff(ctx, r, t)        // a puff of straw + dust (t 0..1)
```
Readability: every sign / packet / animal readable at 116 px; shapes on signs must be unambiguous (circle vs oval, square
vs rect, diamond). Packets all show the same flower; the colour is the answer (content already avoids
confusable colour pairs below age 5). Contact sheets via `tools/farm_sheet.js` →
`docs/art/farm_*.png` (every sign kind/shape/animal/home/glyph at 116 px and on the bed at 360 px, packets in all colours,
cans in all colours at 3 angles, planted rows growing + bloom + road, carrots, rosettes, icons), ≥ 2 improvement rounds.
Unit test `tests/unit/farm_art.test.js` (every kind draws without throwing on a mock / node-canvas-free recording context).

### 4.3 Environment — environment artist (`tools/art_env.js` generator, `tools/env_scenes.js` composer)
Outdoors now — **no windows**. For `m ∈ spring|summer|autumn|winter` (bottom-anchored, horizontally tileable, seam test):
- `env/sky_<m>.svg` (0 0 800 720): sky gradient + sun / soft clouds (summer: bright sun; autumn: low warm sun; winter: pale
  sun + soft snow clouds), stretched to fill above the hills (render draws it scaled to cover 0..horizon).
- `env/far_<m>.svg` (0 0 1600 360): rolling far hills with the little farm far away (dusty-rose barn, farmhouse, windmill,
  silo), tree clusters; seasonal (blossom / green / orange / snowy). Bottom edge = meadow colour, opaque.
- `env/mid_<m>.svg` (0 0 1200 300): nearer hedges, a tree, hay bales, a scarecrow, a small pond; one seasonal touch per mood
  (spring tulip clumps, summer sunflowers, autumn pumpkins, winter snowman). Bottom-anchored on the meadow line.
- `env/ground_<m>.svg` (0 0 1200 260): the meadow foreground (grass, clover, small flowers / leaves / snow tufts) to the
  bottom; render fills below with `ambient.floor`.
- `env/light.svg` (0 0 600 720): soft sun rays (white, transparent) for summer.
- Particles (0 0 32 32): `petal`, `leaf_a`, `leaf_b`, `snow`, `sparkle`, `star`, `seed` (dandelion fluff), `pollen`
  (soft dot), `drop` (water drop, white → tinted), `straw`, `confetti_a`, `confetti_b`, `butterfly_s` (a tiny butterfly,
  white, tinted by code).
- `tools/env_scenes.js` exports a pure `envLayout(W, H, groundY, opt)` → `{ horizonY, sky:{x,y,w,h}, far:{k,w,h,x0,y},
  mid:{…}, ground:{…, fillY} }` + `tileXs(x0, tw, W)`; landscape: horizon ≈ 0.42 H so hills show above the bed; portrait:
  hills just above the bed top (opt.trayTop), the meadow fills the rest. Render copies it verbatim. Composed scenes at
  1556×720, 960×720, 720×1556 per mood (with a placeholder bed rect + Tumi box) + seam test into `docs/art/`.
Delete the kitchen env files (`env/far_*`, `mid_*`, `ground_*` are overwritten; remove `flour`, `steam`, `crumb`,
`sprinkle_*` particles).

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `trace.js`, `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `farm_art.js` (+ `tools/farm_sheet.js`, `tests/unit/farm_art.test.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_tumi.*`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, e2e tests | lead |
Script order: rng, i18n, trace, content, world, weather, bot, storage, assets, audio, voice, input, farm_art, render, ui, main.

### 5.1 Mechanics changes (mechanics engineer)
- `content.js`: `FT.ANIMALS = ['dog','bee','bird','frog','duck','cow','sheep','rabbit','hen','pig']`, `FT.HOMES =
  ['kennel','hive','nest','pond','barn','burrow','coop','sty']`, `FT.HOME_OF = {dog:'kennel', bee:'hive', bird:'nest',
  frog:'pond', duck:'pond', cow:'barn', sheep:'barn', rabbit:'burrow', hen:'coop', pig:'sty'}`; one round never has two
  animals with the same home. Prompt keys unchanged. Counting chips → carrots (same step `chips`, need N). The size topic:
  two round patches → "the BIG flower patch".
- `world.js`: render fields unchanged, plus `ic.road = true` on the animal road icing, `ic.bloom 0..1` (0 while playing,
  rises to 1 with overshoot-friendly easing over ≈ 0.7 s in the **finish** phase — replaces the gleam visually; keep
  `w.gleam` too), `c.grow 0..1` on chips (0 → 1 over ≈ 0.35 s after it lands: the carrot pushes out of the soil), and
  `w.butterflies[] {x, y, hex, t, flap, alpha, _p*}` (screen px): 2–3 small butterflies take off from random planted
  points at finish and flutter up-and-away (sine wobble, 1.6 s, fade out). Rack slots receive the finished ck (with icing
  / chips, as bakery) — render draws them as rosettes. Rename the mood comments, nothing else structural.
  Bird surprise → butterfly: same events (`birdTap`), petal shower (`sprinkles`). Mouse → chick: same events (`mouseTap`).
- `weather.js`: no windows. `setWindows` becomes a no-op (keep it, render no longer calls it); `outside` flags false;
  particles everywhere on screen: always a few dandelion seeds / pollen drifting; spring petals; summer sparkles + pollen;
  autumn leaves blown by gusts (wind field: a gust every 6–10 s pushes leaves sideways); winter snowflakes. Ambient:
  `{ skyTop, skyBottom, wall (= skyBottom, legacy), floor (meadow under ground layer), tint, light, lightBars, mood, env,
  envFrom, envMix }` per season. Cap 120.
- `bot.js`, tests, `tests/sim/*` keep working; `docs/MECHANICS.md` updated (names, new fields, numbers).

### 5.2 Voice changes (voice & input engineer)
Helper **Tumi** (EN "Tumi", VI "Rùa Tumi" in titles, "Tumi" in lines, TTS VI "Tu Mi"), a cheerful little turtle
gardener: pitch ≈ 1.25, rate ≈ 0.9. Re-theme every line from icing / cookies to planting / garden: `p.colors` "Let's plant
a RED wavy row!" / "Mình trồng một hàng hoa MÀU ĐỎ lượn sóng nhé!", `p.shapes` "Which sign is the TRIANGLE?", `p.count`
"Find the sign with number 3!", `p.chips` "Now pull up 3 carrots!", `p.animals` "Find the COW! Moo!", `p.road` "Make a
path to the barn!", `p.trace` "Now follow the dots!", `trace.progress` ("Look, sprouts!", "Keep going!"), `trace.done`
("Red flowers! Beautiful!"), `offPath` ("Follow the dots!"), `traceTap` ("Keep your finger down and slide!"), `assist`
("Magic water! Slide anywhere!"), `chipsDone` ("3 carrots!"), `finish` ("Look, they bloom!"), `hop` ("A prize for the
fence!"), `home.<animal>` (sound + "home!"), `weather.0..3` ("Spring flowers!", "Sunny summer!", "Windy autumn
leaves!", "Snowy winter!"), `surprise.bird` → butterfly ("A butterfly! Tap it!"), `bird.tap`, `surprise.mouse` → chick
("Who's in the hay?"), `mouse.tap` ("Cheep cheep!"), logo "Tumi's" / "Flower Farm", VI "Rùa Tumi" / "Nông Trại Hoa",
`ui.gallery` "Our garden" / "Vườn của bé". Name kinds: `stroke` (line "straight row / hàng thẳng", wave "wavy row / hàng
lượn sóng", zigzag "zigzag row / hàng zíc zắc", arc "rainbow row / hàng cầu vồng", loop "loop / vòng xoắn", swirl "swirl /
xoáy ốc"), `animal` + new hen "hen / con gà mái", sheep "sheep / con cừu" (sounds "cluck cluck / cục ta cục tác", "baa /
be be"), cat and fish removed; `home` kennel "kennel / chuồng chó", hive "beehive / tổ ong", nest "nest / tổ chim", pond
"pond / cái ao", barn "barn / chuồng bò", burrow "burrow / cái hang", coop "hen house / chuồng gà", sty "pigsty / chuồng
heo". Accepted spoken words updated. Talk-time questions re-themed. All keys in both languages (unit test).

## 6. Integration (lead) — render.js (outdoor env, packets vs can, rosettes on the fence, look:'bed'/'sign'/'walker',
butterflies, hay + chick), title (Tumi waving with a flower, ▶ Play, a little fence with rosettes), session done ("Our
garden": every rosette of the session around a cheering Tumi, confetti), audio (packet pick "rustle-plip", water trickle =
filtered noise with drops while `world.flowing`, sprout "pop" ticks whose pitch rises with progress, stroke-done chime,
bloom arpeggio, carrot "fwup" + count chimes, wrong "boing", hops, butterfly shimmer, chick cheep, birdsong + breeze
ambience, wind gusts in autumn, music per season), main.js event → voice, i18n of UI.

## 7. Performance — Path2D cached per kind, a planted row draws ≤ 1 plant per 26 px (cache flower sprites per colour+stage
into small offscreen canvases when available), ≤ 120 particles, adaptive quality as before.
