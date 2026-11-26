# Rio's Singing Eggs — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.SE`**, storage prefix `se:`. Classic `<script>` files, no build step,
node-safe at load (touch the DOM lazily).

**The code base is a copy of `../../puppy-cloud-drums/` (Bibi's Cloud Drums)** with `CD → SE`, `drum → egg`, `bibi → rio`,
`cd: → se:` replaced mechanically (file names too: `egg_art.js`, `rio_*.svg`, `art_rio.py`…). So comments, i18n text and art
still talk about drums, skins, cymbals, cloud cushions, lambs and a puppy — **that is what we are replacing**. The drum game's
original contract is kept in `docs/drums_ref/{DESIGN,MECHANICS,VOICE}.md`; when a detail is missing here, keep doing what it
says (state machine, events, judging core vs rim, soft / assist / hint / idle, Talk time, chapter time limit, short rounds,
prompt protection, test hooks). Internal names that stay (do NOT rename, the whole code base uses them): `cushion` (= the
mossy floating island + straw ring), `garland` / `lanterns` (= the vine + seed-pod lanterns), `cymbal` (= the little volcano),
`lamb` (= the baby triceratops), `bird`, `fireflies`, `card` (= the stone number tablet), `beat` (= counting taps), `skin`
(= the egg's "singing shimmer" ripple). Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Bibi's Cloud Drums
| Bibi's Cloud Drums | Rio's Singing Eggs |
|---|---|
| drums on floating cloud cushions | **big singing eggs** sitting in **straw rings on small floating mossy rock islands** (a few roots/vines dangle under each island). Same bounce physics (anticipation squash, hop, landing squash, island dent/bob, tilt). "skin" ripple → a shimmer band of light that runs round the egg + 2–3 sound rings |
| ask → tap, one target per ask | **copy my tune**: every round Rio first **plays the tune** (phase `demo`): a glowing spark flies from his mouth to each egg of the tune in order; the egg is struck (song strength) and sings, Rio names it. Then "Your turn!" and the child taps the eggs in that order (the steps). A wrong egg → kind words, then Rio **replays the rest of the tune** from the current step. |
| star lanterns on a string | a **vine** across the top with one **seed-pod lantern per note**; each pod shows a small picture of its note (`EggArt.drawIcon` of the target thing; ages ≥ 6: a "?" until it is played); the current pod pulses; a right note → it blooms (glows in the egg's colour) |
| beat the big drum N times | **copy N taps**: Rio taps the big spotted egg N times (counted aloud, the stone tablet lights a dot per tap), then the child taps it N times (as the drum game's beat steps) |
| cymbal on a stand | a **little volcano** (knee-high, friendly, rounded, warm brown rock with a soft orange glow in the crater — NOT an answer orange: use `#E89A5C`-ish muted) beside Rio. Song end: it puffs a **smoke ring of sparkles** (`cymbal` event); tap = a small puff, never progress, never a mistake |
| Bibi the puppy with drumsticks | **Rio, a tiny round baby dragon**, sitting bottom-left, facing right: no sticks — he **sings / blows sparks** |
| cloud lamb / bird / twinkle stars | **baby triceratops** trots along the ground (internal `lamb`; tap → happy hop pose `lamb_ball.svg` + "rawr") / little bird on the vine / night **fireflies** |
| rainbow cloud land | **dinosaur valley**: far volcano (calm, a thin smoke plume), cliffs and misty hills, tree ferns, cycads and palm-like trees, a waterfall far away; mid = ferns, mossy boulders, a few big leaves; ground = grassy meadow with ferns, small flowers and pebbles. Moods morning / noon / sunset / night |

## 2. Screen and layout — unchanged from the drum game (drums_ref DESIGN §2): pads, garland, Rio box (`bibi*` config keys are now
`rio*`), cymbal box (= volcano, same size), band, item sizes, zig-zag, hit circles ≥ 100 css px. The egg body box: w ≈ 0.78 ×
size, h ≈ size (eggs are taller than wide); the island under it: `cushionK` 1.25 × item wide, `cushionHK` 0.32 tall (the
visible rock may hang lower; the dangling roots are decoration and never hit-tested).

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only (baby dragon mascots, dinosaur egg illustrations, stylised prehistoric
  valleys); never copy a known character/brand (no Toothless / How to Train Your Dragon, no Spyro, no Elliott, no Puff, no Yoshi
  or Yoshi eggs, no Land Before Time, no Pokémon eggs/Charmander, no Peppa's George dinosaur). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)** `SE.PALETTE` — unchanged: red `#E84A4A/#A8282E/#F7A0A0`, blue
  `#3C8DE8/#1F5BA8/#A6CCF5`, yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). Colour-clash rules unchanged.
- **Neutral egg parts (never an answer colour):** egg shell cream `#FFF4E0` (shade `#EAD9BC`, line `#B4976E`), speckles
  `#D9C3A0`; straw ring `#E3C27E` / dark `#A88443` / light `#F5E2B0`; island rock `#9C8F86` / dark `#6E625C` / light `#BDB3AA`,
  moss `#8DBF6A` / dark `#5E8F45` (moss is a muted yellow-green, clearly not the answer green — keep it desaturated); vine
  `#6E9B52`, pods cream `#F7EBD0` with outline `#9E8A63`.
- Coloured egg (`kind 'egg'`, the colours chapter): the shell is the answer colour (base, cel shade dark, highlight light) with
  2–3 lighter speckles — the WHOLE egg is the colour so a 3-year-old reads it at a glance.
- **Rio**: a tiny round baby dragon, body **mint-aqua `#7CD3C4`** (shade `#4FA99B`, outline `#2F7A70`), cream belly `#FFF1D6`
  (shade `#EBD6AE`) with soft belly stripes, two little rounded horns + a tiny crest of rounded spikes `#F6D9A8` (peach-cream),
  small bat-like wings in **peach `#F7C9A8`** (shade `#DFA27F`), short chubby tail with a heart-ish tip, big round eyes (`#2F2A3A`
  pupils, catch-lights), rosy cheeks `#F2A99A`, a tiny smile with one little tooth. Never wears an answer colour. Sits on the ground.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Rio, surprise animals & icon — character artist A (`tools/art_rio.py`, rewrite of the Bibi generator)
| File | viewBox | Notes |
|---|---|---|
| `characters/rio_{idle,blink,talk,happy,cheer,think,oops,wave,point,dance,beat}.svg` | 0 0 300 300 | Rio 3/4 view facing RIGHT (towards the eggs), eyes on the child, sitting, **feet anchor (150, 292)**, identical body in every frame; talk = mouth open; happy = big smile, wings a bit open; cheer = both arms up, wings spread, eyes ^^; think = claw on chin; oops = "hmm?" head tilt (never sad); wave = paw waving high; point = arm pointing up-right; dance = one foot up, wings flapping, tail swish; **beat** = "sing / blow": head forward-up, mouth round "o" blowing (the world draws the spark coming from the mouth — record the mouth point) |
| `characters/rio_full_wave.svg` | 0 0 300 300 | title pose: waving, a cream speckled egg beside him |
| `characters/lamb.svg`, `characters/lamb_ball.svg` | 0 0 160 120 | a **baby triceratops** (soft lilac-grey `#B9B2D6` body, cream frill rim, tiny horns, never an answer colour), walking, facing RIGHT, bottom anchor (80, 116); `lamb_ball` = a happy hop pose (all feet off the ground, mouth open "rawr") |
| `characters/bird.svg`, `characters/bird_sing.svg` | 0 0 120 100 | a small round bird (soft grey-blue `#A9B4C2`, cream belly), facing LEFT, feet anchor (60, 96); sing = beak open, 2 song lines — the existing ones may stay, just check they fit |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep |
| `icon.svg` | 0 0 512 512 | Rio singing to a big cream speckled egg with music notes, valley sky, full bleed, opaque, no text |
Also write `docs/art/rio_hand.json` → rename meaning: per frame `{mouth: [x, y]}` (viewBox px, the spark origin) and keep the old
`tips` field = the mouth point for every frame (render.js reads `tips[0]`), and `docs/art/rio_bbox.json` as before.

### 4.2 Egg art (canvas code) — character artist B: `game/js/egg_art.js` → `SE.EggArt` (rewrite of the drum art)
Same API and anchor contract as drums_ref DESIGN §4.2 (origin = the BOTTOM CENTRE of the egg where it sits in the straw ring,
the body extends UP, `size` = the longest side = the egg's height; egg width ≈ 0.78 × size). Kinds:
- `'egg'` (colours, sizes): coloured shell (see §3) + speckles. `thing.size` 'big'/'small' only changes the world's size.
- `'shape'`: cream shell with a BIG shape emblem in thing.color (≥ 55 % of the egg width; outline in the colour's dark tone).
- `'big'` (counting copy-taps): a giant cream egg with warm brown-gold spots `#C9944A` and a gold star on its front, h ≈ size.
- `'dots'`: a cream egg with thing.n (1–12) red `#E84A4A` spots arranged countably (ten-frame-ish grid); `opt.count` rings.
- `'animal'`: thing.animal (**SE.ANIMALS = duck, chick, owl, frog, dino, snake** — babies) **peeking out of the bottom half of a
  cracked cream egg** (zig-zag crack edge, a shell cap tilted on its head), head + little wings/paws on the rim, natural muted
  colours (duckling yellow-cream `#F6E08A` with a peach beak — not the answer yellow; chick fluffy pale yellow `#FBE9A6`; owlet
  brown-grey `#A88E78`; froglet `#9CCB7A`; baby dino soft lavender-grey `#B7B0D8`; little snake
  `#9DBF8E` with cream belly), white sticker outline 5 px; `opt.sing` opens the mouth + 2 song lines.
- `'glyph'`: cream egg with a chunky letter/number in thing.color or `#5B6B9A` (font stack as before).
`opt` as before: `glow, ring` (struck: shimmer + 2–3 expanding sound rings from the top of the egg), `dull, sq, skin + skinPh`
(a bright shimmer band sweeping round the shell, amplitude skin), `dim, night` (moonlight rim, never darkens the body), `pop, count, sing`.
- `bodyBox(thing, size)` → `{w, h, cy}` (cy < 0).
- `drawCushion(ctx, x, y, w, opt)` — origin = TOP centre of the straw ring: a straw ring (the egg's bottom sits in it — draw
  the back half of the ring here; also export `drawCushionFront(ctx, x, y, w, opt)` = the front half of the straw ring the
  render draws AFTER the egg so the egg sits INSIDE it), on a small mossy rock island (rounded rock, moss cap, 2–3 dangling roots
  / a tiny fern). `opt {dent, t, night, alpha, pop}`. Height of the hit part ≈ 0.26 w; the rock may hang to ≈ 0.6 w below.
- `drawGarland(ctx, garland, lanterns, opt)`: a leafy vine (with small leaves) sagging between two tiny fern tufts at
  garland.x0/x1; pods `lanterns[i] = {x, y, lit 0..1, color|null, swing, flash, icon: thing|null, hidden: bool, now: 0..1}`:
  unlit = closed cream seed pod hanging from a short stem with the small icon (`drawIcon(thing, 0.62 × pod)`) on it at
  alpha 0.85 (or a "?" when hidden); `now` = gentle pulse/scale 1.12 + soft gold glow; lit = the pod opens into a glowing
  blossom tinted with the light tone of `color` (gold when null) with the icon still visible; `flash` = sparkle.
- `drawCymbal(ctx, cym, opt)` = **the little volcano** (origin = its foot on the ground, ≈ cymW × cymH box): rounded rock
  cone, crater glow, a thin idle steam wisp; `opt { tilt (use as a squash/puff wobble), ring 0..1 (puff: a sparkly smoke ring
  rising from the crater), night, t }`.
- `drawCard(ctx, x, y, n, opt)` = a **stone tablet** (rounded grey-cream stone, carved numeral, n dots that light gold).
- `drawNote(ctx, x, y, size, opt)` (music note), **`drawSpark(ctx, x, y, size, opt {color, alpha, t})`** (new: Rio's sung
  spark = a soft glowing star-puff with a tiny trail, colour = the egg colour's light tone or gold), `drawIcon(ctx, thing, size)`
  (all kinds + 'number', 'color', 'size', 'sound' (animal head) as before), `drawGhostHand`, `drawFirefly` (a real firefly: tiny
  body + a glowing yellow-green tail light `#E8F7A0`).
Contact sheets (`tools/egg_sheet.js` → `docs/art/egg_*.png`) and `tests/unit/egg_art.test.js` as before (+ drawSpark,
drawCushionFront, pods with icons / hidden / now).

### 4.3 Environment — environment artist (`tools/art_env.js`, `tools/env_scenes.js`)
Same file names and formats as the drum game (`env/far_<m>.svg` 1200×720, `env/mid_<m>.svg` 1200×300, `env/ground_<m>.svg`
1200×260, `sun`, `moon`, `cloud_a/b`, `rainbow`, particles 32×32 `mist mote sparkle star ember firefly leaf butterfly
confetti_a confetti_b dot dust note`), now a **dinosaur valley**; for reference you may read (not copy blindly) the dino-valley
layers of `../../turtle-dino-fishing/game/assets/default/env/` and `../../bunny-dino-dig/`. Keep it calm and a little yellower /
more muted than the answer colours. Moods: morning (pink-peach dawn, mist in the valley, low sun left), noon (blue sky
`#8FD0F4 → #E2F5FD`, high sun, bright ferns), sunset (`#C98BC0 → #FFC9A0 → #FFE7C2`, sun low right, golden rims, the far volcano
glows softly), night (`#1F2550 → #44508A`, crescent moon, stars, deep blue-green hills, a faint warm glow on the far volcano).
`leaf` = a small fern leaf for the noon breeze, `ember` = a tiny warm ember/ash mote for sunset, `firefly` = yellow-green glow.
Update ONLY the constant tables at the top of `game/js/render.js` (`SKY`, `GROUND_BOTTOM`, `SUN`, `MOON`, `CLOUDS`, `ENV`)
and `weather.js` MOODS colours if needed (coordinate: tell the lead the colours, the mechanics engineer owns weather.js).

## 5. Code architecture (`game/js/`) — owners as in the drum game
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `egg_art.js` (+ `tools/egg_sheet.js`, `tests/unit/egg_art.test.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_rio.py`, `tools/rio_sheet.js`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`, render.js header tables) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | lead |

### 5.1 Content (`content.js`)
- `SE.ANIMALS = ['duck','chick','owl','frog','dino','snake']` (babies that hatch; sounds EN quack, peep, hoot, ribbit, rawr, hiss /
  VI cạp cạp, chíp chíp, hù hù, ộp ộp, gừ gừ, xì xì). The animal prompt uses the sound ("Who says quack?").
- Rounds: a round's steps ARE the tune (each target once, in step order — the drum generator already does this). **Tune lengths**
  (`steps.length` for find rounds): age 3: warm-up 1, then 1–2 (n ≤ 2 targets); age 4: warm-up 1, then 2, 2–3, 3 (short rounds: 2);
  age 5: 2, 3, 3, 3; age 6+: 3, 3–4 (findAll / parity / sum topics keep their own structure; they get a demo of their targets too).
  Distractors as before (from round 2, ages ≥ 4).
- `count` at ages ≤ 4 = beat mode as before (copy-N-taps): warm-up 1 step n ∈ {1, 2}; later 2 steps (1 when short) of n ∈ 2–5,
  at least one n ≥ 3 per round when there are 2 steps.
- Each step gets the next note of a **pleasant little tune**: notes ascending is fine but allow up-down shapes (e.g. 0-2-4, 4-2-0,
  2-4-2 not possible since each egg once… → pick distinct notes, then order them as a random contour: up, down, or up-down).

### 5.2 `SE.World` — changes versus the drum world
- New phase **`demo`** inside state `round`: `enter → demo → play`. `this.demo = { from, i, list: [{id, step}], t, gap, lead,
  replay, beatN }` (null outside the demo). Timing (all `SE.CONFIG`): `demoLead` 1.3 s (first; the "Listen!" line) /
  `demoLeadReplay` 0.9 s, then per note: `sparkTime` 0.45 s flight (arc from Rio's mouth `rioMouth()` with apex 70 px), on arrival
  the egg is struck with `'demo'` strength (= song hop, ring, skin, sing for animals), event `demoNote {id, i, n, step, note,
  nameKind, nameValue, x, y, replay}`, its lantern flashes (`now` pulse); `demoGap` (time between note arrivals): age 3 1.35 s,
  4 1.25, 5 1.1, 6 0.95, 7 0.85 (animal notes + 0.25 s: the sound is longer). After the last note `demoTail` 0.5 s → event
  `demoEnd {replay}` → phase `play` and `_ask(first)`; the `ask` event gains `echo: true, afterDemo: bool`.
  Sparks are in `w.sparks[] = {x, y, _px, _py, t, life, color, toId}` (render draws them); Rio mood `beat` while a spark flies.
- **Beat steps:** each beat step gets its own demo: Rio sparks the big egg `need` times, `demoBeatGap` 0.6 s apart, each with
  `demoCount {i, n, x, y}` (the card shows and lights dots during the demo, then resets to 0 for the child: event `demoEnd`).
- **During the demo** taps on eggs are brushes (they sing softly, no judgement, never a miss, not "soft" for hint/assist counts);
  tapping Rio = nothing new (the tune is already playing). `interactive` is false. `answer()` returns null during the demo
  (the bot waits); `hint()` returns null.
- **Wrong in a find step:** as the drum game (`wrong` event, kind words, misses++), then after `replayDelay` 1.6 s (the line) a
  **replay demo** from the current step to the end of the tune (`demoStart {from, n, replay:true}`), unless the hint glow is
  active (2nd miss → glow + ghost hand as before; no replay then). Also `pokeRio` (tap Rio) in play → replay from the current
  step (cooldown 3 s) instead of only repeating the ask.
- Lanterns: `w.lanterns[i]` gains `icon` (the thing of the i-th note; null in beat mode → the card numeral), `hidden` (age ≥ 6 and
  not yet lit; during the demo the pod being played shows its icon for 0.8 s), `now` (0..1 spring: 1 for the next note to play in
  `play`, and for the demo note being sparked).
- `demoStart {from, n, replay, mode, x, y}` is emitted at the start of each demo (main speaks "Listen to my tune!" / "Listen
  again!"). The first `ask` after a demo is the "Your turn!" moment.
- Volcano (`cymbal`): `songDone` flow unchanged (`cymbal` event = sparkle smoke ring), tap → `cymbalTap`.
- `lamb` (baby triceratops): as the drum lamb (trots along the ground, tap → `lambTap`, "ball" = happy hop pose); fine to keep
  its physics.
- Test hooks: `eggHit(id)`, `rioHit()`, `answer()` (null during demo), `demoInfo()` → `{from, i, n, replay}` | null; config
  `demo: false` (URL `?nodemo=1`, tests only) skips demos.
- Rename leftovers: `bibi*` config keys → `rio*` (already done mechanically), `rioMouth()` helper replaces `_bibiMouth`.

### 5.3 `SE.Weather` — unchanged API; colours to the valley (§4.3); night particles = fireflies; noon = fern leaves + butterflies.
### 5.4 `SE.Bot` — waits while `world.phase === 'demo'`, then plays like the drum bot (beat mode: taps need times).

## 6. Voice, language — helper **Rio** (EN "Rio", VI "Rồng Rio" in titles, "Rio" in lines), a cheerful tiny dragon: pitch ≈ 1.25,
rate ≈ 0.9. Egg = "egg" / "quả trứng" (VI "trứng màu đỏ", "trứng hình tròn / hình vuông / hình tam giác / ngôi sao / trái tim /
hình chữ nhật / hình thoi / hình bầu dục", the big egg "quả trứng to", dots "trứng có {n} chấm"). Animals EN duckling, chick, owlet,
froglet → say "baby frog", baby dino, baby snake / VI "vịt con", "gà con", "cú con", "ếch con", "khủng long con", "rắn con".
New keys: `demo.start[]` ("Listen to my tune!" / "Bé nghe Rio hát nhé!"), `demo.replay[]` ("Listen again!" / "Bé nghe lại nhé!"),
`demo.note` = just the name ("Red!", "The star!", "Quack! The duckling!") via `sayDemo(lang, nameKind, value)`, `demo.count` =
the number word (`sayCount`), `turn.first[]` ("Your turn!" / "Đến lượt bé rồi!"), `turn.beat {n}` ("Your turn — tap the big egg
{n} times!" / "Đến lượt bé — gõ quả trứng to {n} cái nhé!"), `turn.next {name}` (soft cue for ages ≤ 5: "…and {name}!" / "…rồi
{name}!"), `wrong` → "That's the {what}. Listen again!" (then the replay plays), `song[]` ("Let's sing it together — tap an egg!"),
`songShort[]`, `songDone[]` ("What a singer, {child}!"), `cymbal.tap[]` ("Puff!"), `surprise.lamb` ("A baby triceratops!"),
`lamb.tap` ("Rawr! Hello!"), `surprise.bird`, `bird.tap`, `surprise.fireflies` ("Fireflies came to listen!"), `firefly.tap`,
`weather.0..3` ("Good morning, dino valley!", "Sunny noon!", "Sunset in the valley!", "Starry night!"), logo "Rio's" / "Singing
Eggs", VI "Rồng Rio" / "Trứng Biết Hát". Talk-time keys as before with egg words.

## 7. Integration (lead) — title (Rio waving beside 3 singing eggs, ▶ Play, star total, language toggle, hold-⚙), settings with
volume, HUD, bubble, pause with −/+, chapter banner, Talk time, session done (Rio dances, all pods bloom, confetti). Audio: each
egg **sings** its note (a soft "ooh/la" voice-like synth: two detuned sines + formant-ish band-pass, a little vibrato; brighter
for shape/glyph/dots eggs; the big egg = a warm low "boop"; animal eggs add a tiny synthesized call), demo notes identical to the
child's (that is the point), spark whoosh, wrong = muffled "bonk", volcano puff (filtered noise + sparkle), island "poof",
triceratops squeak-rawr, bird tweet, firefly twinkle, ambience per mood (morning birds, noon insects/breeze, sunset distant
waterfall, night crickets + frogs), music bed per mood (soft kalimba), ducked under speech, demo and the song.

## 8. Performance — ≤ 5 eggs, Path2D cached per thing+size, ≤ 120 particles + ≤ 6 sparks; adaptive quality as before.
