# Nuka's Snow Dig — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.NK`**, storage prefix **`nk:`**. Classic `<script>` files, no build
step, node-safe at load (touch the DOM lazily). The code base is a copy of `../bunny-dino-dig/` (Bun's Dino Dig, the same
*seek* family, 2026-11-08) with `DD → NK`, `dd: → nk:`, `mole → seal`, `ptero(saur) → tern` already replaced everywhere.
**When a detail is missing here, do what `../bunny-dino-dig/docs/DESIGN.md` / `MECHANICS.md` / `VOICE.md` say** (they are the
proven base: layout tiers, hit tests, hint/idle rules, Talk time, prompt protection, test hooks). This file lists what is
NEW and what is RENAMED. Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Bun's Dino Dig (the core loop must FEEL different)
| Bun's Dino Dig | Nuka's Snow Dig |
|---|---|
| tap a sand mound: a shovel scoops | **rub the snow drift** — swipe a finger back and forth over it; every stroke is one big **paw scoop** that flings snow in the stroke direction. A single tap still works (one scoop, then Nuka's paw keeps going slowly by itself) so a tap-only toddler always gets there; rubbing is faster and more fun |
| Bun the bunny, khaki hat | **Nuka** (`nuka`), a chubby polar bear cub with a warm brown knitted scarf, bottom-left |
| dinosaur valley, morning → night | **arctic snowfield by the sea** — spring → summer → autumn → winter |
| a right egg hatches a dino; finds hop onto a wooden shelf | a right find **floats up on a sparkle trail into the sky** and settles in a glowing **aurora ribbon** (northern lights) across the top: each find brightens the ribbon and adds a wave of light |
| round end: shelf items bounce | round end: the aurora **ripples**, and Nuka does a **belly-slide** across the snow and back (new `slide` pose) |
| chapter end: items slide into Bun's satchel | chapter end: the finds drift up out of the ribbon and fade like stars |
| mole pops out of sand; pterosaur glides | a **seal pup** pops out of an ice breathing hole; an **arctic tern** glides across the sky |

## 2. Screen and layout — unchanged from the base (§2 there)
Same `logicalSize`, `computeLayout`, `layoutTier`, mound placement, hit tests. Renames: `layout.bun` stays the helper box
(the field name stays `bun` in code: it is Nuka); `layout.shelf` stays the box of the **aurora ribbon** (same slots, same
size rules — only the art changes); `layout.satchel` is no longer used for leaving (items rise and fade, see §5.2).

## 3. Art style guide (ALL artists)
- **Original only.** Web research for reference only; never copy a known character or brand (no Iorek / Coca-Cola bears /
  Bernard / Snow White bear / Pingu / Frozen / Ice Age / Kung-fu Panda / Care Bears looks). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox
  256) in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light) — unchanged**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). `NK.PALETTE` in `content.js`.
- **Snow** (drifts, holes, flung snow): drift `#F4F8FC` (shade `#CFDDEA`, outline `#8FA9BF`, highlight `#FFFFFF`, a few
  soft blue-grey sparkle dots), hole inside `#9DBCD6` → `#5F86A8` (icy blue, much greyer and lighter than answer blue).
  At night (winter) the snow is `#C9D6EA` with outline `#6F86A6` and a soft moon-rim highlight.
- **Nuka**: a round chubby polar-bear cub (big head ~45 % of the height, small round ears, short snout), fur **warm cream
  `#FBF5E8`** (shade `#E2D7C1`, outline `#9A8C74` — warmer than the bluish snow so he separates from it), muzzle lighter
  `#FFFDF7`, nose and eyes `#2E2A33` with catch-lights, inner ears and cheeks soft blush `#F3BFB2` (pastel, NOT answer
  pink), paws with little dark pads, a **warm brown knitted scarf `#A8714A`** (dark `#7A4E30`, light `#C99670`, ribbed
  stripes, one tail fluttering). Never wears an answer colour.
- **Arctic snowfield** (calm and slightly desaturated so answer colours pop): far = sea with icebergs and distant snowy
  mountains; mid = snow banks, ice ridges, a little igloo, an inuksuk-like stone stack (muted grey), tundra tufts; ground =
  the snowy dig site, footprints, a few small rocks. Moods (`spring | summer | autumn | winter`, index 0..3):
  - spring: sky `#BFE3F5 → #EAF6FB`, snow melting at the edges, pale lilac saxifrage dots (muted `#B9A6C9`), icicles drip;
  - summer: sky `#86CBEF → #D4EEF8`, the midnight sun high, cotton-grass tufts (white fluff), calm blue sea, few clouds;
  - autumn: sky `#F3C79A → #F8E3C4` (warm low light, lilac top `#C6A9C4`), tundra in muted rust/ochre `#B98361 / #C9A86A`
    (NOT answer orange/red: greyer, darker), first snow on the peaks;
  - winter: polar night: sky `#1E2A52 → #3B4F7E`, moon, stars, a strong **aurora** (render), snow falling, snow bluish
    `#C9D6EA` (drifts still readable: render adds a soft moonlight glow over the field).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Nuka, surprises & icon — character artist A (`tools/art_nuka.py` → SVG)
| File | viewBox | Notes |
|---|---|---|
| `characters/nuka_{idle,blink,talk,happy,cheer,think,oops,wave,point,dig}.svg` | 0 0 300 300 | Nuka 3/4 view facing RIGHT (towards the field) but eyes on the child, **feet anchor (150, 292)**, identical body in every frame; happy = big smile; cheer = both paws up, eyes ^^; think = head tilt, paw on chin; oops = "hmm?" (never sad); talk = mouth open; wave = one paw high; point = right paw pointing right/up-right; dig = both paws forward, excited "dig dig!" (paws slightly lowered, snow on them) |
| `characters/nuka_slide.svg` | 0 0 300 300 | **belly-slide**: Nuka lying on his tummy, front paws stretched forward (to the RIGHT), hind paws up behind, big happy grin, scarf tail flying back; bottom anchor (150, 292), body ≈ 280 wide × 150 tall |
| `characters/nuka_full_wave.svg` | 0 0 300 300 | title pose (waving, holding a little red-free knitted mitten? NO — holding a small snowball in the other paw) |
| `characters/seal.svg`, `characters/seal_happy.svg` | 0 0 160 140 | a cute harp-seal pup (fluffy white-cream `#F2F0EA` with soft grey shading `#C9C7C2`, big black round eyes, whiskers, tiny nose) popping out of an icy breathing hole (an ice ring `#DDEAF4`/`#9DBCD6` with dark water inside), bottom anchor (80, 136); happy = eyes ^^, flippers up |
| `characters/tern.svg`, `characters/tern_flap.svg` | 0 0 200 140 | a little arctic tern (white body, soft grey wings `#B8C2CC`, black cap, **coral beak and feet `#E98A6A` small areas only**), wings up / wings down, facing RIGHT, centre anchor |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | full-bleed: Nuka popping up from a snow drift holding a found red knitted hat high, aurora ribbon in a deep-blue sky |
Delete the old `bun_*`, `dino_baby_*` files. Contact sheets: `tools/nuka_sheet.js` → `docs/art/nuka_sheet.png`, `nuka_3x.png`.

### 4.2 Snow-dig art (canvas code) — character artist B: `game/js/dig_art.js` → `NK.DigArt` (same API as the base)
Pure canvas drawing (Path2D, cache paths), node-safe at load. Origin = **bottom centre**, `size` = the thing's height.
```
NK.DigArt.drawThing(ctx, thing, size, opt)
  // thing = { kind, color?, shape?, animal?, text?, size? }  opt = { wob, glow 0..1, dim 0..1, night 0..1, shadow }
  //  kind 'hat'    : a knitted winter beanie in thing.color (base/dark/light), ribbed brim, knit texture, a big fluffy
  //                   POMPOM on top in the same colour's light tone — the pompom + the top of the hat is what peeks out of
  //                   the snow (readable from the top 38 %); width ≈ 0.9 size
  //  kind 'gem'    : a chunky ice gem in thing.shape (NK.SHAPES = circle, square, triangle, star, heart, rect, diamond,
  //                   oval) filled thing.color with a frosty white rim, a glossy highlight and a tiny snowflake glint — the
  //                   silhouette IS the shape (readable from the top 40 %); rect wider than tall (1.5:1), oval taller (1:1.35)
  //  kind 'fish'   : a happy cartoon fish standing on its tail (head up, smiling, big eye), silver-blue `#9FB9CF` body with
  //                   a lighter belly `#E3EEF6`, outline `#5E7C96`, small fins; NOT an answer colour (for counting)
  //  kind 'toy'    : a soft plush toy of thing.animal (NK.ANIMALS = fox, hare, reindeer, walrus, whale, dog, goose, owl) —
  //                   sitting, head on top, recognisable from the top 45 % (head + ears / antlers / tusks); own natural,
  //                   slightly muted colours per animal (arctic fox white-cream, hare white with grey ear tips, reindeer
  //                   brown with antlers, walrus brown-pink with tusks, whale blue-grey, dog husky grey-white, goose white
  //                   with orange-free beak (ochre), owl snowy white with yellow eyes); keep them distinct from each other
  //  kind 'tablet' : a rounded ice block (pale `#E3F0FA`, outline `#7E9DB8`, frosty edge) with thing.text carved big in
  //                   the upper half (deep blue `#2D4A6B` with a light bevel), readable when only the top 60 % shows
NK.DigArt.thingBox(thing, size) → { w, h }
NK.DigArt.drawMound(ctx, mound, opt)    // a SNOW DRIFT: dig 0 = a full rounded heap of snow (width w, height h0, a slightly
  //   flat top where the thing peeks out, soft blue shadow on the lower right, a few sparkles); as dig grows the heap lowers
  //   and becomes a ring of loose snow around a hole (hole ellipse w × 0.55, h 0.16 w) with fluffy rims left and right;
  //   dig 1 = the open hole with rims. opt = { glow 0..1 (soft gold rim + pulse), wob, night 0..1, sparkle 0..1 }
NK.DigArt.drawHoleBack(ctx, mound, opt)
NK.DigArt.drawShovel(ctx, angle, size, opt)   // NOW A BIG FLUFFY BEAR PAW (Nuka's, cream fur `#FBF5E8`, outline `#9A8C74`,
  //   dark pads on the underside), origin = the paw's tip (claw-free, rounded), angle 0 = paw pointing down (scooping),
  //   opt { sand 0..1 → a scoop of snow on the paw }. Same name so world/render need no change.
NK.DigArt.drawSandBit(ctx, r, rot, opt)       // one flung SNOW clump (white with a blue-grey shade), origin = centre
NK.DigArt.drawShelf(ctx, shelf, opt)          // THE AURORA RIBBON in box layout.shelf: a soft translucent wavy band of light
  //   (green `#7FE3B0` → teal `#6FD3E0` → violet `#B9A3F0`, alpha 0.25–0.55, additive-looking, no hard outline) with small
  //   glowing rings at the slot points where finds sit. opt = { t (s, animates the waves), n (finds so far → brighter,
  //   longer), ripple 0..1 (round-end ripple), night 0..1 (stronger at night), alpha }
NK.DigArt.drawIcon(ctx, thing, size)          // Talk time / previews, origin = CENTRE: 'hat' {color} | 'blob' {color} |
  //   'gem' {shape,color} | 'toy' {animal} | 'fish' {} | 'number' {n} | 'letter' {text} | 'dots' {n} (n fish icons in a
  //   tidy grid) | 'size' {size, kind:'fish'|'hat'}
NK.DigArt.drawGhostHand(ctx, size, t, opt)    // friendly pointing hand, origin = fingertip, t 0..1 tap; opt.rub → the hand
  //   draws a little back-and-forth motion arrow / swish lines (demo of the rub gesture)
```
Contact sheets (`tools/dig_sheet.js` → `docs/art/dig_*.png`): every thing × colour/shape/animal at in-game size and 3×,
drifts at dig 0 / 0.33 / 0.66 / 1 with a thing peeking (clipped), on spring / summer / autumn / winter ground, the paw, the
aurora ribbon with 0 / 4 / 12 finds.

### 4.3 Environment — environment artist (`tools/art_env.js`, `tools/env_scenes.js` RECIPE)
For `m ∈ spring|summer|autumn|winter`: `env/far_<m>.svg` (0 0 1200 720; sea + icebergs + snowy mountains, bottom-anchored,
tileable, transparent top, `<!-- sky #top #bottom -->` comment), `env/mid_<m>.svg` (0 0 1200 300; snow banks, ice ridges, an
igloo, a stone stack, tundra tufts), `env/ground_<m>.svg` (0 0 1200 260; the snowy dig site, tileable, top 40 px a soft
edge). `env/sun.svg`, `env/moon.svg` (0 0 200 200), `env/cloud_a.svg`, `env/cloud_b.svg` (0 0 300 140). **No volcano / smoke**
(`env/smoke.svg` removed). Particles (0 0 32 32): `snow` (a soft snowflake), `sand` (= a flung snow clump, white),
`dust` (soft powder puff, white), `petal` (spring: a tiny lilac saxifrage petal, muted), `fluff` (summer: cotton-grass
fluff), `leaf_a`, `leaf_b` (autumn: tiny dwarf-birch leaves, muted ochre/rust), `sparkle`, `star` (twinkle), `mote`
(light mote), `confetti_a`, `confetti_b`, `dot` (white, tinted by code), `feather` (tiny white, for the tern). Delete
`firefly.svg`, `smoke.svg`. Composed scenes at 1556×720, 960×720, 720×1556 per mood + seam test → `docs/art/`.

## 5. Code architecture (`game/js/`) — ownership
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `dig_art.js` (+ `tests/unit/dig_art.test.js`, `tools/dig_sheet.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_nuka.py`, `tools/nuka_sheet.js`, `tools/render_icons.js`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, manifest, `tests/e2e/*` | lead |

### 5.1 Content (`content.js`) — as the base §5.1 with these renames
- Thing kinds: `egg → hat` (colours), `stone → gem` (shapes, shapes5), `bone → fish` (count, size), `toy` (animals, initial —
  NEW list `NK.ANIMALS = ['fox','hare','reindeer','walrus','whale','dog','goose','owl']`), `tablet` (letters, numbers).
- `NK.WORDS` for `initial` (VI words without classifier): cáo C, thỏ T, tuần lộc T, hải mã H, cá voi C, chó C, ngỗng N, cú C
  — initials must be distinct in a round (content self-checks per language). EN: fox F, hare H, reindeer R, walrus W, whale
  W, dog D, goose G, owl O.
- `size` (age 3): two fish (or two hats), big ×1.25 and small ×0.72.
- Peek fractions (`CONFIG.peek`): hat 0.40 (pompom + crown), gem 0.42, toy 0.48, fish 0.42 (head), tablet 0.62.
- Prompt keys unchanged (`p.colors {color}`, `p.shapes {shape}`, `p.shapes5`, `p.size {size, kind}`, `p.animals {animal}`,
  `p.count {n}`, `p.letters`, `p.lower`, `p.initial`, `p.add`, `p.sub`, `p.oddeven`, `p.next`). `kind` param values are the
  new kind names.

### 5.2 `NK.World` — as the base §5.2 plus:
- **Rub gesture (NEW, the core gesture).** In `dig`, `pointerDown` on a buried/digging mound starts a press bound to that
  mound. `pointerMove` accumulates path length while the finger stays within the mound's hit circle (+ `rubPad` 40 px);
  every `rubStroke` (≈ 70 px of path) **or** every direction reversal of the x-motion after ≥ `rubMinSeg` (≈ 26 px) counts
  as ONE stroke → the same as a tap on that mound (starts the dig or queues a scoop; queue max raised to 3 while rubbing;
  scoop time `scoopFast`). Event `rub {id, x, y, dir}` per stroke (render flings snow towards `dir`; audio "shff"). The
  first stroke on a buried mound emits the dig start exactly as a tap would. A press that rubbed is never also treated as
  a tap on release, and never as `soft`. Rubbing on empty snow (no mound) → `sandTap` puffs at most every 0.25 s, no
  mistake. A tap still works as in the base (one scoop + auto scoops); `autoScoop` slows to **0.85 s** so rubbing is
  clearly faster. Bot: rubs (dispatches moves) half of the time.
- First round of the first chapter: the hint hand demonstrates a rub on the right drift once after the first ask
  (`hintHand.rub = true`) — event `rubDemo {id}` (main says "Rub the snow!").
- **No hatch.** Remove the egg hatch path (`crack`, `hatched`, `eggBits`, `hatch` event). A right **hat** does a happy
  twirl instead (`m.trot` spin 1 turn in 0.5 s, sparkle) before it flies up. `found` is unchanged.
- **Fly to the aurora**: the flying path to `shelf.slots[k]` is a gentle **float** (ease-in-out, 0.9 s, slight sideways
  sway ±18 px, scale to the slot size, no landing squash; a little settle bounce) instead of the ballistic hop;
  `w.flying[k].trail` = last 10 positions (render draws a sparkle trail); event `shelved` as before.
  `w.aurora = { n (finds on the ribbon), glow 0..1 (flashes to 1 on each shelved, decays), ripple 0..1 (round end) }`.
- **Chapter end**: shelf items `leave` 0 → 1 now means rising 120 px up and fading out (staggered), not moving to the
  satchel. Event `shelfLeave` without satchel coords.
- **Belly-slide in `cheer`**: `cheerTime` 2.2 s; `w.bun.slide` 0..1 (0 = standing at home) — Nuka hops (0.25 s), drops
  onto his tummy and slides right `slideDist` (min(420, 0.45 W)) px with friction easing, pauses, then slides back and
  stands up; `w.bun.slideX` (logical px offset of the feet point) + `_pslideX`; `w.bun.mood = 'slide'` while sliding.
  Snow puffs along the path (`slidePuff {x,y}` events). The slide path must stay inside the screen and never cover the
  bubble; drifts left in the field are simply passed in front of (Nuka draws behind front-row drifts).
- Surprises: `seal` (was mole: pops out of a free spot in the field from an ice hole; tap → `sealTap`, spins + splash
  sparkles) and `tern` (was ptero: glides across the sky band; tap → `ternTap`, loop-the-loop, feathers).
- Remove the `egg`-specific peek / thingW keys, add the new kinds.

### 5.3 `NK.Weather` — moods `spring | summer | autumn | winter` (index 0..3, crossfade 2.5 s). `ambient` as the base +
`aurora 0..1` (spring 0.25, summer 0.15, autumn 0.45, winter 1.0: how strong the sky aurora behind everything is).
Particles: spring = a few lilac petals + light motes, drip sparkles; summer = cotton-grass fluff drifting + motes; autumn =
tiny leaves tumbling in a breeze; winter = gentle snowfall (≤ 60 flakes, slow, sway) + twinkling stars in the sky band.
`addSand`/`addDust`/`burst` as before (sand = white snow clumps). `setParty(on)` (confetti). Cap 120.

### 5.4 `NK.Bot` — as the base, plus half of its digs are rubs (pointerDown on the mound, 3–6 pointerMove zig-zags ±50 px
over 0.4–0.9 s, pointerUp).

### 5.5 Test hooks — as the base §5.5 (`window.NK.debug`, `moundScreen`, `bunScreen` (= Nuka), `sealScreen`, `ternScreen`,
`answer()`), plus `rubMound(id)` → a list of CSS-px points for a rub path over that drift.

## 6. Voice — as the base §6 with helper **Nuka** (EN "Nuka", VI titles "Gấu Nuka", lines "Nuka"): a cheerful little polar
bear; pitch ≈ 1.2, rate ≈ 0.9. Title "Nuka's Snow Dig" / "Gấu Nuka Đào Tuyết"; logo lines "Nuka’s" / "Snow Dig", "Gấu
Nuka" / "Đào Tuyết". Things (VI with classifiers): hat "cái mũ len", gem "viên đá băng" (shape gems: "viên đá băng hình tam
giác"), fish "con cá", toys "con cáo / con thỏ / con tuần lộc / con hải mã / con cá voi / con chó / con ngỗng / con cú",
tablet "khối băng chữ …", drift "đống tuyết". Seal pup "hải cẩu con", tern "chim nhạn biển".
- Prompts (3 wordings each): `p.colors` "Find the {color} hat!" / "Bé ơi, tìm cái mũ len {color} nhé!", `p.shapes` "Dig up
  the {shape}!", `p.count` "Dig up {n} fish!" / "Bé đào {n} con cá nhé!", `p.animals` "Where is the {animal}?".
- New lines: `rub[]` ("Rub the snow! Swish, swish!" / "Bé xoa xoa tuyết nào!"), `say.scoop` ("Dig, dig, dig!"), found lines
  per kind ("A red hat — it's so cosy!", "The star gem!", "The fox! Hello!"), `fly[]` (rarely: "Up to the northern
  lights!" / "Bay lên ánh sáng bắc cực nào!"), `slide[]` ("Wheee! Belly slide!" / "Trượt bụng nè, vui quá!"),
  `weather.0..3` ("Spring! The snow is melting!", "Summer — the sun stays up all night!", "Autumn colours!", "Winter
  night — look, the northern lights!"), `surprise.seal`, `seal.tap`, `surprise.tern`, `tern.tap`, `enter[]` ("New snow
  drifts!"). `sayHatch` is removed (no hatch).

## 7. Integration (lead) — title (Nuka waving with a snowball beside a dug drift with a red hat, aurora, ▶ Play, star
total, language toggle, hold-⚙), settings with volume, HUD, bubble, pause with −/+, chapter banner, Talk time, session done
(every find of the session dances in the aurora, confetti). Audio: snow "shff/crunch" per scoop and per rub stroke (pitch
steps), powder patter, reveal "pop", hat twirl "twinkle", float-up "shimmer" + ribbon "chime", count chimes, wrong "boing",
already "pat", seal "ork" squeak, tern chirp, belly-slide "wheee" swoosh, ambient wind + distant gulls (spring/summer),
soft wind + tinkle (winter), music per mood (celesta / music-box, ducked under speech).

## 8. Performance — ≤ 10 drifts, Path2D cached, ≤ 80 snow clumps + ≤ 120 particles; adaptive quality as before.
