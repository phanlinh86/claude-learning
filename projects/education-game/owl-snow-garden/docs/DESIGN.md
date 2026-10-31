# Owlet's Snow Garden — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.SG`**. Classic `<script>` files, no build step (runs from disk and on
GitHub Pages). The code base started as a copy of `../dino-nest-sort/` (drag-sort world, content, bot, render, main, ui) with the
newer platform files of `../puppy-garden-catch/` (voice, input, storage, audio), namespace renamed to `SG`, storage prefix `sg:`.
Read those games' `docs/DESIGN.md` §2–§8 when a detail is missing here: everything not changed below stays as there.
**Target: iPhone + iPad Safari first** (also desktop). Touch is the only required input.

## 1. What changes versus Dino Nest Sort
| Dino Nest Sort | Owlet's Snow Garden |
|---|---|
| eggs dragged into nests | **seeds** dragged into **flower pots**; each planted seed sinks into the soil, sprouts and **blooms** into a flower |
| Bo the baby dinosaur (`bo`) | **Lumi the snowy owlet** (`lumi`): white/cream feathers, soft grey speckles, golden eyes, mint knitted scarf |
| dinosaur valley | **arctic** garden: snow ground, icy mountains, snowy pines, an igloo |
| sunny → breezy → rain → rainbow | **morning → noon → sunset → starry night** (northern lights at night) |
| `homes` topic (animal → home) | **`animals`** topic, mode `'ask'`: pots wear arctic-animal badges, Lumi asks for one animal at a time |
| fruit in count rounds, nest with N | seeds of one colour into one wide **planter** with N planting holes |

## 2. Screen and coordinates (as Dino §2, renamed)
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
- Insets `ins={top,right,bottom,left}` in logical px. `World.setViewport(W, H, ins)` computes:
  ```
  layout = { W, H, ins,
    groundY,                  // H - ins.bottom - 70  (snow line; pots stand on it)
    pot: { y, w, h, xs[] },   // w = min(230, (W-ins.left-ins.right-40)/n - 24); h = 0.78*w (viewBox 256×200)
                              // pot bottom at groundY + 8; soil (opening) centre y = bottom - h + 0.24*h ; y = soil y
    lumi: { x, y, h },        // feet anchor; x = ins.left + 105; y = ins.top + 225 (landscape) / ins.top + 245 (portrait); h = 175 / 190
    bubble: { x, y, w, h },   // x = lumi.x + 85, y = ins.top + 24, w = min(620, W - x - ins.right - 150), h = 104
    play: { x, y, w, h }      // seeds rest here: x ins.left+40 .. W-ins.right-40, y lumi.y+10 .. pot rim top - 24
  }
  ```
  Count rounds use one planter instead of n pots: `w = min(W-ins.left-ins.right-80, 120 + need*96)`, `h = 0.42*w` capped to 170,
  same bottom line; N planting holes evenly spaced along the soil line.
- Tall portrait (H/W > 1.6): seeds ×1.2, background layers ×1.36, seeds kept in a band ≤ 0.85×W tall just above the pots.
- Seeds rest inside `layout.play` (min centre distance 1.1×size, farthest-point sampling); shrink to 0.75× before giving up.
- Seed touch radius `0.6×size+14`. Pot drop zone: pot rect +30 px left/right, +90 px upwards.
- HUD buttons (DOM, top-right) occupy `x > W-ins.right-140, y < ins.top+90`.

## 3. Art style guide (ALL artists)
- **Original only.** Web search is for reference (owl/arctic-animal anatomy, toddler-app style); never copy a known character/brand.
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- Animal badges: **white sticker border** (≈6 px) + faint drop shadow inside the SVG (opacity .18, +3 y).
- No `<text>`, no fonts, no scripts, no external refs, at most one light `feGaussianBlur`. `width`/`height` = viewBox.
- Kid-friendly: no teeth/claws, nothing scary; the walrus tusks are short, round and cream; the polar bear is a cub.
- **Answer palette (exact hex):**
  | key | hex | dark (outline) |
  |---|---|---|
  | red | `#E84A4A` | `#A8282E` |
  | blue | `#3C8DE8` | `#1F5BA8` |
  | yellow | `#FFD23F` | `#C99A12` |
  | green | `#4CC26B` | `#2A8343` |
  | orange | `#FF9A2E` | `#C4650C` |
  | purple | `#9B6BE0` | `#6840A8` |
  | cream (plain seed) | `#FFF4DC` | `#C9A877` |
- Lumi: feathers `#FBFAF6`, shade `#DCE3EA`, speckles `#A9B4C2`, outline `#7C8899`, eyes iris `#F2B73A` with dark pupil
  `#3A2E2A`, beak `#5B5560`, cheeks `#F7B6C2`, **scarf mint `#5FD3B4` / dark `#2E8C78`** (never an answer colour).
- Pots: calm warm stone/ceramic `#E9DCC8`, shade `#D2C1A6`, outline `#9C8466`, soil `#6B4A36` / `#4E3425`. Planter: pale wood `#D8B98C`, outline `#94714A`.
- Background: snow `#F6FAFF`/shadow `#D6E4F2`, ice blues desaturated and lighter than `blue`; pines muted teal-green
  (`#5E8F86`-ish, never as saturated as `green`). The play band stays calm; the night sky is navy but the play band is lit
  (darkness tint ≤ 0.28 over the background only, never over seeds, pots, flowers or Lumi).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Lumi & core items — character artist A
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `characters/lumi_idle.svg` | 0 0 256 256 | h 175–190 | Lumi, round snowy owlet, small ear tufts, mint scarf with a fringe end, tiny feet, wings at the sides, ¾ view facing RIGHT. **Feet anchor (128, 244).** |
| `characters/lumi_blink.svg` | same | | identical body, eyes closed (happy arcs) |
| `characters/lumi_talk.svg` | same | | identical body, beak open |
| `characters/lumi_happy.svg` | same | | small hop, wings up, big smile eyes |
| `characters/lumi_cheer.svg` | same | | wings spread wide, sparkly star eyes |
| `characters/lumi_think.svg` | same | | head tilt, one wing tip at the beak, eyes up-right |
| `characters/lumi_oops.svg` | same | | gentle "hmm?" (brows up, small o-beak) — NOT sad |
| `items/seed_<red|blue|yellow|green|orange|purple>.svg` | 0 0 128 128 | 100–130 | big plump seed (rounded teardrop, point up, tiny curled green sprout on top), centre (64, 70), ≈ 84 w × 104 h, palette colour + 2–3 light stripes/specks |
| `items/seed_plain.svg` | 0 0 128 128 | | cream seed; **centre area plain** (code draws letters/numbers) |
| `items/pot_back.svg` | 0 0 256 200 | w = layout.pot.w | back half: inner rim + soil surface (soil centre (128, 48)) |
| `items/pot_front.svg` | 0 0 256 200 | | front body of the pot (rim lip front at y≈40–58, body tapers to a base at y≈196); drawn OVER seeds sinking and flower stems |
| `items/planter_back.svg` / `planter_front.svg` | 0 0 512 200 | planter w | long wooden planter box, soil line y≈54, same split |
| `items/sign.svg` | 0 0 128 112 | ≈0.55×pot w | wooden sign on a stake with a little snow cap; **blank board x 12–116, y 10–78**; stake bottom (64, 112) |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | 28–120 | gold star / grey outline star |
| `icon.svg` | 0 0 512 512 | app icon | Lumi's face + a blooming flower in snow on a soft sky, full-bleed, no transparency |
Flowers are drawn **by code** (render.js): stem + 2 leaves + 5–6 petals in the seed colour + cream centre (shape seeds: the
centre shows the shape), so petals can open with overshoot.

### 4.2 Arctic animals — character artist B (all 0 0 128 128, centred, ≈110 px, sticker border, must read at 64 px)
`items/animal_<bear|seal|fox|hare|reindeer|walrus|penguin|puffin|whale>.svg` — polar bear cub (white with cream shading, black
nose), grey harp-seal pup, white arctic fox, white snow hare with long ears, brown reindeer with small antlers + red-ish nose
(use `#C96B5C`, not the red answer colour), brown walrus with short cream tusks, black-and-white penguin, puffin with orange-
striped beak, small blue-grey beluga-style whale smiling. White animals need a pale blue-grey shade + darker outline so they
read on snow; the sticker border carries a faint blue drop shadow.

### 4.3 Environment — environment artist (bottom-anchored, **horizontally tileable**, transparent above)
| File | viewBox | Parallax | Notes |
|---|---|---|---|
| `env/far.svg` | 0 0 1200 420 | 0.15 | distant icy mountains + a glacier, pale blue-lavender |
| `env/mid.svg` | 0 0 1200 360 | 0.35 | rolling snowy hills, snow-capped pines (muted teal), one igloo, a few round ice rocks |
| `env/ground.svg` | 0 0 1200 260 | 1 | snow ground; top edge ≈ y 40 drawn at `layout.groundY - 30`; soft blue shadows, a few tiny crystals/footprints; down to 260 |
| `env/sun.svg` | 0 0 200 200 | — | friendly sun disc + soft rays (no face) |
| `env/moon.svg` | 0 0 200 200 | — | crescent moon, soft glow, sleeping-calm |
| `env/cloud1..3.svg` | 0 0 300 160 | — | fluffy clouds, white with light lavender shading |
Particles `particles/` (0 0 32 32, centred): `snow1`, `snow2` (snowflakes), `sparkle`, `star` (twinkle), `petal`, `leaf`,
`puff` (snow dust), `confetti_a`, `confetti_b`.
Times of day (sky + aurora drawn by code from `weather.ambient`): 0 morning (peach/pink, low sun, mist), 1 noon (bright blue,
sun high, glitter on snow, gentle snowfall), 2 sunset (orange → violet, big low sun), 3 starry night (navy, moon, twinkling
stars, green/teal/violet aurora ribbons, slow snowflakes).

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` | voice & input engineer |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, render, ui, main.

### 5.1 Content (`content.js` → `SG.Content`)
```
SG.PALETTE (as §3), SG.ANIMALS = ['bear','seal','fox','hare','reindeer','walrus','penguin','puffin','whale']
SG.AGE_TOPICS = { 3:['colors','size','shapes','animals'], 4:['colors','shapes','count','animals'],
                  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
SG.Content.makeRound(topic, { age, lang, rng, roundIndex, layout }) → round   // pure, deterministic, self-checks completable
SG.Content.makeTalk(topic, { age, lang, rng }) → talk
SG.WORDS = { en:[{word, sprite, initial}], vi:[…] }   // only arctic animal sprites (see below)
```
Topics (pots n / seeds):
- `colors`: n = 2/3/4 (age 3/4/5+); `seed_<color>`, 2 per pot (warm-up round: 1); label `{type:'color', value}`. Never blue+purple or red+green together below age 5.
- `shapes`: from circle, square, triangle, star, heart (+rectangle 5+); seeds are procedural shapes (`sprite:null, shape, color`); age ≤4 one colour per shape, age 5 colours mixed. Label `{type:'shape'}`.
- `size`: 2 pots big/small; seed scales 1.3 / 0.72; warm-up 1 each, then 2–3 per pot (≤5 seeds) of one colour.
- `count` (mode `'count'`): one planter `{type:'number', value:N}`, `need:N`; N: age 3–4 → 1–5, 5 → 3–10, 6/7 → 4–12 (round 0 ≤ 3; rounds ≥1 N ≥ 2);
  seeds: N + 2 (≥3 extra when N ≤ 3) of one colour. Done when the planter holds N; extra seeds then fade away.
- `animals` (mode `'ask'`): n = 2/3/4 pots, each label `{type:'animal', value}` (distinct, random from SG.ANIMALS);
  `round.queue = [basketId,…]` (warm-up: each pot once; later each pot 1–2 times, shuffled, no pot twice in a row when avoidable);
  seeds = queue.length `seed_<color>` of mixed colours, `answer:null`. The world's current target is `queue[0]`.
- `letters`, `lower`, `initial`, `add`, `sub`, `oddeven`: as Dino (plain seeds with `text`). `initial` words:
  **en** bear B · fox F · hare H · penguin P · puffin P · reindeer R · seal S · walrus W · whale W;
  **vi** gấu G · cáo C · cá voi C (not chim cánh cụt / thỏ: ch and th are their own sounds in VN phonics) · tuần lộc T · hải cẩu H · hải mã H (no puffin in vi words).
Round object (as Dino + ask mode):
```
round = { topic, mode:'sort'|'count'|'ask', promptKey:'p.<topic>', params:{n?, color?, animal?},
  baskets:[{ id, label:{type, value}, need?, kind:'pot'|'planter', x, y, w, h }], queue?:[basketId],
  items:[{ id, sprite|null, shape?, color?, text?, scale, size, nameKind, nameValue, answer|null, flower /*palette key*/ }] }
```
`flower` = the seed colour; plain/animal-round seeds get a palette colour too (renderer uses it for the petals).
Name kinds: `color, shape, size, animal, number, letter, parity, sum, diff, word, seed`.
Talk (one per chapter): colors "What colour is this flower?" (show a flower); shapes "What shape is this?"; size "Is it big or small?";
count "How many flowers?" (show k flowers); animals **"Where is the {animal}?"** (show nothing, 3 animal picture choices, the
prompt names the animal); letters/lower/initial/add/sub/oddeven as Dino.
```
talk = { promptKey:'talk.<topic>', params, show:{ sprite|null, flower?, shape?, color?, text?, count? }, choices:[{id, kind, value}], answerId }
```

### 5.2 `SG.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s) — API as Dino §5.2 plus:
- `w.lumi { mood, moodT, lookX, lookY, hop }` (was `w.bo`).
- Ask mode: `w.target` = current basket id (or null); event `ask { basketId, label, promptKey:'p.animals', params:{animal} }`
  whenever the target changes (also at round start). A drop into `w.target` is correct (seed hops into the next free slot),
  into another pot is wrong. `hint()` glows `w.target`. Prompt re-reads (`idle`) use the current target.
- **Planting / growth:** when a seed lands (`land`), it stays `state:'in'` and gets `item.grow` 0→1 over `CONFIG.growTime`
  (≈1.1 s): 0–0.25 the seed sinks into the soil (renderer: seed scales down and drops behind the pot front), 0.25–0.55 the
  stem rises (critically damped spring to full height), 0.55–1 the petals open with overshoot (spring ω≈14, ζ≈0.45).
  Event `bloom {id, basketId}` when grow reaches 0.55. Flowers then sway with `weather.ambient.wind` (renderer).
  Round end waits until the last flower has bloomed (+0.4 s) before `roundDone`.
- Basket fields add `kind` and `slots[{x,y}]` on the soil line (2–3 per pot; N for the planter).
- Other events/states/constants exactly as Dino (`grab`, `drop`, `correct`, `wrong`, `miss`, `tap`, `land`, `hint`, `idle`,
  `roundDone`, `talk`, `talkAsk`, `talkResult`, `levelDone`, `sessionDone`). A tap is not a drop (< 24 px, < 0.35 s).
- Motion: spring-follow drag (ω≈28) with pendulum tilt, ballistic arc into the slot (apex ≥ 60 px), landing squash + pot
  `squash` spring, wrong-drop pot `shake` + arc home, miss float home, staggered back-overshoot appear, idle bob + wiggle.

### 5.3 `SG.Weather` — `new SG.Weather({width, height, seed})`, `resize`, `setWeather(i, {instant})` (0 morning, 1 noon,
2 sunset, 3 night; crossfade 2.5 s), `update(dt, {groundY})`, `particles[] {sprite, x, y, size, rot, flipX, alpha, layer}`,
`clouds[] {sprite, x, y, scale, alpha}`, `ambient { skyTop, skyBottom, horizon /*glow colour near the ground*/, tint, wind,
sway, sun /*0..1 visibility*/, sunX, sunY /*0..1 of screen*/, moon /*0..1*/, stars /*0..1*/, aurora /*0..1*/, darkness /*0..0.28*/ }`.
Morning: a few drifting sparkles, mist. Noon: gentle snowfall (snow1/2 tumbling with flutter), glitter sparkles on the snow.
Sunset: slow snowflakes lit warm, sun low. Night: twinkling `star` particles in the sky layer, slow snow, aurora on. Cap 140 particles.
`weather.stars[]` (fixed twinkling star field: {x, y, r, phase}) and `weather.auroraT` (time) for the renderer.

### 5.4 `SG.Bot` — as Dino; in ask mode it carries any seed to `w.target`.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved). `window.SG.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill),
setAutoRestart(on), gotoLevel(i), voiceLog }` (live getters via `Object.defineProperties`).

## 6. Voice, language, input — as Dino §6 / Puppy `voice.js`, with:
- Helper name **Lumi** in both languages ("Lumi" / "Lumi"), a gentle owlet: pitch ≈ 1.2, rate ≈ 0.9.
- Name kinds add `animal` values bear→"polar bear"/"gấu Bắc Cực", seal→"seal"/"hải cẩu", fox→"arctic fox"/"cáo Bắc Cực",
  hare→"snow hare"/"thỏ tuyết", reindeer→"reindeer"/"tuần lộc", walrus→"walrus"/"hải mã", penguin→"penguin"/"chim cánh cụt",
  puffin→"puffin"/"chim hải âu cổ rụt" (vi may say "chim puffin"), whale→"whale"/"cá voi"; kind `seed` (the generic "seed"/"hạt giống").
- Prompts (keys `p.<topic>`): colors "Plant the {color} seed in the {color} pot!" (bubble may be generic: "Plant each seed in its
  colour pot!"), shapes, size, count "Plant {n} flowers!", animals "Plant a flower for the {animal}!" / "Bé ơi, trồng một bông hoa
  cho bạn {animal} nhé!", letters etc.; `say.bloom[]` ("Pop! A flower!"), counting on bloom in count rounds ("one", "two", …),
  `say.correct.<labelType>`, `praise[]`, `great[]` (with `{child}`), `wrong[]`, `miss[]`, `hint[]`, `idle[]`, `talk.*`,
  `weather.0..3` ("Good morning!", "It's noon!", "Sunset time!", "Good night, stars!"), `ui.*` as Dino.

## 7. Integration (lead) — as Dino §7: title (Lumi waving, ▶ Play, star total, language toggle, hold-⚙), settings, HUD, bubble,
pause, chapter banner, Talk time panel, session-done celebration (night garden full of glowing flowers). Audio: synth SFX (pickup
blip, whoosh, soft plop into soil, sprout "bloop" + bloom chime with rising notes for counting, bonk-free wrong wiggle, star dings,
fanfare), music per time of day (music box at night), wind ambience at night, ducking under speech.

## 8. Performance — as Dino §8; flowers are cheap vector paths, pre-rendered petal sprites per colour if needed.
