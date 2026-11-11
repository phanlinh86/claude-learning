# Tuk's Ice Match — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.IM`**, storage prefix `im:`. Classic `<script>` files, no build step.
The code base is a **copy of `../duckling-forest-memory/`** (Dee's Forest Memory, already renamed `DM → IM`): state machine,
voice, input, storage, loud audio, ui, main, tests all work. **Everything in `../duckling-forest-memory/docs/DESIGN.md`
still holds unless this file changes it** (layout §2, World API §5.2, hooks §5.5). Read that file too.
Target: iPhone + iPad Safari first, portrait and landscape. Short side 720 logical px.

## 1. What changes versus Dee's Forest Memory
| Dee's Forest Memory | Tuk's Ice Match |
|---|---|
| Dee the duckling (`dee`) | **Tuk the penguin chick** (`tuk`) — field name `w.tuk` (keep `w.dee` as an alias for one release) |
| cards, 3D flip (scaleX) | **ice blocks** lying on a frozen lake. Face-down = frosted (opaque white-blue frost with a crystal pattern). Reveal = **frost cracks off** (crack lines → shards fly → clear ice with the picture frozen inside). Hide = frost grows back from the edges inwards. `flip` 0..1 keeps its meaning (0 frosted … 1 clear) |
| tap only | **tap OR rub**: a pointerDown on a frosted block reveals it; while the finger is down, *entering* another frosted block also reveals it (a swipe/rub), until 2 blocks are up. A tap on the ice between blocks does nothing |
| matched cards spin + burst | matched blocks **glide together on the ice** (velocity + friction 2.2/s, no spring wobble), **clink** (small elastic bounce, restitution 0.3), then melt (sx/sy shrink + alpha, ripple ring) into a **hole**; the reward leaps out of the hole |
| mismatch shake | both blocks **wobble** (damped rotation ±0.07 rad, 3 wiggles), then frost grows back |
| deal from a stack (arcs) | blocks **slide in** from the shore (left in landscape / bottom in portrait) on the ice: launched with velocity, friction decelerates them exactly into their slot (v0 = sqrt(2·μ·d)), tiny overshoot bump; staggered 0.07 s |
| butterfly / lantern / acorns / animal / star | **fish** (colour: a fish of that colour leaps in a parabola out of the hole and dives into the sea at the shore with a splash), **sculpture** (shape: a snow sculpture of the shape in that colour slides to the shore line and stays), **fishes** (count: N fish jump out one after another, counted aloud, splash), **animal** (homes/animals/size: the animal hops out and waddles in 2–3 hops to its home badge on the shore, or just stays on the shore), **star** (letters/sums: a snowflake star rises and twinkles in the sky) |
| seasons | **weather stages** `0 sunny · 1 breezy · 2 rain · 3 rainbow` |
| surprise: shuffle / golden / pond | **slide** (after the hide, one or two frosted blocks glide to swap places on the ice), **aurora** (a golden pair under a green aurora shimmer, extra sparkle), **floes** (blocks sit on separate little ice floes that bob ±3 px and drift a little — the frozen-lake cracks) |

## 2. Screen and coordinates — as Dee §2 with these names
`layout.tuk {x, y, h}` (feet anchor, same numbers as `dee`; keep `layout.dee` as alias), `layout.board` = the frozen lake
area, `layout.shore` = the strip where rewards settle: landscape a band along the bottom of the board below the blocks
(y ≈ groundY − 10 … groundY + 50), portrait the band under the board; `layout.sea {x, y, w}` where fish dive (the open water
edge behind/right of the board, never under the HUD/bubble), `layout.perches` → shore spots `{x, y, kind:'shore'|'sky'|'sea'}`.
Block aspect w:h = **0.9** (chunky blocks, nearly square; was 0.78). Width ≥ 120 px at ages ≤ 4, ≥ 104 px at 5+.
Hit test: block rect + 10 px each side.

## 3. Art style guide (ALL artists)
- **Original only** (web search for reference only; never copy a known character — no Pingu/Pororo/Club Penguin/Happy Feet look).
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks, outline ≈ 4 px at viewBox 256 in a
  darker tone of the fill (never pure black). One-step cel shade + one soft highlight upper-left.
- Stickers (animals, homes): white sticker border ≈ 6 px + faint drop shadow (opacity .18, +3 y).
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`; `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark)**: red `#E84A4A`/`#A8282E`, blue `#3C8DE8`/`#1F5BA8`, yellow `#FFD23F`/`#C99A12`,
  green `#4CC26B`/`#2A8343`, orange `#FF9A2E`/`#C4650C`, purple `#9B6BE0`/`#6840A8`, pink `#FF8FC0`/`#C9558A`.
  Because the world is blue-white, **blue answers get the dark outline and a white inner rim** so they still pop on ice.
- **Tuk:** body/back slate navy `#2E3A59` (shade `#222B44`, outline `#161C2E`), belly/face `#FFFFFF` with shade `#E3ECF5`,
  beak + feet warm amber `#F2A33A` (outline `#B86F17`; browner than `orange`), eyes `#1E1A1A` + catch-light, cheeks `#F7A8B8`,
  **knitted hat** off-white `#F4EFE6` with **cherry stripes `#C9454F`** and a pom-pom (Tuk's red is darker/cooler than the
  answer red; Tuk never stands ON the board, and colour rounds never place a red block within 40 px of Tuk).
- **Ice blocks** (drawn by code, `ice_art.js`): clear ice `#DDF1FB` → `#BFE3F5` gradient with a lighter top-left bevel `#F4FBFF`,
  edge/outline `#6FA7C8`, corner radius 0.16·w, a 10 px thick lower "side" face `#9CCBE3` so they look like chunky blocks;
  frost layer `#F2F8FC`/`#DCEAF3` with a faint 6-arm snowflake/crystal motif `#C4DCEB` and sparkle dots. **All frosted blocks
  look identical** (no cue). Picture inside: drawn at 0.62·w on the clear ice, slightly bluish tint (multiply 6 %) so it looks
  frozen-in, but colours must still read (faces are drawn with full saturation, then a 12 % white glaze on top).
- Background: icy blues, whites and soft lilac; lighter and less saturated than every answer colour; the frozen lake panel
  (drawn by code) `#CFE6F2` sunny, `#D5E2EC` breezy, `#C3D6E3` rain (wet sheen), `#D9EAF5` rainbow.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Tuk & UI — character artist A (`tools/art_tuk.py`)
| File | viewBox | Notes |
|---|---|---|
| `characters/tuk_{idle,blink,talk,happy,cheer,think,oops}.svg` | 0 0 256 256 | identical body; ¾ view facing RIGHT; **feet anchor (128, 244)**; happy = small hop flippers up, cheer = flippers wide + star eyes, think = flipper at beak, oops = gentle "hmm?" (never sad) |
| `items/ice_back.svg` | 0 0 180 200 | a frosted block (optional: ice_art.js draws it by code if missing) |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | gold star / grey outline star (may stay as Dee's) |
| `icon.svg` | 0 0 512 512 | Tuk's face + two ice blocks (one clear with a red fish inside) on an icy-blue background, full-bleed |
Delete the old `characters/dee_*.svg` when Tuk's are in.

### 4.2 Polar animals and homes — character artist B (`tools/art_animals.py`, 0 0 128 128, centred ≈110 px, sticker border, reads at 70 px)
Animals `items/animal_<bear|seal|fox|owl|whale|puffin|penguin|hare|walrus>.svg`: white polar bear cub (cream `#F3EEDF`, outline
`#9C9378`), grey harbour-seal pup `#9AA6B2` with spots, white arctic fox `#F2F4F6` (outline `#8E9AA6`) with a bushy tail, snowy owl
white with dark flecks + yellow eyes, small blue-grey whale `#5C7FA8` with a spout, puffin (black/white, orange-red beak `#E8643A`),
penguin chick (fluffy grey, NOT Tuk), arctic hare (white, black ear tips), walrus calf (brown `#9B6E54`, small tusks). All facing
right, full body, distinct silhouettes.
Homes `items/home_<den|floe|burrow|nest|sea|cliff|pebbles>.svg`, same size + style, as round **badges** (sticker circle with a
scene): den = snow cave with dark opening, floe = flat ice floe on water with a breathing hole, burrow = snowy mound with a hole,
nest = twig nest on a rock, sea = waves with a splash, cliff = rocky cliff with a little hole, pebbles = ring of pebbles on snow.
Mapping: bear→den, seal→floe, fox→burrow, owl→nest, whale→sea, puffin→cliff, penguin→pebbles (hare, walrus: animals only).
Delete the old forest animal svgs.

### 4.3 Environment — environment artist (`tools/art_env.js`; bottom-anchored, **horizontally tileable**, transparent above)
For each stage `s ∈ sunny|breezy|rain|rainbow`: `env/far_<s>.svg` (0 0 1200 420, parallax 0.15: distant icy mountains /
icebergs), `env/mid_<s>.svg` (0 0 1200 360, parallax 0.35: snow hills, igloo, ice ridges, a few pines tipped with snow, open sea
edge with small icebergs at the bottom), `env/ground_<s>.svg` (0 0 1200 260, snow bank top edge ≈ y 40 drawn at `groundY − 30`).
sunny = bright blue sky, crisp; breezy = lilac-grey, snow drifts, wind-bent pines; rain = soft grey-blue, wet sheen, puddles on
the snow bank; rainbow = fresh, light, sparkly. Plus `env/sun.svg`, `env/cloud1..3.svg` (0 0 300 160), and `env/rainbow.svg`
(0 0 1200 500, soft pastel arc, transparent). Particles (0 0 32 32): `snow1`, `snow2`, `drop`, `splash`, `sparkle`, `star`,
`shard` (ice shard), `puff`, `confetti_a`, `confetti_b` (neutral, tinted by code). Delete forest-only files (petal, leaf_*, firefly,
far/mid/ground_<season>). Contact sheets at 1556×720, 960×720, 720×1556 per stage.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `ice_art.js` (replaces `card_art.js`; namespace `IM.IceArt`, keep `IM.CardArt = IM.IceArt` alias) | ice artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, ice_art, render, ui, main.

### 5.1 Content (`IM.Content`) — as Dee §5.1 with:
```
IM.ANIMALS = ['bear','seal','fox','owl','whale','puffin','penguin','hare','walrus']
IM.HOMES   = { bear:'den', seal:'floe', fox:'burrow', owl:'nest', whale:'sea', puffin:'cliff', penguin:'pebbles' }
IM.AGE_TOPICS = { 3:['colors','size','shapes','animals'], 4:['colors','shapes','count','homes'],
                  5:['shapes','count','letters','homes'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
```
- New topic **`homes`**: pair = animal face (kind `animal`, sprite `animal_<a>`) ↔ home face (kind `home`, value `<home>`, sprite
  `home_<home>`); `nameKind` per card: 'animal' / 'home'; match name: the animal (+ home). Age 4: up to 3 pairs; age 5: up to 4.
- `count`: numeral ↔ **fish** (face kind `dots`, drawn as small fish in a dice layout; reward `fishes` with n).
- Rewards: colors → `fish` (color), shapes → `sculpture` (shape, color), count/oddeven → `fishes` (n), animals/size → `animal`
  (sprite), homes → `animal` with `home` (it hops to a home badge placed on the shore), letters/lower/initial/add/sub → `star` (text).
- Keep Dee's colour-safety rules and pairs tables (CONFIG.pairsByAge); age 4: 2, 2, 3, 3.

### 5.2 `IM.World` — Dee §5.2 API unchanged except:
- `pointerDown(x, y)` → id|null as before; **`pointerMove(x, y)` while down reveals a frosted block the finger enters** (if fewer
  than 2 unmatched blocks are up, in `play`), emitting the same `flip` event with `via:'rub'`; `pointerUp` ends the rub.
  A rub never counts a block twice; a rub over an UP block does nothing (no repeated name spam).
- Per block extra fields: `vx, vy` (glide), `crack` 0..1 (crack-line progress during reveal, for the renderer), `frost` = 1 − flip
  (convenience), `hole` (bool, after melt: a hole is drawn at its place until the reward leaves), `bob` (floes).
- Events unchanged, plus `clink {a, b, x, y}` (blocks touched), `melt {id}`, `leap {id, x, y}` (each fish jump), `splash {x, y}`,
  `homeArrive {id, home}`; keep `deal` (now = slide-in start) and `land` (reward settled).
- Motion (physical): slide-in with friction (no arcs), reveal: crack 0→1 in 0.12 s then flip spring (ω≈18) with shards burst
  (event `flip` carries x,y for particles), hide = flip → 0 with a slower spring (ω≈10) so the frost visibly creeps back, mismatch
  wobble, match glide + clink + melt, fish = ballistic parabola (g = 1400 px/s²) from the hole to `layout.sea` with a spin aligned to
  velocity, fishes stagger 0.35 s, sculpture slides on the ice with friction to a shore spot, animal hops (parabolic hops, squash on
  landing) to its home badge; idle: face-down blocks glint (a sparkle every few s), very faint.
- `w.tuk {mood, moodT, lookX, lookY, hop, slide}`: on a match Tuk does a small happy hop; at round end Tuk **belly-slides** a short
  way and back (`slide` px offset, physical: friction) — a cheer that only a penguin can do.

### 5.3 `IM.Weather` — Dee's API; `setWeather(i)` 0 sunny, 1 breezy, 2 rain, 3 rainbow (crossfade 2.5 s); ambient
`{skyTop, skyBottom, horizon, tint, wind, sway, sun, sunX, sunY, darkness, stage, rainbow 0..1}`; particles: sunny = a few
sparkles in the air; breezy = blowing snow streaks with gusts (wind > 0.6); rain = falling drops with tiny splash rings on the
ice (`splash` particles at the lake level); rainbow = sparkles + gentle falling snow1. Cap 120.

### 5.4 `IM.Bot` — Dee's (taps via `world.pointerDown`). Add a `rub` option: sometimes reveals the 2nd block by pointerMove.
### 5.5 Test hooks — Dee's, `window.IM.debug`, `cardScreen(id)` (alias `blockScreen`).

### 5.6 `IM.IceArt` (ice artist, `ice_art.js`) — node-safe at load, touches DOM lazily, caches per (face, size bucket, dpr)
```
drawBlock(ctx, w, h, opt)                 // the clear ice block (bevel, side face, outline), centred at 0,0
drawFrost(ctx, w, h, frost, crack, seed)  // frost overlay: frost 1 = fully frosted; 0<frost<1 = creeps from edges / clears from
                                          // the centre; crack 0..1 = crack lines from the centre (during reveal)
drawFace(ctx, w, h, face, opt)            // the picture inside (kinds color(fish), shape(sculpture), dots(fish, dice layout ≤ 12),
                                          // number, letter, text, parity rim, animal/home → opt.sprite(name, x, y, size))
drawBack(ctx,w,h,opt) = drawBlock + drawFrost(1); drawFront(ctx,w,h,face,opt) = drawBlock + drawFace + glaze  // Dee-compatible
drawFish(ctx, color, size, wag /*0..1 tail*/)        // reward fish + colour face (rounded cute fish, eye, fin)
drawSculpture(ctx, shape, color, size, glow)         // snow sculpture of a shape (circle, square, triangle, star, heart, rect)
drawStar(ctx, size, text?)                           // snowflake-star for letters/sums
drawShard(ctx, size, rot), drawHole(ctx, w, h, t)    // ice shard particle, melt hole with ripple (t 0..1)
COLORS = { key: {base, dark, light} }
```

## 6. Voice, language — Dee §6 with helper **Tuk**: written "Tuk"; Vietnamese spoken "Túc" (substitute in spoken text only);
playful chick: pitch ≈ 1.3, rate ≈ 0.92. Animals EN/VI: polar bear "polar bear"/"gấu Bắc Cực" (accept "gấu trắng", "gấu"),
seal "seal"/"hải cẩu", arctic fox "arctic fox"/"cáo tuyết" (accept "cáo"), snowy owl "snowy owl"/"cú tuyết" (accept "cú"),
whale "whale"/"cá voi", puffin "puffin"/"chim hải âu cổ rụt" (accept "hải âu", "puffin"), penguin "penguin"/"chim cánh cụt",
hare "arctic hare"/"thỏ tuyết", walrus "walrus"/"hải mã". Homes: den "snow den"/"hang tuyết", floe "ice floe"/"tảng băng trôi",
burrow "burrow"/"hang đất", nest "nest"/"tổ chim", sea "the sea"/"biển", cliff "cliff"/"vách đá", pebbles "pebble nest"/"tổ sỏi".
Lines: prompts per topic ("Find two blocks that match!", "Find each animal's home!"), reveal names (rub-revealed too), match
lines ("The seal lives on the ice floe!"), kind mismatch, `peek[]` ("Look inside the ice!"), `hide[]` ("Brrr, the frost is back!"),
weather lines `weather.0..3` ("Sunny morning on the ice!", "Whoosh, a snowy breeze!", "Pitter-patter, a soft rain!", "Look, a
rainbow!"), logo "Tuk's" / "Ice Match", VI "Cánh Cụt Tuk" / "Lật Băng". Keep every key in both languages.

## 7. Integration (lead) — as Dee §7: title (Tuk waving beside three ice blocks that clear and re-frost by themselves), settings,
HUD, bubble, pause −/+, chapter banner, Talk time, session done = **rainbow party** (all rewards + Tuk belly-sliding).
Audio SFX: slide-in swish, frost crack crunch (noise burst + high tick), name chime, clink (two-note glassy ping), melt
shimmer, fish leap "bloop" + splash, sculpture swoosh, animal hop boops, wobble "hmm-hmm", star dings, fanfare; wind
ambience (breezy) and rain ambience (rain); music per stage.
## 8. Performance — ≤ 12 blocks, cached faces/frost, ≤ 30 rewards per chapter, ≤ 160 particles; adaptive quality as Dee.
