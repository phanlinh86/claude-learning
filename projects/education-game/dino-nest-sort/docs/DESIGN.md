# Dino Nest Sort — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.DN`**. Classic `<script>` files, no build step
(runs from disk and on GitHub Pages). Sister games with proven code to borrow from:
`projects/daily-game/foxy-reef-memory/` and `projects/daily-game/penguin-candy-dash/`.
**Target: iPhone + iPad Safari first** (also desktop Chrome/Safari). Touch is the only required input.

## 1. Lessons from kids' sorting apps (keep / change)
| Typical toddler sorting app | Dino Nest Sort |
|---|---|
| Drag item to matching bin | Same; item swings on the finger like it hangs from it, hops into the nest on a ballistic arc |
| Red cross / buzzer on error | Never. Item floats home, nest shakes "no" softly, Bo says something kind. After 2 misses on one item the right nest glows |
| Text instructions | Voice first (Bo speaks EN or VI), short text bubble as backup; tap Bo to repeat |
| Fixed landscape layout | Any screen shape: portrait iPhone, landscape iPhone, iPad; notch-safe |
| One skill | Age-tuned topics, 4 chapters with weather, items re-randomised each round |
| Timers / scores that punish | No timer. Stars only go up (3/2/1 per round) |

## 2. Screen and coordinates
- Logical coordinates, px, seconds, y down. The **short side is always 720** logical px:
  - landscape: `H = 720`, `W = clamp(round(720 × aspect), 960, 1600)`;
  - portrait:  `W = 720`, `H = clamp(round(720 / aspect), 960, 1600)`.
  - If clamped, the canvas is letter-boxed by CSS (page background = sky colour).
- Safe-area insets (notch, home bar) arrive in logical px: `ins = {top,right,bottom,left}`.
- `World.setViewport(W, H, ins)` computes `world.layout` (everything else reads positions from it):
  ```
  layout = { W, H, ins,
    groundY,                 // H - ins.bottom - 70   (grass line: nests stand on it)
    nest: { y, w, h, xs[] }, // nest opening centre y = groundY - 0.45*h ; w = min(240, (W-ins.l-ins.r-40)/n - 24) ; h = 0.62*w
    bo:   { x, y, h },       // feet anchor; x = ins.left + 105, y = ins.top + 225 (landscape) / ins.top + 245 (portrait); drawn height h = 175 / 190
    bubble: { x, y, w, h },  // speech bubble right of Bo: x = bo.x + 85, y = ins.top + 24, w = min(620, W - x - ins.right - 150), h = 104
    play: { x, y, w, h }     // where items rest: x ins.left+40 .. W-ins.right-40, y bo.y+10 .. nest top-24
  }
  ```
  HUD buttons (DOM, top-right) occupy `x > W - ins.right - 140, y < ins.top + 90` — nothing interactive there.
- Items rest inside `layout.play` without overlapping (min centre distance 1.1 × size). If they don't fit,
  the generator shrinks item size down to 0.75× before giving up.
- Item touch radius is generous: `0.6 × size + 14`. Nest drop zone: the nest rect grown by 30 px on each
  side and 90 px upwards (kids drop high).

## 3. Art style guide (ALL artists)
- **Original only.** Web search is for reference/inspiration (anatomy, what a cute toddler-app style looks like);
  never copy, trace or imitate a known character/brand (no Barney, no Dino from known shows, no Pokémon).
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks.
- **Outline** ≈ 4 px (at viewBox scale 256) in a darker tone of the fill (never pure black). One-step cel shading
  (a darker band on the lower/right side) + one soft highlight on the upper-left.
- Items that sit on busy backgrounds (animals, fruit) use a **white sticker border** (≈6 px) around the silhouette
  plus a faint drop shadow inside the SVG (`opacity .18`, offset +3 y). Eggs don't need it.
- No `<text>`, no fonts, no scripts, no external refs, no filters heavier than one `feGaussianBlur` (iOS perf).
  `width`/`height` = viewBox. Transparent background unless stated.
- Kid-friendly: nothing scary, no teeth/claws emphasised; the volcano smiles or at least is calm.
- **Shared palette (exact hex — signs and procedural shapes use these):**
  | key | hex | dark (outline) |
  |---|---|---|
  | red | `#E84A4A` | `#A8282E` |
  | blue | `#3C8DE8` | `#1F5BA8` |
  | yellow | `#FFD23F` | `#C99A12` |
  | green | `#4CC26B` | `#2A8343` |
  | orange | `#FF9A2E` | `#C4650C` |
  | purple | `#9B6BE0` | `#6840A8` |
  | cream (plain egg) | `#FFF4DC` | `#C9A877` |
  Bo is teal/mint (`#5FD3B4`, belly `#FFF1C9`, outline `#2E8C78`) so he never looks like an answer colour.
  Background greens stay softer/yellower than `green` (#4CC26B) and the play band stays calm and mid-light.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & core items — character artist A
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `characters/bo_idle.svg` | 0 0 256 256 | h 175–190 | Bo, baby dinosaur (round body, short tail, 3 soft back plates, tiny arms, big head), ¾ view facing RIGHT. **Feet anchor (128, 244).** |
| `characters/bo_blink.svg` | same | | identical body, eyes closed (happy arcs) |
| `characters/bo_talk.svg` | same | | identical body, mouth open (oval, tongue) |
| `characters/bo_happy.svg` | same | | small hop pose, arms up, big smile (feet may be off the ground a bit; anchor still at (128,244)) |
| `characters/bo_cheer.svg` | same | | big cheer, sparkly star eyes, both arms up |
| `characters/bo_think.svg` | same | | head tilt, one hand on chin, eyes looking up-right |
| `characters/bo_oops.svg` | same | | gentle "hmm?" (eyebrows up, small o-mouth) — NOT sad |
| `items/egg_<red|blue|yellow|green|orange|purple>.svg` | 0 0 128 128 | 100–130 | spotted dino egg, egg centre (64, 68), egg ≈ 86 w × 110 h, palette colour + lighter spots |
| `items/egg_plain.svg` | 0 0 128 128 | | cream egg with very faint spots; **centre area must stay plain** (letters/numbers are drawn on it by code) |
| `items/nest_back.svg` | 0 0 256 160 | w = layout.nest.w | back half of a twig nest + inner shadow; opening centre (128, 62) |
| `items/nest_front.svg` | 0 0 256 160 | | front rim only (drawn OVER items sitting in the nest); rim top at y≈70 |
| `items/sign.svg` | 0 0 128 112 | ≈0.55 × nest w | wooden sign on a stake; **blank board x 12–116, y 8–78** (code draws the label there); stake bottom (64, 112) |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | 28–120 | gold reward star / grey outline star |
| `icon.svg` | 0 0 512 512 | app icon | Bo's face + an egg on a soft sky background, full-bleed, **no transparency** (iOS rounds corners) |

### 4.2 Animals, fruit, homes — character artist B (all 0 0 128 128, centred, sticker border)
- `items/animal_<fish|frog|duck|bird|owl|squirrel|rabbit|cow|sheep|bat|bear|hen|cat>.svg` — cute, front or ¾ view, ≈110 px silhouette.
- `items/fruit_<apple|banana|strawberry|orange>.svg` — ≈100 px.
- `items/home_<pond|tree|field|cave>.svg` — **round badge icons** (circle r≈58 at centre) showing the place: pond with lily pad, leafy tree, grass field with a flower and fence, rocky cave mouth. Must read at 64 px.

### 4.3 Environment — environment artist (anchored to the bottom, **horizontally tileable**, transparent above the silhouette)
| File | viewBox | Parallax | Notes |
|---|---|---|---|
| `env/far.svg` | 0 0 1200 420 | 0.15 | distant mountains + one calm smiling volcano with a small smoke wisp, misty blue-violet |
| `env/mid.svg` | 0 0 1200 360 | 0.35 | rolling hills, palms, big ferns, a few rounded rocks, warm greens |
| `env/ground.svg` | 0 0 1200 260 | 1 (static) | grass ground; grass top edge ≈ y 40, path/dirt patches, small flowers; drawn so its y=40 sits at `layout.groundY - 30`; must extend down to 260 (bottom of screen) |
| `env/sun.svg` | 0 0 200 200 | — | friendly sun disc + soft rays (no face needed) |
| `env/cloud1..3.svg` | 0 0 300 160 | — | fluffy cartoon clouds, white with light lavender shading |
| `env/cloud_rain.svg` | 0 0 300 160 | — | grey-blue rain cloud |
| `env/rainbow.svg` | 0 0 800 420 | — | rainbow arc, 6 bands, soft ends that fade out |
Particles `particles/` (viewBox 0 0 32 32, centred): `leaf1`, `leaf2`, `petal`, `pollen`, `butterfly1`, `butterfly2`
(same body, wings open/closed), `raindrop` (streak), `splash`, `sparkle`, `puff` (smoke/dust), `confetti_a`, `confetti_b`.
Weather moods (sky drawn by code from `weather.ambient`): 0 sunny morning, 1 breezy afternoon, 2 soft rain, 3 golden evening with rainbow.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` | voice & input engineer |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead (integration) |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, render, ui, main.

### 5.1 Topics and content (`content.js` → `DN.Content`)
```
DN.PALETTE = { red:{fill,dark}, blue:…, yellow:…, green:…, orange:…, purple:…, cream:… }   // §3
DN.AGE_TOPICS = {
  3: ['colors','shapes','size','homes'],
  4: ['colors','shapes','count','homes'],
  5: ['shapes','count','letters','homes'],
  6: ['lower','initial','add','count'],
  7: ['add','sub','initial','oddeven'] }           // age ≥7 uses 7
DN.Content.makeRound(topic, { age, lang, rng, roundIndex, layout }) → round   // pure, deterministic
DN.Content.makeTalk(topic, { age, lang, rng }) → talk
DN.WORDS = { en: [{word:'apple', sprite:'fruit_apple', initial:'A'}, …], vi: [{word:'táo', sprite:'fruit_apple', initial:'T'}, …] }
```
Topic rules (nests n / items):
- `colors`: n = 2 (age 3), 3 (4), 4 (5+); items `egg_<color>`, 2 per nest; nest label `{type:'color', value}`.
- `shapes`: shapes from `circle, square, triangle, star, heart` (+`rectangle` age 5+); procedural item (`sprite:null, shape, color`);
  age ≤4: each shape keeps one colour per round; age 5: colours mixed so only the shape matters. Label `{type:'shape', value}`.
- `size`: 2 nests `{type:'size', value:'big'|'small'}`; 4 eggs of one random colour, scales 1.3 / 0.72.
- `homes`: n = 2/3/4; animals → homes: pond(fish, frog, duck), tree(bird, owl, squirrel), field(rabbit, cow, sheep, hen), cave(bat, bear);
  `cat` is only used in `initial`. Label `{type:'home', value}`.
- `count` (mode `'count'`): one nest `{type:'number', value:N}` with `need:N`; N per age: 4→1–5, 5→1–10, 6→1–12; round 0 is small (≤3).
  Items: N + 2 (min 3 extra when N ≤ 3) fruit of one kind. Round ends when the nest holds N. Items stay in the nest once in.
- `letters`: 3 nests with capitals; `egg_plain` items with `text` = the same capital, 2 per nest. Pools:
  en `ABCDEFGHIKLMNOPRSTUW`, vi `ABCDEGHIKLMNOPSTUVXY` (age 5 avoids diacritic letters).
- `lower`: as letters, but items show the lower-case letter.
- `initial`: 3 nests with capitals; items are picture sprites from `DN.WORDS[lang]` whose `initial` matches (1–2 per nest).
  Words: **en** apple A · bear B · bat B · bird B · banana B · cat C · cow C · duck D · fish F · frog F · hen H · owl O · orange O ·
  rabbit R · sheep S · squirrel S · strawberry S. **vi** bò B · cá C · cú C · cừu C · cam C · dơi D · dâu D · gấu G · gà G ·
  mèo M · sóc S · táo T · vịt V · ếch Ê (sprites: cow, fish, owl, sheep, orange, bat, strawberry, bear, hen, cat, squirrel, apple, duck, frog).
- `add`: 3 nests `{type:'number', value}` (distinct answers); `egg_plain` items with `text:'2+3'`, 2 per nest; age 6 sums ≤10, age 7 ≤20 (no 0 operands).
- `sub`: same with `text:'7−2'` (U+2212), results 0–9, minuend ≤10.
- `oddeven`: 2 nests `{type:'parity', value:'odd'|'even'}`; items `egg_plain` with numbers 1–20.
Round object:
```
round = { topic, mode:'sort'|'count', promptKey:'p.<topic>', params:{n?, fruit?},
  baskets: [{ id, label:{type, value}, need?, x, y, w, h }],
  items:   [{ id, sprite|null, shape?, color?, text?, scale (1 or size-topic scale), size,
              nameKind, nameValue,           // what Bo says on pick-up: kinds below
              answer                         // basket id it belongs to (count mode: the one nest; extras too)
           }] }
```
Name kinds (used by `I18N.name(lang, kind, value)`): `color, shape, size, animal, fruit, home, number, letter, parity, sum, diff, word`.
Talk object (one question per chapter):
```
talk = { promptKey:'talk.<topic>', params, show:{ sprite|null, shape?, color?, text?, count? /*draw N copies*/ },
         choices:[{ id, kind, value }]  /*3 choices, shuffled*/, answerId }
```
(colors: "What colour is this egg?"; shapes: "What shape is this?"; size: show a big egg — "Is it big or small?" (2 choices);
homes: show an animal — "Where does it live?"; count: show k fruit — "How many?"; letters/lower: "Which letter is this?";
initial: show a picture — "Which letter does it start with?"; add/sub: show the sum — "What is the answer?"; oddeven: show a number — "Odd or even?" (2 choices).)

### 5.2 `DN.World` (headless, deterministic with seed + inputs; fixed sub-steps ≤ 1/120 s)
```js
const w = new DN.World({ seed, age, lang, config });   // config overrides DN.CONFIG
w.setViewport(W, H, ins);        // (re)layout; resting items are re-packed into the new play rect
w.newSession();                  // picks topics for age, level 0, stars 0 → state 'intro'
w.startLevel(i);                 // jump to chapter i (0..3) → 'intro'
w.pointerDown(x, y) → itemId|null   // grabs the top-most interactive item under the point
w.pointerMove(x, y);  w.pointerUp(x, y);  w.cancelDrag();
w.hint();                        // glow the right nest for the held item (or first unsorted one)
w.talkAnswer(choiceId) → bool;   w.skipTalk();
w.setAge(a); w.setLang(l);       // take effect at the next newSession()
w.update(dt);  w.drainEvents() → [{type, ...}]
```
State machine: `'intro'` (chapter banner 1.8 s) → `'round'` (items pop in over ~0.6 s, then interactive) →
`'roundDone'` (2.0 s, stars) → next round … after `roundsPerLevel` (5) rounds → `'talk'` (waits for `talkAnswer`/`skipTalk`;
after an answer stays 1.6 s) → `'levelDone'` (2.4 s) → next `'intro'`, after level 3 → `'sessionDone'` (stays until newSession).
Fields:
```
w.state, w.level (0..3), w.levels[] (topic ids), w.topic, w.weather (= level), w.round, w.roundsPerLevel,
w.stars, w.levelStars, w.roundMistakes, w.time, w.stateTime, w.layout, w.round obj as w.cur,
w.baskets [{ id, label, need, count, x, y, w, h, squash, shake, glow /*0..1*/, slots:[{x,y}] }],
w.items [{ id, sprite, shape, color, text, scale, size, nameKind, nameValue, answer,
           x, y, rot, vx, vy, vr, sx, sy /*visual squash*/, lift /*0..1 picked-up*/,
           state:'appear'|'idle'|'drag'|'fly'|'return'|'in'|'leave', t /*state timer*/, appear /*0..1*/,
           homeX, homeY, basketId, misses, _px, _py, _prot }],
w.held (item id or null), w.talk, w.bo { mood:'idle'|'happy'|'cheer'|'think'|'oops', moodT, lookX, lookY, hop /*px*/ }
```
`_px,_py,_prot` = values at the start of the last fixed step (renderer lerps by `w.alpha` = leftover/step).
Events: `session {levels}`, `level {level, topic}`, `round {round, topic, mode, promptKey, params}`, `appear {id}`,
`grab {id, nameKind, nameValue}`, `drop {id, basketId|null}`, `correct {id, basketId, nameKind, nameValue, label}`,
`wrong {id, basketId, misses}`, `miss {id}` (dropped outside any nest), `land {id, basketId, count, need}`,
`hint {basketId}`, `idle {promptKey, params}` (12 s without a grab), `roundDone {stars, mistakes}`, `talk {talk}`,
`talkResult {correct, choiceId, answerId}`, `levelDone {level, stars}`, `sessionDone {stars}`.

Motion & feel (physically believable; document constants in `DN.CONFIG` with units):
- **Drag:** the item centre follows the finger (+ grab offset, lifted 10 px) with a critically damped spring (ω ≈ 28 rad/s).
  It hangs like a pendulum from the grab point: target tilt = clamp(−vx × 0.0016, ±0.45 rad), rotational spring ω ≈ 9, ζ ≈ 0.35
  (so it swings and settles). `lift` eases 0→1 (scale 1.12, shadow grows/offsets).
- **Correct drop:** ballistic flight from release point (inherits a bit of release velocity) to the next free slot in the nest,
  duration 0.32–0.5 s depending on distance, apex ≥ 60 px above the higher end; spin eases to 0; on landing item squash
  (sx 1.15, sy 0.82 → spring back), nest `squash` 0.12 → damped spring, `land` event.
- **Wrong drop:** nest `shake` (damped sine, 3 wiggles, 0.5 s); item hops back home on an arc (0.55 s) with a small wobble.
- **Miss:** floats home on a gentle arc (0.5 s).
- **Idle:** gentle bob (amp 3 px, period 2–3 s, random phase); eggs wiggle (±0.12 rad, 0.4 s) every 4–8 s at random.
- **Appear:** scale 0 → 1 with back-overshoot (0.45 s), staggered 70 ms; **leave** at round end: items in nests hop out/up and fade (0.4 s).
- Bo: `mood` set on events (correct → happy 0.9 s, roundDone → cheer 1.6 s, wrong → oops 0.8 s, hint/idle → think); `hop` on cheer;
  `lookX/lookY` follow the held item.
- Stars per round: 0 mistakes → 3, 1 → 2, ≥2 → 1. Talk: correct → +1 star.
- After 2 misses with the same item → auto `hint` for that item's nest (glow 3 s).
- First chapter at age 4 must be trivially easy and every round must be completable (generator self-checks).

### 5.3 `DN.Weather`
`new DN.Weather({ width, height, seed })`, `resize(W, H)`, `setWeather(i, {instant})` (0 sunny, 1 breezy, 2 rain, 3 rainbow; crossfade 2 s),
`update(dt, { groundY })`, `particles[] { sprite, x, y, size, rot, flipX, alpha, layer:'sky'|'back'|'front' }`,
`clouds[] { sprite, x, y, scale, alpha }`, `ambient { skyTop, skyBottom, tint /*rgba overlay or null*/, wind /*-1..1*/,
sway /*0..1 grass/palm sway amount*/, sun /*0..1*/, rainbow /*0..1*/, darkness /*0..1*/ }`.
Sunny: butterflies (flapping by alternating sprites, wander on smooth curves), pollen motes, a few petals.
Breezy: leaves tumbling (pendulum flutter + spin, wind gusts every 4–7 s), clouds faster, sway 0.8.
Rain: streak drops at an angle from wind (layer front, low alpha), `splash` at groundY, rain clouds, darkness 0.25.
Rainbow: rainbow fades in, sparkles, evening sky. **Cap 140 particles**, particle count scales with `W×H`.

### 5.4 `DN.Bot` — `new DN.Bot(world, { skill /*0..1*/, seed })`, `bot.step(dt)`
Moves a virtual finger at human speed (≈ 700–1100 px/s, eased), reaction delay 0.25–0.8 s scaled by skill, picks a wrong nest with
probability `(1 − skill) × 0.35`, sometimes drops outside (miss) at low skill, answers talk correctly with probability `0.5 + skill/2`.
`bot.stats = { grabs, correct, wrong, misses, talks, talkRight }`.

### 5.5 Voice & text (`DN.I18N`, `DN.Voice`) — see §6.

### 5.6 Test hooks
URL: `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1`
(URL flags are **never** saved into settings). `window.DN.debug = { world, weather, mode, stats, getState(), setSpeed(n),
startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog /*every line Bo said: {t, lang, text}*/ }`.

## 6. Voice, language and input
### `DN.I18N` (i18n.js)
- `DN.I18N.t(lang, key, params, rng?)` → string. A key may hold an array of variants (praise etc.); pick with rng or Math.random.
  `{name}` placeholders. If the child's name is empty, phrases with `{child}` use a fallback variant without it.
- `DN.I18N.name(lang, kind, value)` → display/spoken name ("red"/"màu đỏ", "duck"/"con vịt", 7 → "seven"/"bảy",
  'A' → "A"/"a", sum '2+3' → "two plus three"/"hai cộng ba", parity → "odd"/"lẻ").
- `DN.I18N.words(lang, kind, value)` → array of accepted spoken forms for speech recognition (lower-case, with and without
  diacritics, digits, common mishearings: "blue/blew", "hai/hài").
- Keys needed (both languages, natural toddler-friendly wording; Vietnamese uses "bé"/"Bo" and friendly particles "nhé", "nào"):
  `ui.*` (title, subtitle, play, playAgain, home, paused, resume, settings, holdForParents, age, language, name, namePlaceholder,
  sound, music, voice, mic, done, stars, chapter {n}, allDone {stars}, welcome {child}, micUnsupported, tapOrSay, listening),
  `topic.<id>` (chapter titles), `weather.0..3`, `p.<topic>` prompts (count: `{n} {fruit}`), `say.correct.<labelType>`
  (e.g. homes "The {name} lives in the {home}!"), `praise[]`, `great[]` (round done, may use `{child}`), `wrong[]`, `miss[]`,
  `hint[]`, `idle[]`, `talk.intro`, `talk.<topic>`, `talk.right[]`, `talk.wrong {answer}`, `session.done {stars}`.
### `DN.Voice` (voice.js)
`init()`, `unlock()` (call inside the first touchend/click: speaks a silent utterance so iOS allows later speech),
`setLang(l)`, `setEnabled(b)`, `say(text, {interrupt, priority, rate, pitch}) → Promise`, `sayKey(key, params)`, `stop()`,
`isSpeaking()`, `onStart/onEnd` callbacks (Bo's talk frames + music ducking), `hasVoice(lang)`, `voiceName()`.
Picks the best installed voice (vi-VN: e.g. "Linh"; en: "Samantha", "Karen", Google…), rate ≈ 0.9, pitch ≈ 1.15. Queue max 2,
stale normal items dropped; works around Chrome's 15 s pause bug and iOS voices loading late (`voiceschanged`).
Always appends to `DN.debug.voiceLog` (or an internal log) even when muted/unavailable.
Listening: `canListen()`, `listen({ lang, choices:[{id, words}], timeoutMs }) → Promise<{ id|null, transcript, reason? }>`
using `SpeechRecognition || webkitSpeechRecognition`, interim results, up to 5 alternatives, fuzzy match (diacritic-insensitive,
digits ↔ words), stops on first match; permission denied → `canListen()` false for the session.
### `DN.Input` (input.js)
`attach(canvas, { toLogical(clientX, clientY) → {x,y}, down, move, up, cancel })` with Pointer Events (+ touch fallback),
one active pointer at a time, `touch-action:none`, ignores events whose target is a button/`.screen`/`#hud`.
`DN.Input.kidProof()` blocks pinch-zoom (`gesturestart`), double-tap zoom, long-press callout/selection, context menu,
pull-to-refresh/rubber-band scroll, Ctrl+wheel zoom. `DN.Input.holdButton(el, ms, onDone, onProgress)` = parent gate.

## 7. Integration (lead)
DOM screens: title (Bo waving, big ▶ Play, star total, small "hold for parents" ⚙), settings (age chips 3–7+, language
EN/VI, name, toggles), HUD (stars, round dots, pause), speech bubble (DOM, positioned from `layout.bubble`), pause,
chapter banner (canvas), Talk time panel (shown item + 3 big choice buttons + mic), session-done celebration.
Audio: WebAudio synth SFX (pickup blip, whoosh, boing, soft "bonk", chime, count notes rising, star dings, fanfare),
soft music per weather, rain ambience, music ducks while Bo speaks. iOS: resume AudioContext in the first touchend.
Mobile shell: viewport-fit=cover, safe areas, `apple-mobile-web-app-capable`, manifest + apple-touch-icon PNGs,
100dvh, no overscroll, backing store capped (≈ 2.2 MP on phones, 1920×1080 elsewhere), adaptive quality.

## 8. Performance rules (from day one)
Pixel-exact pre-rasterized layer strips; sprites pre-rasterized at logical size × render scale; render interpolation;
no per-frame allocations in hot loops where easy; particle cap; pause rendering when the page is hidden.
