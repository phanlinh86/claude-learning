# Moka's Fairy Tea Party — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.FT`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../puppy-farm-parade/` (Bo's Farm Parade: state machine, voice, input,
storage, loud audio with volume, ui, main, tests) with `FP → FT` and storage prefix `fp: → ft:` already replaced. **The parade
world is replaced by a tea-table world.** When a detail is missing here, do what `../puppy-farm-parade/docs/DESIGN.md` /
`MECHANICS.md` / `VOICE.md` do (i18n / voice API, hooks, Talk time, chapter-topic rotation between sessions, idle auto-pause,
CONFIG style, hint cooldown / idle backoff, prompt protection, phone layout tweaks, short rounds when a chapter runs long,
soft-tap / assist rules, odd-one-out content self-checks). Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Bo's Farm Parade (the loop must FEEL different)
| Bo's Farm Parade | Moka's Fairy Tea Party |
|---|---|
| members walk in from the left in a line | things **float down from the sky on dandelion fluff** (swaying pendulum descent) and land on **leaf placemats** on a mossy **log tea table** (squash + table spring) |
| odd one boings onto a hay-bale stage | a tiny **fairy** swoops from the garland, circles the odd one, sprinkles dust; the odd one **levitates and floats UP** (buoyant rise with sideways sway, slight spin, shrinking) into the **fairy-light garland** and **lights the next flower lantern** (4 lanterns = 4 rounds per chapter) |
| tap the barn doors, everyone marches in | no gate: the matching friends do a **chime wave** — they hop one after another left→right, each rings a rising bell note; Moka raises his cup **"Cheers!"**; then a **fairy-dust puff** clears the table (things shrink into sparkles) |
| Bo the puppy, sunny farm, morning → night | **Moka** the little honey-brown bear at the head of the table holding a teacup; **fairy forest clearing**; **sunny → breezy → rain → rainbow** |
| tap / flick | **tap only** (a press that slides onto a thing within 0.25 s still counts, as before) |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px. `hudKeep` boxes as before.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */, phone /* long/short > 1.9 */,
    groundY,              // H - ins.bottom - (portrait ? 26 : 14)
    bubble: {x,y,w,h}, hud: {x,y,w,h},     // as the parade game
    moka: { x, y, h, w }, // FEET/seat point + height. Landscape x = ins.left + 120, y = groundY − 10, h = 250.
                          // Portrait: x = ins.left + 110, y = groundY − 6, h = 220 (Moka sits in FRONT/below the table, left).
    table: { y, x0, x1, top, legs:[x,x] }, // y = TABLE TOP surface where placemats lie (things' bottom y);
                          // landscape: y = groundY − 150, x0 = moka.x + 110, x1 = W − ins.right − 60;
                          // portrait: y = moka.y − moka.h − 40 (≥ garland bottom + 260), x0 = ins.left + 50, x1 = W − ins.right − 50.
                          // The log plank is drawn from x0 − 30 to x1 + 30, thickness 46, on two toadstool legs.
    slots: [{x}],         // n thing slots centred in [x0 + 40, x1 − 40], spacing = clamp(span/n, 1.25 × item, 1.7 × item)
    item: 120,            // thing size (height of its body box): ages ≤ 4: 124, 5: 114, 6+: 106; × 1.12 when tall and it fits;
                          // if 5 don't fit at 1.25×, item shrinks to itemMin = 100, then spacing to 1.12×.
    garland: { x0, x1, y, sag, lanterns:[{x,y}] }, // a vine strung between two tree trunks across the top of the play area,
                          // below the bubble: landscape y = bubble bottom + 46, portrait y = bubble bottom + 50; sag 40 px;
                          // 4 lantern hang points evenly on the curve (lantern hangs 34 px below the vine).
    fairyHome: { x, y },  // where the fairy rests (on the vine near the left tree)
    entryY,               // things start falling from y = −140 (above the screen)
  }
  ```
- **Thing hit test**: circle at the thing's body centre (bottom y − size/2, current position incl. hop/float), r = 0.6 × size + 14;
  nearest centre wins. Moka box → `pokeMoka`. Lanterns / fairy are not answer targets.
- Resting things are ≥ 44 px above the bottom HUD keep-outs; nothing interactive under the home indicator.
- Portrait: Moka sits bottom-left in front of the table end, the table is the middle band, garland on top. Tall phones: the
  background layers ×1.36 (as before) so trees fill the sky.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Winnie-the-Pooh / Paddington /
  Care Bears / Masha and the Bear / Tinker Bell / Totoro / Sylvanian Families look). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)** (unchanged; `FT.PALETTE` in `content.js`): red `#E84A4A/#A8282E/#F7A0A0`,
  blue `#3C8DE8/#1F5BA8/#A6CCF5`, yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange
  `#FF9A2E/#C4650C/#FFCB8E`, purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5).
  Below age 5 never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- **Table**: mossy log plank wood `#A9784E` / dark `#6E4A2E` / light `#D2A576`, moss on top edge `#8DAA6A` / `#5E7C46`
  (moss is muted sage — clearly not answer green), toadstool legs cream `#F3E6CC` with dusty-rose caps `#C98C86` (not answer
  red/pink). **Leaf placemats** `#B7C98E` / edge `#7F9560`. **Berries** (count counters, never asked by colour): raspberry
  `#C6375A` with seeds, on a cream plate `#FBF5E8` / rim `#D9CBB0`. **Cookie dough** `#E2B27A` / dark `#A97540`; the shape's
  icing is the answer colour. **Place cards** cream `#FFF8EA` folded tent card, dark-brown glyphs `#5A3B26`.
- **Moka**: a small round bear cub, fur **honey-brown `#C88A4E`** (shade `#A46C38`, outline `#6E4422`), cream muzzle / belly /
  inner ears / paw pads `#F4E2C4`, a dark nose `#3A2B2B`, big round eyes (`#2F2A3A` pupils, catch-light), rosy cheeks
  `#F2A99A`, a **cream knitted scarf with a soft teal stripe `#6FB7B0`** (teal is not in the answer
  palette and distinct from blue/green; keep it small), holds a small cream teacup `#FBF5E8` with a gold rim `#D8B26A`.
  Never wears an answer colour.
- **The fairy** (`pip`): a tiny glowing forest sprite ≈ a round cream-white body `#FFF7E0` with a warm glow, two pairs of
  translucent wings `#E8F4FF` (alpha 0.7) with thin lilac-grey veins `#B9B3D6`, little leaf cap `#9DB07A`, rosy dot cheeks.
  No human fairy, no dress — a round sprite, like a dandelion seed with a face.
- **Fairy forest** (calm, slightly yellow-green, misty; answer colours must pop): far = soft layered tree silhouettes with
  sun shafts; mid = big friendly tree trunks (two framing trunks carry the garland in code), ferns, glowing mushroom clusters
  (muted cream/rose), a little tree-stump house door; ground = a mossy clearing with clover and tiny muted flowers.
  Moods (`sunny | breezy | rain | rainbow`):
  sunny: sky `#BFE3D0 → #FBF6DF`, sun shafts through the canopy, motes;
  breezy: sky `#CFE6DA → #F5F1E2`, leaves blowing, swaying ferns (code sways things slightly), napkin flutter;
  rain: sky `#97A9B4 → #CBD6D6`, darker (darkness 0.12), rain streaks, puddle ripples on the table edge, Moka under a mushroom umbrella;
  rainbow: sky `#A9DCEB → #FFF1D9`, a rainbow arc behind the trees, sparkles, wet glints.
  **Lanterns** (garland): unlit = a closed bell flower bud in muted cream `#EDE3CC`; lit = it opens and glows warm gold
  `#FFE7A3` with an inner tint of the odd thing's colour (or gold for non-colour things) and a small icon of the thing inside.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Moka, fairy, surprise critters & icon — character artist A (`tools/art_moka.py`)
| File | viewBox | Notes |
|---|---|---|
| `characters/moka_{idle,blink,talk,happy,cheer,think,oops,wave,point,sip,umbrella}.svg` | 0 0 300 300 | Moka SITTING, 3/4 view facing RIGHT (towards the table) but eyes on the child, **seat anchor (150, 292)** (bottom centre), identical body in every frame; idle holds the teacup in both paws; happy = big smile; cheer = cup raised high ("Cheers!"), eyes ^^; think = head tilt, paw on chin; oops = "hmm?" head tilt (never sad); talk = mouth open; wave = one paw waving, cup in the other; point = paw pointing right; sip = sipping from the cup, eyes closed content; umbrella = holding a big mushroom cap as an umbrella (dusty-rose `#C98C86` cap with cream spots) over his head, cup in the other paw |
| `characters/moka_title.svg` | 0 0 300 300 | title pose: Moka waving with a little flower crown (cream / sage / dusty-rose, NOT answer colours) |
| `characters/fairy.svg`, `fairy_flap.svg`, `fairy_sprinkle.svg` | 0 0 120 120 | the sprite, centre anchor (60, 60), facing right; flap = wings in the other phase; sprinkle = arms forward with a little sparkle wand-leaf |
| `characters/ladybug.svg`, `ladybug_step.svg`, `ladybug_fly.svg` | 0 0 100 100 | a cute ladybug (shell soft coral `#E07A6A` — clearly softer than answer red — with dark dots `#3A2B2B`), facing RIGHT, feet anchor (50, 96); fly = shell open, wings out |
| `characters/butterfly.svg`, `butterfly_flap.svg` | 0 0 120 120 | soft lilac-peach butterfly `#D9B8E8` / `#F6C9A8` (pastel, not answer purple/orange), centre anchor |
| `characters/snail.svg`, `snail_peek.svg` | 0 0 140 120 | a snail with a cream shell `#EFD9B4` swirl and sage body `#B5C99A`, holding a tiny leaf umbrella; peek = eyes stalks up high; bottom anchor (70, 116), facing RIGHT |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Moka at a little log table with a teacup, a glowing lantern and the fairy above, warm sunny forest, full bleed |

### 4.2 Guests (animals) — character artist C (`tools/art_guests.py`)
`guests/<a>.svg` and `guests/<a>_hop.svg` (0 0 200 200, **bottom anchor (100, 196)**: a guest sitting BEHIND the table edge is
not needed — guests sit ON their leaf placemat like plush toys: full little body sitting, front view (slight 3/4 is fine),
body box ≈ 185 tall incl. ears; `_hop` = the same body with arms up / happy face (used in the chime wave)). Forest:
`bunny fox deer squirrel owl raccoon mouse hedgehog`; not forest: `penguin crab camel goldfish` (goldfish in a round glass bowl)
`lion`. Homes: forest `forest`, penguin `ice`, crab / goldfish `sea`, camel `desert`, lion `savanna`. Cute baby proportions, muted
natural colours (the fox a soft rust `#D58A52`, clearly not answer orange; no saturated answer colours on bodies). White
sticker-ish 6 px outer outline so they read on the table and in the rain.

### 4.3 Tea-party art (canvas code) — character artist B: `game/js/tea_art.js` → `FT.TeaArt`
Pure canvas drawing (Path2D cached per thing+size), node-safe at load. **Anchor: origin = the thing's BOTTOM centre (where it
sits on the placemat), the body goes UP (−y), `size` = body box height.** The caller sets the transform (translate, scale
squash, rotate tilt).
```
FT.TeaArt.drawThing(ctx, thing, size, opt)
  // thing = { kind, color?, obj?, shape?, n?, animal?, text?, big? }
  //   kind 'obj'    : obj ∈ cup (teacup on saucer) | teapot | jar (jam jar with a cloth lid) | bowl (with a spoon) | cupcake
  //                   — the object's main body painted in `color` (base/dark/light), cream/white accents
  //   kind 'cookie' : a round dough cookie on a small cream plate with the SHAPE as thick icing in `color`
  //                   (shape ∈ circle|square|triangle|star|heart|oval|rect|diamond); the icing shape must fill ≈ 70 % of the cookie
  //   kind 'plate'  : a cream plate with n raspberries (1–12, neat dice/rows layout, every berry clearly separate)
  //   kind 'card'   : a folded tent place card with `text` (letters, "3+2", "7−4", numbers ≤ 20) in big rounded glyphs
  //                   (canvas font `bold <px> ui-rounded, "Arial Rounded MT Bold", system-ui`), a tiny sprig on the corner
  //   kind 'guest'  : the SVG image FT.Assets.img('guests/<a>' or '_hop') (if loaded; else a soft placeholder), frame by opt.hop
  //   big: false → drawn at size × 0.62 (age-3 size topic: "the little one")
  // opt = { glow 0..1 (soft gold halo + outline pulse), dim 0..1, hop 0|1, night 0..1 (here: rain darkness — warm rim light,
  //         never darkens the body), count -1..n (plate: the first `count` berries get a white ring + shine while being counted),
  //         ring 0..1 (chime: a little gold bell ring flash above it) }
FT.TeaArt.drawPlacemat(ctx, w, opt)                 // leaf placemat (origin = centre of where a thing sits), opt.pop 0..1
FT.TeaArt.drawTable(ctx, x0, x1, y, opt)            // the mossy log plank + toadstool legs; y = top surface; opt.wet 0..1, opt.spring (px)
FT.TeaArt.drawGarland(ctx, g, lanterns, t)          // vine curve from g.x0 to g.x1 with leaves + tiny bud lights; lanterns =
                                                    // [{x, y, lit 0..1, color|null, thing|null, swing (rad)}]
FT.TeaArt.drawLantern(ctx, x, y, s, lit, color, thing, swing)   // bell-flower lantern (unlit bud → open glowing), hangs from (x, y)
FT.TeaArt.drawFluff(ctx, x, y, r, alpha)            // dandelion fluff parachute that carries a falling thing (drawn above it)
FT.TeaArt.drawHomeBadge(ctx, home, r, opt)          // round badge: forest (trees + mushroom), sea, ice, desert (dunes + cactus), savanna
FT.TeaArt.drawIcon(ctx, choice, size)               // Talk-time choice icons: any thing, or {kind:'color', color} (a paint blob),
                                                    // {kind:'number', n} (numeral + dots), {kind:'home', home}, {kind:'size', big}
FT.TeaArt.drawHintHand(ctx, x, y, press, alpha)
FT.TeaArt.drawSparkle(ctx, x, y, r, alpha, rot)     // 4-point twinkle (fairy dust)
```
Contact sheets: `tools/tea_sheet.js` (Playwright) → `docs/art/tea_*.png` at in-game size and 3× on table / moss / rain-dark.

### 4.4 Environment — environment artist (`tools/art_env.js`, `tools/env_scenes.js`)
For `m ∈ sunny|breezy|rain|rainbow`:
- `env/far_<m>.svg` (0 0 1200 720): layered soft forest silhouettes + sun shafts (sunny/rainbow), bottom-anchored,
  horizontally tileable (seam at 0/1200), transparent top. Sky colours in a comment `<!-- sky #top #bottom -->`.
- `env/mid_<m>.svg` (0 0 1200 340): ferns, glowing mushroom clusters, bushes, a little tree-stump door, small trunks; tileable.
- `env/ground_<m>.svg` (0 0 1200 260): mossy clearing, clover, pebbles, tiny muted flowers; tileable; (rain: puddles).
- `env/trunk_l.svg`, `env/trunk_r.svg` (0 0 220 900, bottom anchor (110, 900)): the two big framing tree trunks with roots and a
  branch stub high up where the garland vine ties (vine tie point at (110 ± 40, 140) — write it in a comment
  `<!-- tie x y -->`); the render draws them at the screen edges scaled to reach the garland.
- `env/sun.svg` (0 0 200 200), `env/rainbow.svg` (0 0 1200 600 arc, soft pastel), `env/cloud_a.svg`, `env/cloud_b.svg`,
  `env/cloud_rain.svg` (0 0 300 140).
- Particles (0 0 32 32): `mote`, `sparkle`, `leaf`, `leaf_b`, `petal`, `raindrop` (0 0 12 32), `splash`, `puff`, `dust`
  (fairy dust, soft gold), `seed` (dandelion seed), `confetti_a`, `confetti_b`, `star`, `dot`.
- `tools/env_scenes.js` exports `RECIPE` (layer heights for H=720 landscape and portrait scaling, sky colours, sun position per
  mood, the tall-portrait background ×1.36 rule, trunk placement + scale, rainbow placement) + composed scenes at 1556×720,
  960×720, 720×1556 per mood (with trunks, a fake garland line and a fake table of 4 coloured boxes) and a seam test into `docs/art/`.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `tea_art.js` (+ `tools/tea_sheet.js`, `tests/unit/tea_art.test.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_moka.py`, `tools/moka_sheet.js`) | character artist A |
| `guests/*` (+ `tools/art_guests.py`, `tools/guest_sheet.js`) | character artist C |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | integrator |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, tea_art, render, ui, main.

### 5.1 Content (`content.js` → `FT.Content`) — adapt the parade `content.js` (same API)
```
FT.PALETTE, FT.COLORS, FT.SHAPES, FT.OBJECTS ['cup','teapot','jar','bowl','cupcake'],
FT.GUESTS = { bunny:'forest', fox:'forest', deer:'forest', squirrel:'forest', owl:'forest', raccoon:'forest', mouse:'forest',
              hedgehog:'forest', penguin:'ice', crab:'sea', goldfish:'sea', camel:'desert', lion:'savanna' }
FT.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
FT.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short }) → round   // pure, deterministic, self-checks
FT.Content.makeTalk(topic, { age, lang, rng }) → talk
FT.Content.topicsFor(age, rng, lastTopics)
FT.Content.validate(round) → null | reason
round = { topic, age, lang, roundIndex, surprise: null|'ladybug'|'butterfly'|'snail'|'fairies',
  members: [ { id, thing: { kind, color?, obj?, shape?, n?, animal?, home?, text?, big?, nameKind, nameValue }, odd: bool } ],
  oddId, promptKey, params, rule: { kind, value } }
```
Same rules as the parade content (§5.1 there) with: `colors` → `obj` things; `shapes` → `cookie` things (one icing colour per
round at ages ≤ 4, mixed at 5); `size` → same obj or guest, odd = little; `count` → `plate` things (`p.count {n}` "Which plate
does not have {n} berries?"; on right the odd plate's berries are counted aloud while it floats); `animals` → `guest` things
(age 3 + every round 0: same animal ×2–3 + one other forest animal, `p.animal {animal}`; age ≥ 4 from round 1: different forest
guests + one non-forest guest `p.forest {}` "Who doesn't live in the forest?", its home shown on a badge under its lantern);
`letters`/`lower`/`initial`/`add`/`sub`/`oddeven` → `card` things (initial: guests or objects named in the current language).
Members per round as the parade (warm-up 3; age 4: 3, 4, 4, 5 …). Max 5.

### 5.2 `FT.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API as the parade game: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i),
update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), resetNudges(), skipTalk(),
setBreeze(wind 0..1), layout, hudKeep, state, phase, level, topic, round, roundsPerLevel, stars, levelStars, roundStars, misses,
talk, alpha, stateTime, phaseTime, interactive, weather (= level % 4), members, garland, fairy, moka, critter, hintHand,
memberById(id), answer()`.
States `intro | round | roundDone | talk | levelDone | sessionDone`. Phases in a round: `'enter' | 'play' | 'rise' | 'chime' | 'cheers' | 'clear'`.
- **Thing motion (physical):** **enter** (≈ 1.4–2.2 s): things spawn at `entryY` above their slot (staggered 0.22 s,
  random x offset ±60) and **fall under a dandelion fluff**: terminal-velocity descent (vy → 260 px/s with drag), sideways
  pendulum sway (the thing hangs below the fluff: angle spring ω ≈ 3.2, ζ ≈ 0.15, driven by breeze + a small per-thing phase;
  x drifts back to the slot with a soft spring), `fluff` alpha 1. On reaching the table: landing squash (sx 1.12, sy 0.86,
  spring back ω ≈ 16, ζ ≈ 0.4), the placemat pops, the table springs (a 1-D spring `table.spring` px, kicked by mass),
  the fluff detaches and drifts away up-left (event `land {id, i, x, y}`). When all landed → `ask {promptKey, params, first}` → `play`.
  Standing: idle breathing (±1.5 px, 0.6 Hz, per-thing phase); breezy: a gentle sway `rot` ≤ 0.04 rad driven by `wind`.
- **play** — one active pointer; a gesture's FIRST contact is judged on `pointerDown` (hit test); a press that starts on
  nothing, then moves onto a thing within 0.25 s, is judged on that thing. Later contacts of the same gesture ignored.
  - the odd one → **right**: event `right {id, thing, x, y, count?: {n}, home?, lantern: i}` → phase **rise**: the fairy flies
    from its rest point to the thing on a curved path (≈ 0.45 s, event `fairyArrive`), circles it once sprinkling dust
    (`dust {x, y}` a few times), then the thing **floats up**: buoyant rise (vy accelerates to −220 px/s with drag), lateral
    sway (sin, amplitude 26 px, 1.1 Hz), small spin, scale 1 → 0.42 as it approaches its lantern, the fairy leading just above
    it; plates: the berries are counted one by one before the rise (`member.count` 0..n, `countStep` 0.5 s, event
    `count {id, i, x, y}`); on arrival the lantern opens and lights (`lit` 0 → 1, a spring overshoot; event `lantern {i, x, y,
    color}`), the thing vanishes into it (its icon shows inside), the lantern swings (pendulum ω ≈ 4, ζ ≈ 0.12); guests show the
    home badge below the lantern for 2 s (`garland.badge = {home, i, a}`). Then `roundDone {round, stars, misses}` (3/2/1 for
    0/1/≥2 misses; assisted ≤ 2) and phase **chime**.
  - a matching thing → **wrong** `{id, got:{nameKind,nameValue}, want:{rule}, streak, x, y}`: "no-no" wiggle (rotation spring
    kick ±0.18 rad, ω ≈ 18, ζ ≈ 0.25) + a small hop (14 px); counts as a miss. Pressing the same wrong thing again within 1 s
    is not a new miss (event `wiggle`).
  - press on nothing → `soft {x, y}` + a little dust sparkle, no line; (3 → hint, 6 → assist: the odd one glows big and the next
    press ANYWHERE in the table band picks it). Press on Moka → `pokeMoka`. Press on the critter → its tap event.
  - After 2 misses or `hint()`: `hint {id}` — the odd one glows, the ghost hand moves to it and taps twice
    (`w.hintHand = {x, y, t, press, alpha, id, mode:'tap'}`); cooldown 6 s; idle nudges after 12 s, backoff ×1.5 up to 30 s.
- **chime** (≈ 0.3 s per remaining thing + 0.4 s): the remaining things hop one after another left→right (hop 26 px parabolic,
  squash on landing, guests show `_hop`), event `chime {i, n, id, x, y}` each (main plays a rising bell note); `ring` flash.
- **cheers** (≈ 1.1 s): Moka `cheer` (cup up), event `cheers {x, y}` (sparkle burst at the cup), the fairy does a loop.
- **clear** (≈ 0.8 s): a fairy-dust puff sweeps left→right: each thing shrinks (scale → 0) into sparkles (event `poof {id, x, y}`),
  placemats stay. Next round (enter) or Talk time after round 4 / once the chapter passed 75 s with ≥ 3 rounds done.
  After the 4th lantern of a chapter the whole garland twinkles (event `garlandFull`) before Talk time; lanterns reset per chapter.
- `w.members[] = { id, thing, odd, slot, x, y (BOTTOM), tx, vx, vy, sx, sy, rot, rotV, swing, fluff 0..1, state 'fall'|'sit'|
  'rise'|'lantern'|'poof'|'gone', glow, dim, count -1..n, scale, hop, ring, + _px _py _prot _psx _psy _pscale }`.
- `w.garland = { x0, x1, y, sag, lanterns:[{x, y, lit, color, thing, swing, swingV}], badge|null, twinkle 0..1 }`,
  `w.fairy = { x, y, flap, state 'rest'|'fly'|'circle'|'lead'|'loop'|'back', t, face ±1 }`, `w.table = { spring, springV }`.
- `w.moka = { mood idle|talk|happy|cheer|think|oops|wave|point|sip|umbrella, moodT, blink, look (−1..1), bounce 0..1 }`
  (in the rain chapter main keeps the `umbrella` frame as idle).
- Surprises (one round per chapter, never in the warm-up): chapter 0 **ladybug** (walks in along the table front edge from the
  right end, between placemats' fronts, never a target, `w.critter = {kind, x, y, step, state 'walk'|'stop'|'fly'|'gone', t}`;
  tap → `critterTap` it opens its shell and flies off), chapter 1 **butterfly** (flutters in and lands on a thing's top for a few
  seconds, then flies on; tap → flutter loop), chapter 2 **snail** (peeks out from under the table's right toadstool leg with
  its leaf umbrella; tap → eye stalks pop up), chapter 3 **fairies** (4 extra tiny fairies dance around the garland; tap one →
  twirl + twinkle). Event `critter {kind}` on appear.
- Events also: `level {level, topic, weather}`, `round {round, surprise}`, `fairyArrive`, `talk`, `talkAsk {n}`, `talkResult`,
  `levelDone`, `sessionDone {stars}`. Every positional event carries `x, y`.
- Rotation / resize mid-round: re-layout; cancel the gesture; slots re-placed, things snap `tx` (sitting things spring to the
  new slot), a rising thing retargets its lantern; everything clamped into the screen.

### 5.3 `FT.Weather` — adapt `docs/reports/ref_weather_koala.js` (Koko's Cake Tower: sunny → breezy → rain → rainbow):
`setWeather(i, {instant})` (0 sunny, 1 breezy, 2 rain, 3 rainbow; crossfade 2.5 s), `resize(W,H,groundY)`, `update(dt)`,
`ambient` (`skyTop, skyBottom, tint, light, sunX, sunY, sunA, darkness 0..0.15, wind 0..1, gust, rain 0..1, rainbow 0..1, mood,
moodIndex`), `clouds[]`, `particles[]` (sunny motes + seeds, breezy leaves + petals across, rain raindrops + splashes on the
table line, rainbow sparkles), `addDust(x, y, n)` (fairy dust, gold), `burst(x, y, {kind:'sparkle'|'stars'|'confetti'|'leaves', n})`,
`party(on)`, `tableY` for splashes. Cap 120. Particle kinds = the particle files in §4.4.

### 5.4 `FT.Bot` — taps through `world.pointerDown/Up`: taps the odd one with p = skill (else a random other thing), aim error
±0.3 × r, human-ish delays (0.8–2.4 s) after `ask`; sometimes slides on; answers Talk right with p = skill; taps critters sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.FT.debug = { world, weather, mode, stats, events, getState(), setSpeed(n), startGame(), goTitle(),
setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog, memberScreen(id) → {x,y,r} CSS px, mokaScreen(), critterScreen(),
answer() → {member} | null, toScreen(x,y), audio() }`. World supplies `memberHit(id)` {x,y,r}, `mokaHit()` box, `critterHit()`
(circle or null), `answer()`.

## 6. Voice, language — as the parade game §6 with helper **Moka** (EN "Moka", VI "Gấu Moka" in titles, "Moka" in lines), a
gentle little bear cub: pitch ≈ 1.1, rate ≈ 0.9. Things (VI): cup "cái tách", teapot "ấm trà", jar "hũ mứt", bowl "cái bát",
cupcake "bánh nướng nhỏ" (cupcake), cookie "bánh quy hình …", plate "đĩa dâu" (n "quả mâm xôi" → use "quả dâu" for kids),
place card "tấm thẻ"; guests "con thỏ, con cáo, con nai, con sóc, con cú, con gấu mèo, con chuột, con nhím, chim cánh cụt,
con cua, con cá vàng, con lạc đà, con sư tử"; homes: forest "rừng", sea "biển", ice "xứ băng", desert "sa mạc", savanna
"đồng cỏ châu Phi"; shapes as before.
`I18N` API used by main (all `(lang, e)` → string): as the parade (`ask`, `sayRight`, `sayCount`, `sayCountRun`, `sayWrong`,
`sayName`, `talkWrong`) with prompts: `p.colors` "They're all {color}… but one! Which one is NOT {color}?" (first) / "Which one
is not {color}?"; `p.shapes`, `p.shapes5` "Which cookie is not a {shape}?"; `p.size` "Which one is the little one?"; `p.count`
"Which plate does not have {n} berries?"; `p.animal` "Which one is not a {animal}?"; `p.forest` "Who doesn't live in the
forest?"; `p.letters`/`p.lower` "Which card is not {letter}?"; `p.initial`, `p.add`/`p.sub`, `p.oddeven` as before.
`sayRight` forest: "The penguin! The penguin lives on the ice." Keys: `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`,
`lantern[]` ("Up you go, little lantern!"), `cheers[]` ("Cheers!" / "Cụng ly nào!"), `garland[]` ("All the lanterns are
glowing!"), `talk.*`, `weather.0..3` ("What a sunny day for tea!", "Whoosh, a breezy day!", "Pitter-patter, it's raining!",
"Look, a rainbow!"), `surprise.ladybug|butterfly|snail|fairies`, `critter.ladybug|butterfly|snail|fairies` (tap lines),
`enter[]` ("Here come the tea things!"), `topic.*`, `session.done`, `party`, `ui.*` incl. `ui.volume`, logo lines "Moka's" /
"Fairy Tea Party", VI "Gấu Moka" / "Tiệc Trà Trong Rừng".

## 7. Integration — title (Moka in the flower crown waving beside a little table with a cup, a cookie and a lantern, ▶ Play,
star total, language toggle, hold-⚙), settings with volume, HUD, bubble, pause with −/+, chapter banner, Talk time, session done
(all 16 lanterns float around, Moka sips and cheers, confetti). Render order: sky → sun → rainbow → clouds → far → mid →
ground → trunks → garland vine + lanterns (+ badge) → back particles → table (legs, plank) → placemats → things (sorted by x;
rising things drawn later, in front) → fluffs → critter → Moka → fairy (+ extra fairies) → hint hand → front particles (rain) →
fx → banner. Audio: fluff whoosh (soft filtered noise), land "plop" + wooden table thunk, right "twinkle" glissando + fairy
chime, rise shimmer (rising sine sweep), lantern "bloom" (soft bell chord), wrong soft "boop-boop" wobble, count berry "pip"
rising, chime wave = rising pentatonic bell notes, cheers "clink" (two glass-like high partials) + little fanfare, poof
(sparkly noise burst), critter sounds, ambience per mood (sunny birds, breezy wind + leaves, rain pitter-patter, rainbow
birds + gentle shimmer), music bed per mood (soft music-box / celesta plucks, ducked under speech).

## 8. Performance — ≤ 5 things (+ critter), Path2D / bitmap cached per thing+size, ≤ 120 particles; adaptive quality as before.
