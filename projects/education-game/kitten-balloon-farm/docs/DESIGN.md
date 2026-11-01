# Kitten's Balloon Farm — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.KB`**. Classic `<script>` files, no build step (runs from disk and on
GitHub Pages). The code base started as a copy of `../owl-snow-garden/` (state machine, voice, input, storage, audio, ui,
main, tests), namespace renamed `SG → KB`, storage prefix `kb:`. **The drag/drop world is replaced by a tap/pop world.**
When a detail is missing here, do what `../owl-snow-garden/docs/DESIGN.md` does. Target: iPhone + iPad Safari first.

## 1. What changes versus Owlet's Snow Garden
| Owlet's Snow Garden | Kitten's Balloon Farm |
|---|---|
| drag seeds into pots | **tap floating balloons**; right → POP (confetti), wrong → squish-boing-wobble |
| Lumi the owlet (`lumi`) | **Miu the kitten** (`miu`): cream fur, soft caramel patches, straw hat with a mint band, mint neckerchief |
| arctic | **sunny farm**: green hills, barn, windmill, wooden fence, hay bales, round trees |
| aurora at night | **fireflies + stars** at night |
| pots with labels | one **sign** on a post shows the task as a picture (colour swatch / shape / animal / number with dot slots / text) |
| flowers bloom | **farm friends** (animal stickers) float down from popped animal balloons and stay on the grass for the round |

## 2. Screen and coordinates
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
- `World.setViewport(W, H, ins)` computes (all logical px):
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */,
    groundY,              // H - ins.bottom - 96 (top of the grass where Miu, the sign and friends stand); tall portrait: rises by min(140, 0.3·(H-1.6W))
    miu:  { x, y, h },    // feet anchor; x = ins.left + 110, y = groundY + 18, h = 190 (landscape) / 200 (portrait)
    sign: { x, y, w, h }, // post foot (x, y): x = miu.x + 165, y = groundY + 24; board w = 150, h = 112 (sign.svg 128×112 scaled to w)
    bubble: { x, y, w, h },// top-left: x = ins.left + 24, y = ins.top + 20, w = min(640, W - x - ins.right - 160), h = 104
    play: { x, y, w, h }, // balloon home band: x from ins.left + 50 to W - ins.right - 50,
                          // y from bubble bottom + 30 + size/2 to groundY - 150 (balloon centres; strings hang ≤ 1.1·size below)
                          // landscape: the band also excludes a box around Miu+sign (x < sign.x + 110 and y > groundY - 320);
                          // portrait: band height capped at 1.05·W, kept just above the ground (short reach, near Miu)
    yard: { x0, x1, y }   // friends land on y = groundY + 30 between x0 = sign.x + 120 and x1 = W - ins.right - 60
  }
  ```
- HUD buttons (DOM, top-right) occupy `x > W-ins.right-160, y < ins.top+96`; nothing tappable there.
- Balloon size (body width): `CONFIG.balloonSize` = 128 at age 3, 118 at 4, 108 at 5+, ×1.15 on tall portrait; size topic big 1.3× / small 0.72×.
  Homes in `play` by farthest-point sampling with min centre distance 1.2×size (shrink to 0.8× before giving up).
- Hit test: circle `r = 0.6·size + 14` around the body centre; if several hit, the nearest centre wins. Strings are not tappable.

## 3. Art style guide (ALL artists)
- **Original only.** Web search is for reference (kitten/farm-animal anatomy, toddler-app style); never copy a known character/brand.
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- Animal stickers: **white sticker border** (≈6 px) + faint drop shadow inside the SVG (opacity .18, +3 y).
- SVG: no `<text>`, no fonts, no scripts, no external refs, at most one light `feGaussianBlur`. `width`/`height` = viewBox.
- Kid-friendly: no teeth/claws, nothing scary.
- **Answer palette (exact hex)** — balloons only:
  | key | hex | dark (outline/shade) |
  |---|---|---|
  | red | `#E84A4A` | `#A8282E` |
  | blue | `#3C8DE8` | `#1F5BA8` |
  | yellow | `#FFD23F` | `#C99A12` |
  | green | `#4CC26B` | `#2A8343` |
  | orange | `#FF9A2E` | `#C4650C` |
  | purple | `#9B6BE0` | `#6840A8` |
  | pink (text/animal balloons only, never an answer) | `#FF8FC0` | `#C9558A` |
  | cream (text balloons) | `#FFF4DC` | `#C9A877` |
- Miu: fur `#FFF6E8`, shade `#EADBC4`, patches caramel `#D2A274` (muted, never as saturated as orange), outline `#8A6650`,
  eyes `#5B8C3A`-green iris with dark pupil `#2F2622`, nose/inner ears `#F4A6B4`, cheeks `#F7B6C2`, straw hat `#EBD08C` / shade `#C9AA62`,
  **hat band + neckerchief mint `#5FD3B4` / dark `#2E8C78`** (never an answer colour).
- Sign: pale wood `#E2C597`, outline `#9A774C`, board blank area `#FFF8EA`.
- Background: sky gradients by time of day (code); hills muted sage greens (`#A8CF8E`, `#8DBF7A`, never as saturated as `green`),
  barn muted brick `#C98B7A` (never as saturated as `red`), fence `#E2C597`, hay `#E9D18A`, grass `#B5DB93` / `#9CCB7C`.
  The play band (sky) stays calm and lighter than every balloon; night: navy sky but balloons, Miu and friends stay lit
  (darkness tint ≤ 0.28 over the background layers only).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Miu & core items — character artist A
| File | viewBox | Drawn | Notes |
|---|---|---|---|
| `characters/miu_idle.svg` | 0 0 256 256 | h 190–200 | Miu sitting/standing, ¾ view facing RIGHT and slightly UP (towards the balloons), tail curled. **Feet anchor (128, 244).** |
| `characters/miu_blink.svg` | same | | identical body, eyes closed (happy arcs) |
| `characters/miu_talk.svg` | same | | identical body, mouth open (small "o"/smile) |
| `characters/miu_happy.svg` | same | | small hop, paws up, big smile eyes |
| `characters/miu_cheer.svg` | same | | both paws up high, sparkly star eyes, tail up |
| `characters/miu_think.svg` | same | | head tilt, paw at chin, eyes up-right |
| `characters/miu_oops.svg` | same | | gentle "hmm?" (brows up, small o-mouth, ears a bit sideways) — NOT sad |
| `items/sign.svg` | 0 0 128 112 | w 150 | wooden sign on a post; **blank board x 12–116, y 8–76**; post bottom (64, 112) |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | 28–120 | gold star / grey outline star |
| `icon.svg` | 0 0 512 512 | app icon | Miu's face + 3 balloons on a sunny sky over a green hill, full-bleed, no transparency |
**Balloons are drawn by code** — artist A also owns `game/js/balloon_art.js` (see §5.6).

### 4.2 Farm animals — character artist B (all 0 0 128 128, centred, ≈110 px, sticker border, must read at 60 px)
`items/animal_<cow|pig|sheep|duck|horse|goat|chick|bunny|puppy>.svg` — black-and-white cow (calf-like, pink muzzle, tiny
horn nubs), pink piglet (curly tail), fluffy white lamb (grey-brown face, needs a darker outline to read on cream),
**white duck with an orange bill** (bill `#F2A03D`-ish is fine), brown foal with a darker mane, small white-grey
goat kid with a tiny beard, fluffy yellow chick, light-grey bunny with long ears, sandy-brown puppy with floppy ears.
Full body or head+body bust, facing RIGHT, friendly, each instantly distinct by silhouette.

### 4.3 Environment — environment artist (bottom-anchored, **horizontally tileable**, transparent above)
| File | viewBox | Parallax | Notes |
|---|---|---|---|
| `env/far.svg` | 0 0 1200 420 | 0.15 | distant soft hills (pale sage/blue-green), a small barn, a windmill, a silo, little trees; low contrast |
| `env/mid.svg` | 0 0 1200 360 | 0.35 | rolling green hills, round trees, a few hay bales, a long wooden fence near the bottom |
| `env/ground.svg` | 0 0 1200 260 | 1 | grass ground; top edge ≈ y 40 drawn at `layout.groundY - 30`; small flowers (pale, not answer colours), tufts, a dirt path; down to 260 |
| `env/sun.svg` | 0 0 200 200 | — | friendly sun disc + soft rays (no face) |
| `env/moon.svg` | 0 0 200 200 | — | crescent moon, soft glow |
| `env/cloud1..3.svg` | 0 0 300 160 | — | fluffy clouds, white with light lavender shading |
Particles `particles/` (0 0 32 32, centred): `sparkle`, `star` (twinkle), `firefly` (soft yellow-green glow dot), `butterfly`
(pale, wings open), `petal`, `leaf`, `puff` (dust), `confetti_a`, `confetti_b` (white/neutral shapes; tinted by code), `seed` (dandelion fluff).
Times of day (sky drawn by code from `weather.ambient`): 0 morning (peach/pink, low sun, mist, butterflies), 1 noon (bright blue,
high sun, butterflies, light breeze), 2 sunset (orange → violet, big low sun, dandelion fluff), 3 starry night (navy, moon,
twinkling stars, fireflies).

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`) | voice & input engineer |
| `balloon_art.js` | character artist A |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, balloon_art, render, ui, main.

### 5.1 Content (`content.js` → `KB.Content`)
```
KB.PALETTE (answer colours of §3 + pink, cream), KB.ANIMALS = ['cow','pig','sheep','duck','horse','goat','chick','bunny','puppy']
KB.AGE_TOPICS = { 3:['colors','size','shapes','animals'], 4:['colors','shapes','count','animals'],
                  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
KB.Content.makeRound(topic, { age, lang, rng, roundIndex, layout }) → round   // pure, deterministic, self-checks completable
KB.Content.makeTalk(topic, { age, lang, rng }) → talk
KB.WORDS = { en:[{word, sprite, initial}], vi:[…] }   // farm animal sprites only
```
Round object:
```
round = { topic, mode:'find'|'count'|'ask', promptKey:'p.<topic>', params:{color?, shape?, size?, n?, animal?, text?, a?, b?},
  sign:{ type:'color'|'shape'|'size'|'number'|'animal'|'text', value, need? },
  queue?:[balloonId],                      // ask mode: order in which Miu asks
  balloons:[{ id, shape:'circle'|'heart'|'star'|'square'|'triangle'|'rect', color /*palette key*/, scale /*1, 1.3, 0.72*/,
              sprite:null|'animal_cow'…, text:null|'A'|'7'…, answer:true|false, nameKind, nameValue }] }
```
Topics:
- `colors` (find): target colour; k targets (warm-up 1, later 2–3) + distractors from n−1 other colours (n = 2/3/4 at age 3/4/5+),
  1–2 each; total ≤ 5 (age 3), ≤ 6 (4), ≤ 8 (5+). All circle balloons. Never blue+purple, red+green, yellow+orange or green+orange in one round below age 5 (visual QA, colour-blind safety).
  The 4 rounds of a chapter use 4 different target colours.
- `shapes` (find): target shape from circle, heart, star, square, triangle (+rect at 5+); n shapes per round as colours;
  age ≤ 4: every balloon of the round has the SAME colour (the shape is the only cue); age 5: mixed colours.
- `size` (find, age 3): "Pop the BIG balloon(s)" / "small": scale 1.3 / 0.72, one colour per round; warm-up 1 + 1.
- `count` (count): `need` N: age 3–4 → 1–5, 5 → 3–10, 6/7 → 4–12 (round 0 ≤ 3; rounds ≥ 1 N ≥ 2); balloons N + 2 (≥ 3 extra
  when N ≤ 3) of one colour, all `answer:true`. Every pop counts; done when N popped; the rest float away. Sign: number + N dot slots.
- `animals` (ask): n = 2/3/4 animal balloons (distinct animals), each `sprite:'animal_x'`, colours mixed (palette incl. pink);
  `queue` = all balloon ids shuffled (warm-up: n = 2 at every age). Current target = `queue[0]`; a pop of another balloon is wrong.
- `letters` (find, 5): capital letter target among 3–4 letter balloons; `lower` (6): sign shows capital, balloons lower-case
  (drop `l` when `I` could appear; no `I` in lower rounds); `initial`: sign shows the animal sticker, balloons are letters;
  `add`/`sub`: sign `text:'2 + 3'`, balloons show numbers (3 choices, plausible distractors ±1–3, ≥ 0);
  `oddeven`: "Pop the ODD numbers" / "EVEN", 5–6 number balloons, 2–3 targets. Text balloons use pastel/cream colours.
- `initial` words: **en** cow C · pig P · sheep S · duck D · horse H · goat G · chick C · bunny B · puppy P;
  **vi** bò B · lợn L · cừu C · vịt V · dê D · gà con G · thỏ — skip (th) · ngựa — skip (ng) · chó — skip (ch); (bunny/horse/puppy not in vi words).
- Every round is completable (a target exists; count has ≥ N balloons); content varies every round.
Talk (one per chapter): colors "What colour is this balloon?" (show a balloon); shapes "What shape is this balloon?"; size
"Is it big or small?"; count "How many balloons?" (show k balloons, k ≤ 5 at age ≤ 4); **animals "Which animal says {sound}?"**
(3 animal picture choices; never two with the same sound in that language; bunny has no sound → never the answer);
letters/lower/initial/add/sub/oddeven as Owl.
```
talk = { promptKey:'talk.<topic>', params, show:{ shape?, color?, count?, sprite?, text?, size? }, choices:[{id, kind, value}], answerId }
```
Name kinds: `color, shape, size, animal, number, letter, parity, sum, diff, word, sound, balloon`.

### 5.2 `KB.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s)
Same public API and state machine as Owl (`setViewport, setAge, setLang, newSession, startLevel, update, drainEvents,
pointerDown/Move/Up, cancelDrag (no-op is fine), hint, talkAnswer, prompt()`, fields `layout, state, level, topic, round,
roundsPerLevel, stars, levelStars, talk, cur, alpha, stateTime`), states `intro | round | roundDone | talk | levelDone | sessionDone`,
plus:
- `w.balloons[]`: `{ id, shape, color, scale, size, sprite, text, answer, nameKind, nameValue, x, y, _px, _py, rot, _prot,
  vx, vy, hx, hy /*home*/, state:'rise'|'float'|'pop'|'away'|'gone', t, sx, sy /*squash scales*/, glow /*0..1 hint*/,
  string:[{x,y}×7] /*verlet points, [0] at the knot*/, _pstring }` — everything the renderer needs (interpolate with `alpha`).
- `w.friends[]`: `{ id, sprite, x, y, _px, _py, rot, _prot, vy, state:'fall'|'land'|'rest', sx, sy, size:84 }` (from popped animal balloons).
- `w.shreds[]` (optional, cosmetic): falling bits of the popped balloon `{x,y,vx,vy,rot,vr,color,life}`; the renderer may also do its own.
- `w.sign = { type, value, need, filled /*count pops so far*/, wob /*spring*/ }`, `w.target` (ask: current balloon id),
  `w.miu { mood, moodT, lookX, lookY, hop }` (looks at the last tapped / hinted balloon).
- `pointerDown(x, y)` → returns the balloon id hit or `null`; **the pop/wrong happens on touch-down** (instant feedback).
  Only `state:'float'` (and 'rise' after 60 % of its rise) balloons react; per-balloon 0.3 s cooldown after a wrong.
  One active pointer: main passes only the primary pointer.
- Events: `level {level, topic}`, `round {round, mode, promptKey, params, sign}`, `ask {balloonId, promptKey:'p.animals', params:{animal}}`
  (ask mode, whenever the target changes, also at round start), `appear {id}` (rise start, staggered), `pop {id, x, y, color, shape,
  sprite, nameKind, nameValue, n /*pops so far*/, need}`, `correct {id, …same}`, `wrong {id, x, y, nameKind, nameValue, target /*balloon id or null*/,
  targetNameKind, targetNameValue}`, `land {id /*friend*/, x, y}`, `hint {id}`, `idle {}`, `roundDone {round, stars}`,
  `talk {talk}`, `talkAsk {n}`, `talkResult {choiceId, answerId, correct}`, `levelDone {level}`, `sessionDone {stars}`.
- **Motion (must feel physical):**
  - Rise: balloons start below the ground (y = groundY + size), staggered 0.12 s, and float to their home with a buoyant
    under-damped spring (ω ≈ 3.2, ζ ≈ 0.55: a soft overshoot, settles in ≈ 1.5 s) — the round is playable after ≈ 0.8 s.
  - Float: home + bob (vertical sine 6–9 px, period 2.2–3.4 s, random phase) + lazy horizontal drift (±10 px, 5–8 s) +
    wind from `weather.ambient.wind` (the world reads `w.wind`, set by main each frame); soft separation spring between
    balloons closer than 1.1×size; tilt follows vx (rot = clamp(−vx·0.0025, ±0.25) via a rotational spring) and wind.
  - String: 7-point verlet rope (segment 0.15×size), gravity 900 px/s², damping 0.98, 3 constraint iterations; point 0 pinned
    to the knot below the body (rotated with the balloon). The free end trails and swings when the balloon moves.
  - Pop (right): 0.08 s stretch to 1.18× then `state:'pop'` → event `pop`; the body disappears (renderer: flash ring + shreds
    + confetti in the balloon colour); the string falls with gravity and fades over 0.6 s.
    Animal balloon: a friend sticker appears at the balloon centre, gently falls (gravity 600, drag 2.2 → ≈ 220 px/s terminal,
    a sway ±0.25 rad like a leaf), lands on `yard` at the next free x (spacing 92 px, rows from x0), squash + 2 small bounces
    (restitution 0.35), event `land`; friends then idle-bob and stay until the round's end (fade out in roundDone).
  - Wrong: squash-and-stretch wobble spring (ω ≈ 16, ζ ≈ 0.28; sx/sy amplitude 0.18), an impulse away from the finger
    (|v| ≈ 220 px/s) and a "no-no" rotational shake; the spring brings it back home within ≈ 1 s.
  - Count rounds: every tap pops; `sign.filled` +1 per pop with a sign wobble; at N the remaining balloons float away
    (`away`: accelerate upward 260 px/s², sway, off-screen → `gone`).
  - Round end (all targets popped): +0.5 s, remaining balloons `away`, then `roundDone`; next round after `roundDoneTime`.
- Help: wrong taps ≥ 2 in a round → `hint` (glows the (next) target balloon for 3 s, it bobs bigger); hint cooldown 6 s;
  idle nudges after 12 s without a tap, backoff ×1.5 up to 30 s. Chapter time limit: after ≥ 3 rounds, Talk time once the
  chapter passed 75 s. 4 rounds per chapter, warm-up first (1 target).
- Stars per round: 3 (no wrong taps), 2 (one), 1 otherwise; Talk right +1.

### 5.3 `KB.Weather` — as Owl's API: `new KB.Weather({width, height, seed})`, `resize`, `setWeather(i, {instant})` (crossfade 2.5 s),
`update(dt, {groundY})`, `particles[] {sprite, x, y, size, rot, flipX, alpha, layer:'sky'|'front', glow?}`, `clouds[] {sprite, x, y, scale, alpha}`,
`stars[] {x, y, r, phase}`, `ambient { skyTop, skyBottom, horizon, tint, wind /*px/s, −40..40 gusty*/, sway, sun, sunX, sunY, moon, stars, darkness }`.
Morning: butterflies flutter (sine path, wing flap via flipX/scale), mist sparkles. Noon: butterflies, a light breeze (gusts).
Sunset: dandelion `seed` fluff drifting on the wind. Night: twinkling stars, **fireflies** (glowing, slow wandering, blinking). Cap 120 particles.
(No aurora; drop it.)

### 5.4 `KB.Bot` — taps balloons through `world.pointerDown(x, y)` at the balloon's current position after a human-ish delay;
skill = probability of choosing a right balloon; in ask mode it aims at `w.target`; in Talk time picks the answer with p = skill.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved). `window.KB.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill),
setAutoRestart(on), gotoLevel(i), voiceLog, balloonScreen(id) → {x,y} in CSS px }` (live getters via `Object.defineProperties`).

### 5.6 `KB.BalloonArt` (artist A, `balloon_art.js`)
```
KB.BalloonArt.draw(ctx, { shape, color /*palette key*/, size /*body width px*/, sx=1, sy=1, glow=0, alpha=1, night=0 })
   // draws one balloon body centred at (0,0) in the current transform (caller translates/rotates): glossy latex look
   // (radial gradient, darker rim, one big soft highlight upper-left + a small one), a tied knot at the bottom
   // (knot point at (0, KB.BalloonArt.knotY(shape, size))). Heart/star/square/triangle/rect are puffy "foil"-style shapes
   // with rounded corners and an inner soft highlight. glow>0 draws a warm soft halo (hint). Uses an offscreen cache
   // per (shape, color, size bucket of 8 px, dpr) and draws the cache scaled by sx/sy.
KB.BalloonArt.knotY(shape, size) → y offset of the knot below the centre
KB.BalloonArt.bodyH(shape, size) → body height (for layout of strings/text)
KB.BalloonArt.textColor(color) → '#fff' or a dark colour with ≥ 4.5:1 contrast on that balloon
KB.BalloonArt.drawShreds(ctx, shreds)  // optional: little curled latex bits {x,y,rot,color,life}
KB.BalloonArt.drawPopFlash(ctx, x, y, size, t /*0..1*/, color) // star-burst ring for the pop
KB.BalloonArt.COLORS = { key: {base, dark, light} }  // from the palette (§3)
```
Shapes must be told apart at a glance by a 3-year-old (heart vs circle!) and the colour must stay the true palette colour
(the highlight must not wash a red balloon into pink). The renderer draws the string, the sprite (animal sticker at
0.62×size) and the text (bold rounded font, 0.5×size) on top.

## 6. Voice, language, input — as Owl's §6 with:
- Helper name **Miu** in both languages, a playful kitten: pitch ≈ 1.25, rate ≈ 0.92.
- Animal names: cow "cow"/"con bò", pig "pig"/"con lợn" (accept "heo"), sheep "sheep"/"con cừu", duck "duck"/"con vịt",
  horse "horse"/"con ngựa", goat "goat"/"con dê", chick "chick"/"gà con" (accept "con gà"), bunny "bunny"/"con thỏ",
  puppy "puppy"/"cún con" (accept "con chó"). Sounds (kind `sound`): cow moo/"ụm bò", pig oink/"ụt ịt", sheep baa/"be be",
  duck quack/"cạp cạp", horse neigh/"hí hí", goat (en "maa", vi — none: never ask goat in vi), chick cheep/"chíp chíp",
  puppy woof/"gâu gâu", bunny — none.
- Prompts (`p.<topic>`): colors "Pop the {color} balloons!" (one target: "balloon"), shapes "Pop the {shape} balloon!",
  size "Pop the {size} balloon!", count "Pop {n} balloons!", animals "Pop the balloon with the {animal}!" / "Bé ơi, bắn
  bóng có {animal} nhé!" (VN: "nổ bóng"/"bấm vào bóng" — choose the most natural kindergarten wording),
  `p.animalsNext` "Now the {animal}!", letters etc.; `say.pop[]` ("Pop!"), counting on each pop ("one", "two", … ; last:
  "three! Three balloons!"), `say.correct.<kind>` ("Red!", "A star!", "The pig! Oink oink!"), `praise[]`, `great[]` (with
  `{child}`), `wrong[]` / `sayWrong(lang, {name, targetName})` ("That one is blue. Find the red one!"), `hint[]`, `idle[]`,
  `talk.*`, `weather.0..3` ("Good morning, farm!", "It's noon!", "Sunset time!", "Good night, stars!"), `ui.*` as Owl
  (title logo lines "Kitten's" / "Balloon Farm", VI "Bóng Bay" / "Nông Trại Mèo Con", tagline, `ui.voice` "Miu's voice").
- `KB.I18N.sayCount(lang, n, need)`, `sayCorrect(lang, ev)`, `sayWrong(lang, ev)`, `talkWrong`, `name(lang, kind, value)`,
  `words(lang, kind, value)` as Owl. Every key in both languages (unit test).

## 7. Integration (lead) — as Owl §7: title (Miu waving under a bunch of balloons, ▶ Play, star total, language toggle, hold-⚙),
settings, HUD, bubble, pause, chapter banner, Talk time panel, session-done celebration (night party: all friends + floating
lantern-balloons + fireworks-like confetti). Audio: synth SFX (balloon squeak on rise, POP = short noise burst + tonal "pock",
rising notes for counting pops, boing for wrong (soft, friendly), friend land "plop", star dings, fanfare), music per time of day
(music box at night), crickets ambience at night, ducking under speech.

## 8. Performance — balloons pre-rendered per (shape, colour, size bucket) by BalloonArt; ≤ 10 balloons, 7-point strings,
≤ 160 confetti; adaptive quality as Owl.
