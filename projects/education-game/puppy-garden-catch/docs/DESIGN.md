# Puppy Garden Catch — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.PG`**. Classic `<script>` files, no build step.
This folder started as a copy of `../dino-nest-sort/` (namespace renamed DN → PG). Reuse its proven modules
(rng, voice, input, storage, assets, audio, ui, weather, test harnesses) and **replace** what is sorting-specific
(content, world, bot, render scene, art, prompts). Target: iPhone + iPad Safari first; touch is the only required input.

## 1. Lessons from kids' catch games (keep / change)
| Typical "catch the falling X" game | Puppy Garden Catch |
|---|---|
| Things fall fast, missing costs a life | Bubbles drift down slowly (≈ 6–8 s to fall at age 4); a missed right item bounces on the grass and floats back up — no lives, no timer |
| Catch everything that falls | Catch the item Pip asks for (colour / shape / number / animal); wrong ones hop out kindly |
| Tilt / arrow keys | Drag anywhere → Pip follows the finger left/right; tap → Pip runs there |
| Score counter | Stars only go up (3/2/1 per round) |
| Text instructions | Pip speaks every instruction (EN / VI); speech bubble shows the same words |

## 2. Screen and coordinates
Logical px, seconds, y down. **Short side is always 720**: landscape `H=720, W=clamp(round(720·aspect),960,1600)`;
portrait `W=720, H=clamp(round(720/aspect),960,1600)`. Safe-area insets `ins={top,right,bottom,left}` in logical px.
`World.setViewport(W, H, ins)` computes `world.layout`:
```
layout = { W, H, ins, portrait: H > W,
  groundY,      // H - ins.bottom - 64            (grass line: Pip's feet)
  pup:  { y, h, minX, maxX, speed },              // y = groundY + 6 (feet anchor); h = 170 landscape / 190 portrait (×1.1 when H/W > 1.6)
                                                  // minX = ins.left + 0.5·basket.w + 16 ; maxX = W - ins.right - 0.5·basket.w - 16 ; speed (max) = 1150 px/s
  basket: { w, h, rimDy },                        // w = 230 (age ≤ 4) / 210 (5) / 190 (6+), ×1.1 when portrait; h = 0.62·w
                                                  // the basket is carried in front of Pip; its rim centre = (pup.x, pup.y - rimDy), rimDy = 0.55·pup.h
  sky:  { top, bottom },                          // top  = ins.top + 150 (spawn line, below bubble/HUD)
                                                  // bottom = rim y (pup.y - rimDy) — where catches happen
  lanes: { x0, x1 },                              // horizontal spawn range = [minX, maxX]
  bubble: { x, y, w, h },                         // speech bubble: x = ins.left + 20, y = ins.top + 16, w = min(680, W - ins.left - ins.right - 190), h = 100
  pupTap: { r }                                    // tap within r=0.5·pup.h of Pip's chest → repeat prompt
}
```
HUD (DOM, top-right) occupies `x > W - ins.right - 160, y < ins.top + 92`; never spawn under it (spawn x is clamped
to `≤ W - ins.right - 180` for y < ins.top + 120 — spawn y is below that anyway).

## 3. Art style guide (ALL artists)
- **Original only.** Web search is for reference (puppy anatomy, cute flat toddler-app style, garden plants); never copy,
  trace or imitate a known character/brand (no Bluey, no Paw Patrol, no Snoopy, no Pokémon).
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks.
- Outline ≈ 4 px at viewBox 256 in a darker tone of the fill (never pure black). One-step cel shading (darker band
  lower/right) + one soft highlight upper-left.
- Items for busy backgrounds (animals, fruit) keep a white sticker border (≈ 6 px) + faint drop shadow (opacity .18, +3 y).
- No `<text>`, fonts, scripts, external refs; at most one `feGaussianBlur` per file. `width`/`height` = viewBox.
- Kid-friendly; nothing scary.
- **Answer palette (exact hex, same as the sister game; code draws shapes/labels with these):**
  | key | fill | dark |
  |---|---|---|
  | red | `#E84A4A` | `#A8282E` |
  | blue | `#3C8DE8` | `#1F5BA8` |
  | yellow | `#FFD23F` | `#C99A12` |
  | green | `#4CC26B` | `#2A8343` |
  | orange | `#FF9A2E` | `#C4650C` |
  | purple | `#9B6BE0` | `#6840A8` |
  | cream (plain ball) | `#FFF4DC` | `#C9A877` |
- **Pip the puppy** is warm caramel/biscuit brown (`#D9A066`, light muzzle/belly `#FFF0D6`, outline `#8A5A2E`,
  ears darker `#A8703C`, nose `#5A3A2A`), with a small **teal collar** (`#3FBFA8`) — never an answer colour.
- **Basket**: woven wicker, honey/tan `#E8B86A` with darker weave `#B8823A`; NOT orange/yellow-saturated.
- **Bubbles**: transparent, pale iridescent rim (white + faint pink/cyan), never tinted like an answer colour.
- **Garden background** stays calmer and yellower than the answers: soft sage/olive greens (`#A9CC7A`, `#8DBB6A`),
  hedge, wooden fence, flower beds with *pastel* flowers, a small garden shed far away, a puddle or two;
  sky drawn by code.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Pip, basket, balls, bubble, UI — character artist A
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `characters/pup_idle.svg` | 0 0 256 256 | h 170–190 | Pip, front view (slight ¾ is fine), sitting/standing upright on hind legs is NOT needed: a standing puppy facing the viewer, both front paws raised in front of the chest at y≈150 (they hold the basket, which is drawn on top by code). Floppy ears, round head ≈ 55 % of height, short tail visible on one side. **Feet anchor (128, 244).** Paws/hands region x 70–186, y 135–170. |
| `characters/pup_blink.svg` | same | | identical body, eyes closed (happy arcs) |
| `characters/pup_talk.svg` | same | | identical body, mouth open, small tongue |
| `characters/pup_happy.svg` | same | | big smile, ears perked up, tail up |
| `characters/pup_cheer.svg` | same | | eyes as happy arcs or sparkles, mouth wide open, ears flying up (cheer while holding the basket) |
| `characters/pup_think.svg` | same | | head tilted, eyes looking up-right, small mouth |
| `characters/pup_oops.svg` | same | | gentle "hmm?" (eyebrows up, small o mouth, one ear down) — NOT sad |
| `characters/pup_run1.svg`, `pup_run2.svg` | same | | identical body/head; legs in two alternating stride poses (for running left/right; code mirrors for direction; draw it facing RIGHT slightly: head turned toward +x) |
| `items/basket_back.svg` | 0 0 256 160 | w = layout.basket.w | back inner wall of a round wicker basket + dark inner shadow; **rim centre (128, 40)**, rim ellipse rx≈112, ry≈26 |
| `items/basket_front.svg` | 0 0 256 160 | | front wall + front rim (drawn OVER items inside); rim top at y≈40, bottom of basket y≈150; small handle stubs at both sides |
| `items/ball_<red\|blue\|yellow\|green\|orange\|purple>.svg` | 0 0 128 128 | 90–120 | soft toy ball, centre (64, 64), r≈52, palette colour with ONE lighter curved stripe band and a highlight |
| `items/ball_plain.svg` | 0 0 128 128 | | cream ball with a faint thin stripe at the edge only; **centre area must stay plain** (code draws letters/numbers on it) |
| `items/bubble.svg` | 0 0 128 128 | ≈1.35 × item size | soap bubble: transparent centre, rim gradient (white → faint cyan/pink), one big curved highlight upper-left + one small dot. Must be mostly transparent inside so the item shows through |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | | keep the existing ones (already in place) unless you improve them |
| `icon.svg` | 0 0 512 512 | | Pip's face + a bubble with a red ball, on a soft garden/sky background, full bleed, no transparency |

### 4.2 Animals & fruit — character artist B (0 0 128 128, centred, sticker border)
Existing (reuse; restyle only if it clashes): `items/animal_<fish|frog|duck|bird|owl|squirrel|rabbit|cow|sheep|bat|bear|hen|cat>.svg`,
`items/fruit_<apple|banana|strawberry|orange>.svg`. **New:** `items/fruit_pear.svg` (yellow-green pear), `items/fruit_cherry.svg`
(pair of cherries), `items/fruit_carrot.svg` (garden carrot with leaves), `items/animal_pig.svg`, `items/animal_snail.svg`
(friendly garden snail), `items/animal_ladybug.svg` (ladybird, cute, round). Same style as the existing animals (read
`tools/art_animals.py`, extend it into `tools/art_garden.py` or extend the file itself).

### 4.3 Environment — environment artist (bottom-anchored, horizontally tileable, transparent above the silhouette)
| File | viewBox | Parallax | Notes |
|---|---|---|---|
| `env/far.svg` | 0 0 1200 420 | 0.15 | distant soft hills, a few round trees, a tiny garden shed/greenhouse, misty blue-green |
| `env/mid.svg` | 0 0 1200 360 | 0.35 | garden hedge, wooden picket fence, sunflowers/tall pastel flowers, a bird house on a post, bushes |
| `env/ground.svg` | 0 0 1200 260 | static | lawn; grass top edge ≈ y 40 sits at `layout.groundY - 30`; stepping stones, small pastel flowers, a mushroom or two, 1–2 shallow puddles (pale blue-grey); extends down to 260 |
| `env/sun.svg`, `env/cloud1..3.svg`, `env/cloud_rain.svg`, `env/rainbow.svg` | as before | | keep or improve (clouds are where bubbles come from — a big fluffy look is good) |
Particles (`particles/`, 0 0 32 32 centred): keep existing `leaf1 leaf2 petal pollen butterfly1 butterfly2 raindrop splash sparkle
puff confetti_a confetti_b`; **new**: `pop` (bubble-pop ring of droplets), `droplet` (small round water drop).
Weather moods: 0 sunny morning, 1 breezy afternoon, 2 soft rain, 3 golden evening with rainbow.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` | voice & input engineer |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, render, ui, main.

### 5.1 Topics and content (`content.js` → `PG.Content`)
```
PG.PALETTE = { red:{fill,dark}, … cream }    // §3
PG.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['add','sub','initial','oddeven'] }
PG.Content.makeRound(topic, { age, lang, rng, roundIndex }) → round     // pure, deterministic
PG.Content.makeTalk(topic, { age, lang, rng }) → talk
PG.WORDS = { en:[{word, sprite, initial}], vi:[…] }                        // as in the sister game (+ new sprites where useful)
PG.ANIMAL_SOUNDS = { cow, duck, sheep, cat, hen, frog, bird, owl, pig } // which animals have a sound (text lives in i18n)
```
A round is a **target** + a **pool** of things that may fall:
```
round = { topic, mode:'catch'|'count', promptKey:'p.<topic>', params:{…},   // params: color / shape / size / animal / n+fruit / letter / sum…
  need,                         // right items to catch: warm-up (roundIndex 0) = 1; then 2, 2–3, 3 (count mode: N)
  target: { kind, value },      // e.g. {kind:'color', value:'red'}; count: {kind:'fruit', value:'strawberry'}
  pool: [ { sprite|null, shape?, color?, text?, scale, nameKind, nameValue, right:bool } … ],   // distinct item templates
  rightShare,                   // probability a new spawn is a right item (0.5–0.6; warm-up 0.7); never two wrong in a row at age ≤ 4
  maxAir                        // simultaneous bubbles: age 3 → 2, 4 → 3, 5 → 3, 6+ → 4 (warm-up: maxAir − 1, ≥ 2)
}
```
Topic rules (n = distinct kinds in the air, incl. the target):
- `colors`: balls `ball_<c>`, n = 2/3/4 by age 3/4/5+; target = one colour. **Colour-blind safety below age 5: never blue+purple or red+green in one round.**
- `shapes`: procedural shapes (`circle, square, triangle, star, heart`; + `rectangle` from 5), n = 2/3/4; age ≤ 4: each shape has its own colour
  (fixed within the round); age 5+: colours random per spawn so only the shape matters.
- `size`: balls of one colour, `scale` 1.3 (big) / 0.7 (small); target big or small; n = 2.
- `count` (mode `'count'`): target fruit kind (apple, banana, strawberry, orange, pear, cherry, carrot); pool = target fruit
  (right) + 1 other fruit (wrong, rightShare 0.7); `need = N`: age 4 → 1–5 (round 0 ≤ 2, later ≥ 2), 5 → 3–10 (round 0 ≤ 3),
  6+/count → 4–12. The basket shows N dots and fills them.
- `animals`: sprites `animal_*` from the sound list; n = 2/3/4; age ≤ 4 prompt names the animal ("Quack quack! Catch the duck!"),
  age 5 prompt uses only the sound ("Who says moo? Catch it!") from round 1 (warm-up names it).
- `letters`: `ball_plain` with `text` capital; pools en `ABCDEFGHKLMNOPRSTUW`, vi `ABCDEGHKLMNOPSTUVXY`; n = 3.
- `lower`: target "small a" (prompt shows/says the capital, items show lower-case; **no l and no I** pairs); n = 3.
- `initial`: target letter; items = picture sprites from `PG.WORDS[lang]` (right ones start with it); n = 3.
- `add` / `sub`: target = the answer number shown in the prompt as a sum ("Catch 2 + 3!"); items `ball_plain` with numbers; n = 3 distinct numbers.
- `oddeven`: target odd/even; items numbers 1–20, ≥ 3 distinct numbers in the pool.
Every round self-checks: pool has ≥ 1 right template and ≥ 1 wrong one (except count may have 1 wrong), names exist, need ≥ 1.
Talk object (same as the sister game, so `ui.js` works unchanged):
```
talk = { promptKey:'talk.<topic>', params, show:{ sprite|null, shape?, color?, text?, count?, scale? },
         choices:[{ id, kind, value }] /*3 (2 for size/oddeven), shuffled*/, answerId }
```
colors "What colour is this ball?" (choices kind color) · shapes · size (kind size) · count "How many?" (kind number, show count k fruit)
· animals "Who says {sound}?" → show nothing (`show:null` or a speaker-less panel is fine: show the sound as `text` is NOT ok for 3-year-olds,
so show a music-note sprite? → use `show: { sprite:'bubble' }`), choices kind `animal` · letters/lower "Which letter is this?" · initial · add/sub · oddeven.

### 5.2 `PG.World` (headless, deterministic with seed + inputs; fixed sub-steps ≤ 1/120 s)
```js
const w = new PG.World({ seed, age, lang, config });
w.setViewport(W, H, ins);    // re-layout; clamp Pip and every bubble into the new screen; cancels the drag
w.newSession(); w.startLevel(i);
w.pointerDown(x, y);         // starts a "steer": Pip's target x = x (also remembers if the point hit a bubble)
w.pointerMove(x, y);         // target x follows the finger
w.pointerUp(x, y);           // if it was a TAP (moved < 24 px, < 0.35 s) on a bubble → `tap` event (Pip names it); Pip keeps running to x
w.cancelDrag();              // stop steering (Pip stops where he is)
w.hint(); w.talkAnswer(id) → bool; w.skipTalk(); w.setAge(a); w.setLang(l);
w.update(dt); w.drainEvents();
w.itemAt(x, y) → item|null   // hit test (radius 0.6·size·scale + 14) used for taps
```
State machine as in the sister game: `'intro'` (1.8 s banner) → `'round'` → `'roundDone'` (1.7 s) → … (4 rounds or ≥ 3 rounds and
chapter > 75 s) → `'talk'` → `'levelDone'` (2.0 s) → next intro … → `'sessionDone'`.
Fields:
```
w.state, w.level, w.levels[], w.topic, w.weather (= level), w.round, w.roundsPerLevel (4), w.stars, w.levelStars, w.roundMistakes,
w.time, w.stateTime, w.alpha, w.layout, w.cur (round obj), w.talk,
w.pup    { x, vx, targetX, steering:bool, face /*-1|1*/, run /*0..1 how fast*/, step /*stride phase*/, tilt /*rad, leans into motion*/,
           mood:'idle'|'happy'|'cheer'|'think'|'oops', moodT, lookX, lookY, hop, _px },
w.basket { x, y /*rim centre*/, w, h, count, need, squash, shake, glow, wobble },
w.items  [{ id, sprite, shape, color, text, scale, size, nameKind, nameValue, right,
            x, y, vx, vy, rot, vr, sx, sy, state, t, appear /*0..1*/, bubble /*1 = intact, 0 = popped*/, glow /*0..1*/, phase, misses,
            _px, _py, _prot }]
// states: 'appear' (bubble pops into existence at the spawn line, 0.4 s back-overshoot) → 'fall' (drifting down in its bubble)
//   → 'pop' (touched the basket: bubble bursts, item falls into the basket on a short arc, 0.25–0.4 s) → 'in' (inside, wobbles)
//   wrong: 'pop' → 'bounce' (hops out of the basket on a ballistic arc away from Pip) → 'rise' (re-bubbled, floats up & off-screen, removed)
//   right item reaching the grass: 'ground' (bubble squashes on the grass and bounces, 0.5 s) → 'rise' → removed (it will be re-spawned)
//   round end: items in the air 'leave' (bubbles pop and fade, 0.4 s); items 'in' stay until the next round clears them
```
Spawning: keep `maxAir` bubbles in the air; spawn interval ≥ `CONFIG.spawnGap` (1.3 s; age 3: 1.6 s); first spawn of a round after 0.6 s.
New spawn x: farthest-point sampling over `lanes`, ≥ 1.4 × bubble size from the others at similar height; the FIRST spawn of every
round is a right item and lands within 0.35·W of Pip (warm-up: right above Pip's side). At least one right item is always in the air
when `maxAir` ≥ 2 (never a round with only wrong items falling for > 2 s).
Motion (physical; constants in `PG.CONFIG` with units):
- **Fall:** bubble terminal velocity `fallSpeed` px/s (age 3: 70, 4: 80, 5: 95, 6: 105, 7+: 115; ×(1 + 0.05·level)), reached with
  drag (v' = (vT − v)·2.2/s); sideways sway = sin(phase) · 22 px amplitude, period 2.4–3.2 s, plus `weather.wind × 45 px/s` drift
  (breezy), reflected softly at lanes. Small rotation sway ±0.15 rad. Hint glow → fall speed × 0.55.
- **Assist (ages ≤ 4):** a right item within `magnetX` (70 px) horizontally of the rim and within 140 px above it drifts toward the
  basket centre (gentle spring); none for wrong items.
- **Catch:** an item is caught when its centre crosses the rim line (y ≥ rim y − 10) moving down and |x − basket.x| ≤ basket.w·0.5 + 0.25·size.
  Pop → item drops into the basket (inherits vx, short arc, lands at a free slot inside, squash sx 1.15 / sy 0.82 spring back),
  basket `squash` 0.14 → damped spring (ω 18, ζ 0.35), Pip's `hop` 10 px for right items.
- **Wrong:** basket `shake` (damped sine 3 wiggles 0.5 s); item hops out (vx away from Pip's centre ±180 px/s, vy −520 px/s, gravity
  1500 px/s²), at the apex a new bubble forms (`bubble` 0→1) and it rises at 140 px/s with sway until off-screen.
- **Ground:** item centre reaching `groundY − 0.4·size` while not caught: bubble squash 0.25 and bounce (vy = −0.35·vy), then 'rise'.
  Emits `miss` only for right items.
- **Pip:** critically damped follow of `targetX` (ω 9 rad/s, |vx| ≤ pup.speed), clamped to [minX, maxX]; `run` = |vx|/speed;
  `step` advances by |vx|·0.012 rad/px (stride frames swap at π); `tilt` = clamp(vx·0.00025, ±0.12) with a spring;
  `face` = sign(vx) when |vx| > 40. Basket follows Pip with a slight lag spring (pendulum feel): basket.x = pup.x + sway, sway spring ω 14, ζ 0.4.
- Idle: Pip breathes/blinks (renderer); bubbles shimmer (renderer).
Events: `session {levels}`, `level {level, topic}`, `round {round, topic, mode, promptKey, params, need}`, `appear {id}`,
`catch {id, right}` (any item hits the basket), `correct {id, nameKind, nameValue, count, need, target}`, `land {id, count, need}`
(item settled inside — counting speaks the number here), `wrong {id, nameKind, nameValue, target, misses}`, `miss {id}` (right item hit the grass),
`hint {id}` (auto: after 2 mistakes (wrong catches + misses) since the last right catch, glow the lowest right bubble 4 s; cooldown 6 s,
never while one glows), `idle {promptKey, params}` (no catch for 12 s, gaps ×1.5 up to 30 s; reset on catch/new round; idle also glows a right bubble),
`tap {id, nameKind, nameValue}`, `pop {id, x, y}` (any bubble bursts: renderer FX), `bounce {id}` (ground bounce),
`roundDone {stars, mistakes, round, count, need}`, `talk {talk}`, `talkAsk {talk, n, glowAnswer}`, `talkResult {correct, choiceId, answerId}`,
`levelDone {level, stars}`, `sessionDone {stars}`.
Stars per round: 0 wrong catches → 3, 1 → 2, ≥ 2 → 1 (misses on the grass never cost stars). Talk correct → +1 star.
Pip mood: correct → happy 0.9 s (+hop), roundDone → cheer 1.6 s, wrong → oops 0.8 s, hint/idle → think 1.2 s; `lookX/lookY` → lowest right bubble.

### 5.3 `PG.Weather` — unchanged API from the sister game (`setWeather(i)`, `update(dt,{groundY})`, `particles`, `clouds`, `ambient`
incl. `wind` −1..1). Rain: drops splash on the grass and in puddles.

### 5.4 `PG.Bot` — `new PG.Bot(world, { skill, seed })`, `bot.step(dt)`: steers like a finger (down → moves at 700–1100 px/s eased →
holds, reaction delay 0.25–0.8 s by skill): predicts where the lowest right bubble will reach the rim and moves Pip there; with
probability `(1 − skill) × 0.35` it goes for a wrong bubble; at low skill it sometimes stops short. Talk: correct with p = 0.5 + skill/2.
`bot.stats = { steers, correct, wrong, misses, talks, talkRight }`. The bot must use `pointerDown/Move/Up` (the same API a finger uses).

### 5.5 Voice & text
`PG.I18N` / `PG.Voice` / `PG.Input` APIs exactly as in the sister game (see its DESIGN §6). Keys to add/change:
`ui.title` "Puppy Garden Catch" / "Cún Con Hứng Quà", `ui.subtitle`, `ui.voice` "Pip's voice" / "Giọng Cún Pip",
`ui.welcome` (Pip), `topic.<id>` for colors, shapes, size, count, animals, letters, lower, initial, add, sub, oddeven,
prompts `p.<topic>` with params (`{color}`, `{shape}`, `{size}`, `{n} {fruit}`, `{animal}`, `{sound}`, `{letter}`, `{sum}`, `{parity}`) —
e.g. `p.colors` "Catch the {color} ball!" / "Bé ơi, hứng quả bóng {color} nhé!"; `p.animalsSound` "{sound} Who says that? Catch it!";
`say.correct` per topic ("Yes! The red ball!"), `wrong` with `{name}` of what was caught + `{target}` ("That's a blue ball. Let's find red!"),
`miss[]` ("Oh! It bounced. It will come back!"), `hint[]` ("Look, it's glowing!"), `idle[]`, `praise[]`, `great[]`, `talk.*` for every topic,
`sound.<animal>` ("Moo!" / "Ụm bò!"), `I18N.sayCorrect(lang, ev)` / `I18N.sayWrong(lang, ev)` helpers.

### 5.6 Test hooks
URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=0.8` (never saved).
`window.PG.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), goTitle(), setBot(on, skill), setAutoRestart(on),
gotoLevel(i), voiceLog, bot, view(), render() }`.

## 6. Integration (lead)
DOM screens reused from the sister game (title, settings, pause, Talk time, done). Canvas scene: sky → sun/rainbow/clouds →
far/mid/ground blit → Pip (back) → basket back → items inside → basket front → Pip's paws (drawn over the basket rim: a small
paw pair sprite-free circle pair in Pip's colours) → falling bubbles → front particles → FX → banner.
Audio: pop (bubble), plop into basket, boing (wrong hop), soft bounce on grass, counting notes rising, star dings, chimes, fanfare,
music per weather, rain ambience; duck while Pip speaks.
