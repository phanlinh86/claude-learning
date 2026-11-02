# Dee's Forest Memory — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.DM`**. Classic `<script>` files, no build step. The code base started
as a copy of `../kitten-balloon-farm/` (state machine, voice, input, storage, loud audio with volume, ui, main, tests),
namespace renamed `KB → DM`, storage prefix `dm:`. **The balloon world is replaced by a memory-card world.** When a detail is
missing here, do what `../kitten-balloon-farm/docs/DESIGN.md` does (layout rules, i18n/voice API, hooks, Talk time).
Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Kitten's Balloon Farm
| Kitten's Balloon Farm | Dee's Forest Memory |
|---|---|
| tap the right floating balloon | **tap two face-down cards to find a matching pair** (memory) |
| Miu the kitten (`miu`) | **Dee the duckling** (`dee`): fluffy yellow, orange bill and feet, a small **leaf cape** (sage `#7DB37A`), one tiny daisy on the head |
| sunny farm, times of day | **fairy forest by a pond**: big round trees, mushroom houses, lily pads, ferns; **seasons**: spring → summer → autumn → winter |
| balloons + strings | **cards** in a grid on a mossy clearing, dealt from a stack, 3D flips |
| friends drop from balloons | every match **releases a forest reward** that stays: a butterfly (colour), a glowing shape lantern on a branch (shape), acorns (number), the animal itself (animal), a firefly star (letters/sums) |
| sign shows the task | no sign; the helper's bubble + the peek show the task |

## 2. Screen and coordinates
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
- `World.setViewport(W, H, ins)` computes:
  ```
  layout = { W, H, ins, portrait, tall,
    groundY,            // H - ins.bottom - 90
    dee:  { x, y, h },  // feet anchor; landscape x = ins.left + 110, y = groundY + 16, h = 180; portrait x = ins.left + 100, y = groundY + 20, h = 170
    bubble: { x, y, w, h },  // landscape: x = ins.left + 24, y = ins.top + 20, h = 122, w = min(640, W - x - ins.right - 160)
                             // portrait: under the HUD: y = ins.top + 96 + 24, h = 124, w = min(640, W - x - ins.right - 24)
    board: { x, y, w, h },   // the card area: below bubble bottom + 24, above groundY - 10 (cards may cover the grass edge);
                             // landscape: left edge clear of Dee (x ≥ dee.x + 120); portrait: full width minus 24 px margins,
                             // bottom stops above Dee's head (y ≤ dee.y - dee.h - 10) when Dee is under the grid
    grid: { cols, rows, cw, ch, gap, x0, y0 },   // chosen per round (see §5.2)
    perches: [{ x, y, kind:'branch'|'ground'|'air'|'lily' }]   // where rewards settle: around the board, never on it, never under the HUD/bubble
  }
  ```
- Card aspect w:h = 0.78. Card width ≥ 120 px at ages ≤ 4, ≥ 104 px at 5+ (DESIGN rule: targets ≥ 100); gap = 0.12·cw.
  Grid shape: the cols × rows (cols·rows ≥ 2·pairs, at most 1 empty slot, empty slot last row centred) with the largest
  card that fits `board`; ties prefer wider grids in landscape and taller in portrait.
- Hit test: the card rectangle grown by 10 px on every side (gaps are ≥ 14 px so neighbours never share a point).
- HUD buttons (DOM, top-right) occupy `x > W-ins.right-160, y < ins.top+96`.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand.
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- Stickers: **white sticker border** (≈6 px) + faint drop shadow inside the SVG (opacity .18, +3 y).
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex)**: red `#E84A4A`/`#A8282E`, blue `#3C8DE8`/`#1F5BA8`, yellow `#FFD23F`/`#C99A12`, green `#4CC26B`/`#2A8343`,
  orange `#FF9A2E`/`#C4650C`, purple `#9B6BE0`/`#6840A8`, pink `#FF8FC0`/`#C9558A` (pink is an answer colour here from age 5).
- **Cards:** front = warm cream `#FFF8EA` with a 6 px rounded inner frame `#E7D3AE` and outline `#9A774C`; back = deep forest teal
  `#2F7D73` with a light leaf-and-swirl pattern (`#4FA393`, `#8CCFB8`) and a small golden acorn emblem in the middle; corner radius
  0.12·w. Backs must look identical (no cue), and fronts must read at 104 px wide.
- Dee: down `#FFE27A`, shade `#F2C94C`, outline `#B9862A`, bill/feet `#F59A3B` (never as saturated as `orange`: darker, browner),
  eyes `#2F2622` with catch-light, cheeks `#F7B6C2`, leaf cape sage `#7DB37A` / dark `#4E7F52`, daisy white + yellow centre.
  Dee's yellow is close to the `yellow` answer: Dee never appears ON the board, and colour rounds never place a yellow card
  within 40 px of Dee.
- Background: muted greens and browns, lighter and less saturated than every answer colour; the board sits on a soft mossy
  clearing panel (drawn by code, `#CFE3B8` with 40 % alpha in spring/summer, `#E8D7B5` autumn, `#EAF2F8` winter) so cards read
  on every season.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Dee & UI — character artist A
| File | viewBox | Notes |
|---|---|---|
| `characters/dee_{idle,blink,talk,happy,cheer,think,oops}.svg` | 0 0 256 256 | identical body; ¾ view facing RIGHT; **feet anchor (128, 244)**; happy = small hop wings up, cheer = wings wide + star eyes, think = wing tip at the bill, oops = gentle "hmm?" (never sad) |
| `items/card_back.svg` | 0 0 156 200 | the card back (§3) |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | gold star / grey outline star |
| `icon.svg` | 0 0 512 512 | Dee's face + two cards (one flipped showing a heart) on a forest-green background, full-bleed |
Artist A also owns **`game/js/card_art.js`** (§5.6): card frames and faces drawn by code, and the reward drawings.

### 4.2 Forest animals — character artist B (0 0 128 128, centred, ≈110 px, sticker border, must read at 70 px)
`items/animal_<fox|deer|hedgehog|squirrel|bunny|frog|bear|owl|mouse>.svg` — red fox cub (use `#D9763C`, browner than `orange`),
fawn with white spots, hedgehog with soft spines, red squirrel with a big tail, grey-brown bunny, green frog (`#7FBF5A`,
yellower than `green`), brown bear cub, tawny owlet, grey field mouse. All facing right, full body, distinct silhouettes. The same stickers are used on cards and as rewards.

### 4.3 Environment — environment artist (bottom-anchored, **horizontally tileable**, transparent above)
For each season `s ∈ spring|summer|autumn|winter`: `env/far_<s>.svg` (0 0 1200 420, parallax 0.15: misty hills, distant tall
trees), `env/mid_<s>.svg` (0 0 1200 360, parallax 0.35: big round trees with low branches, mushroom houses, ferns, a pond edge
with lily pads at the bottom), `env/ground_<s>.svg` (0 0 1200 260: grass/moss/leaves/snow, top edge ≈ y 40 drawn at
`groundY − 30`). Spring: pink blossoms; summer: deep greens + flowers; autumn: orange/red/gold canopy (muted!); winter: snow
caps, bare-ish trees, frozen pond. Plus `env/sun.svg`, `env/cloud1..3.svg` (0 0 300 160). Particles (0 0 32 32):
`petal`, `leaf_a`, `leaf_b` (autumn), `snow1`, `snow2`, `sparkle`, `star`, `firefly`, `puff`, `confetti_a`, `confetti_b`
(neutral, tinted by code). Report the branch/perch heights (where lanterns can hang) in svg coordinates of `mid_*`.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `card_art.js` | character artist A |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, card_art, render, ui, main.

### 5.1 Content (`content.js` → `DM.Content`)
```
DM.PALETTE, DM.ANIMALS = ['fox','deer','hedgehog','squirrel','bunny','frog','bear','owl','mouse']
DM.AGE_TOPICS = { 3:['colors','size','shapes','animals'], 4:['colors','shapes','count','animals'],
                  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
DM.Content.makeRound(topic, { age, lang, rng, roundIndex }) → round     // pure, deterministic, self-checks solvable
DM.Content.makeTalk(topic, { age, lang, rng }) → talk                   // as Kitten (show = a card face)
```
```
round = { topic, promptKey:'p.<topic>', params, pairs:N, peek /*s*/,
  cards:[{ id, key /*pair key: two cards share it*/, face:{ kind:'color'|'shape'|'dots'|'number'|'letter'|'text'|'animal'|'parity',
           value, color?, shape?, sprite?, text?, n?, scale? }, nameKind, nameValue }],
  reward:{ kind:'butterfly'|'lantern'|'acorns'|'animal'|'star' } }
```
- Pairs per round: age 3: 2, 2, 3, 3; age 4: 2, 3, 4, 4; age 5: 3, 4, 5, 5; age 6–7: 3, 4, 5, 6. Peek: 3.5 / 2.5 / 2.0 / 1.5 / 1.5 s by age 3/4/5/6/7.
- `colors`: pairs of the same colour (face kind `color`: a code-drawn butterfly in that colour); no blue+purple, red+green,
  yellow+orange or green+orange in one round below age 5.
- `shapes`: pairs of the same shape (lantern-style shape); age ≤ 4 every shape in a round has a different colour AND the pair
  shares colour; age 5: pairs share the shape only (different colours: real shape matching).
- `size` (age 3): pairs = the same animal big and small (`scale` 1 and 0.6); `count`: numeral card ↔ dots card (acorns) with the
  same N (age 3–4: 1–5, 5: 1–10, 6–7: up to 12, dots in a dice-like layout); `animals`: two identical animal cards;
  `letters`: same capital; `lower`: capital ↔ small (never I/l); `initial`: letter ↔ animal picture whose word starts with it
  (en/vi word lists like Kitten, with forest animals; vi skips digraph words); `add`/`sub`: "2 + 3" ↔ "5"; `oddeven`: numeral ↔ dots pairs (n ≤ 12) whose card frames are coloured by parity (odd = blue frame,
  even = orange frame); Dee names the parity on every match ("Seven — odd!").
- Every round's keys are distinct pairs (no third card with the same key); faces never repeat the previous round's set exactly.

### 5.2 `DM.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s)
Public API/fields as Kitten (`setViewport, setAge, setLang, newSession, startLevel, update, drainEvents, pointerDown/Move/Up,
cancelDrag (no-op), hint, talkAnswer, prompt(), layout, state, level, topic, round, roundsPerLevel, stars, levelStars, talk, cur,
alpha, stateTime, wind`), states `intro | round | roundDone | talk | levelDone | sessionDone`, plus:
- `w.phase` inside a round: `'deal' | 'peek' | 'hide' | 'play' | 'resolve' | 'done'`.
- `w.cards[]` (alias `w.items`): `{ id, key, face, nameKind, nameValue, state:'deal'|'down'|'up'|'matched'|'gone',
  x, y, _px, _py, rot, _prot, w, h, flip /*0 back … 1 face*/, _pflip, lift /*0..1*/, sx, sy, glow, alpha }`.
- `w.rewards[]`: `{ id, kind, color?, shape?, sprite?, n?, text?, x, y, _px, _py, rot, _prot, sx, sy, state:'fly'|'settle'|'idle',
  perch, alpha, flap /*butterfly wing phase*/ }` — stay for the whole chapter (they make the forest come alive), fade at chapter end.
- `w.dee { mood, moodT, lookX, lookY, hop }`.
- Interaction: `pointerDown(x, y)` → card id or null. Rules: only in `play` (and `resolve` of a mismatch, see below); a down card
  flips up (event `flip`); tapping a face-up unmatched card says its name again (event `tap`); with 2 cards up and not matching,
  a third tap flips those two down at once and flips the new one (impatient kids never wait); taps on matched cards → `tap`.
- Match check when the second card is fully up (flip ≥ 0.95): match → `match` event, both cards lift, slide towards their midpoint,
  spin a full turn with a bounce, burst (state `gone`) and spawn ONE reward (event `reward`) that flies on an arc to a free perch;
  mismatch → `mismatch` event, both cards do a small "no-no" shake, wait `CONFIG.mismatchShow` (≈ 1.0 s, age 3: 1.4 s) and flip down.
- Hints: after 3 mismatches in a row (or the 2nd idle nudge) → `hint {a, b}`: the two cards of one unfound pair glow and do a quick
  peek (flip to 0.5 and back) once; hint cooldown 6 s. Idle nudges after 12 s without a tap, backoff ×1.5 up to 30 s.
- Stars per round: mismatches ≤ max(1, pairs − 1) → 3, ≤ 2·pairs → 2, else 1. Chapter time limit 90 s (after ≥ 3 rounds → Talk).
- Events: `level {level, topic}`, `round {round, topic, promptKey, params, pairs}`, `deal {id}` (each card leaving the stack),
  `peek {}`, `hide {}`, `flip {id, nameKind, nameValue, face}`, `tap {id, nameKind, nameValue}`, `match {a, b, key, nameKind,
  nameValue, found, pairs}`, `mismatch {a, b, nameA…, nameB…, streak}`, `reward {id, kind, x, y}`, `land {id}` (reward
  settled), `hint {a, b}`, `idle {n}`, `roundDone {round, stars, mismatches}`, `talk`, `talkAsk {n}`, `talkResult`, `levelDone`, `sessionDone`.
- **Motion (physical):** deal: cards fly from a stack beside Dee on ballistic arcs with a spin (ω), staggered 0.07 s, landing squash;
  flip: `flip` follows a critically damped spring (ω ≈ 18) with a lift arc (lift peaks at flip 0.5, card rises 8 px, shadow grows),
  rendered as scaleX = |cos(π·flip)| with the face shown when flip > 0.5 and a slight skew for depth; mismatch shake: damped sine
  rotation ±0.08 rad, 3 wiggles; match: slide together with a spring, spin with overshoot, squash, then burst; peek: all cards flip
  up in a wave (0.05 s stagger) and down in a reverse wave; idle: a faint breathing scale on face-down cards (≤ 1.5 %); rewards:
  butterflies flutter on a noisy sine path and land with wing flaps, animals hop in 2–3 parabolic hops, acorns tumble and bounce
  (restitution 0.4) on the ground, lanterns float up and swing like pendulums from a branch, stars twinkle in the air.

### 5.3 `DM.Weather` — as Kitten's API (`setWeather(i)` 0 spring, 1 summer, 2 autumn, 3 winter; crossfade 2.5 s), `ambient`
(`skyTop, skyBottom, horizon, tint, wind, sway, sun, sunX, sunY, darkness 0`, `season` 0..3), particles: spring falling petals +
butterflies, summer sparkles + a few fireflies at dusk-ish light, autumn tumbling leaves with gusts, winter snowflakes. Cap 120.

### 5.4 `DM.Bot` — taps through `world.pointerDown` with a memory model: remembers seen faces with probability `skill`, plays
known pairs first, otherwise flips unknown cards; human-ish delays; Talk answers right with p = skill.

### 5.5 Test hooks — as Kitten: URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.DM.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill),
setAutoRestart(on), gotoLevel(i), voiceLog, cardScreen(id) → {x, y, w, h} in CSS px, audio() }`.

### 5.6 `DM.CardArt` (artist A, `card_art.js`) — classic script, node-safe at load (touch DOM lazily)
```
DM.CardArt.drawBack(ctx, w, h, opt)                 // centred at 0,0; uses card_back.svg if DM.Assets has it, else draws the pattern
DM.CardArt.drawFront(ctx, w, h, face, opt)          // frame + face content for kinds color(butterfly), shape(lantern-style),
                                                    // dots(acorns, dice layout up to 12), number, letter, text, parity frame;
                                                    // kind 'animal' → calls opt.sprite(name, x, y, size) supplied by the renderer
DM.CardArt.drawButterfly(ctx, color, size, flap /*0..1*/)   // reward + colour face
DM.CardArt.drawLantern(ctx, shape, color, size, glow)       // reward + shape face (shapes: circle, square, triangle, star, heart, rect)
DM.CardArt.drawAcorn(ctx, size)                     // reward + dots
DM.CardArt.drawStar(ctx, size, text?)               // reward for letters/sums: a glowing star, optional text
DM.CardArt.COLORS = { key: {base, dark, light} }
```
Cache card fronts/backs per (face, size bucket, dpr) like Kitten's BalloonArt. Text: bold rounded font, ≥ 4.5:1 contrast.

## 6. Voice, language — as Kitten §6 with helper **Dee**: written "Dee" in both languages, spoken "Đi" by the Vietnamese voice
(substitute in the spoken text only); a playful duckling: pitch ≈ 1.3, rate ≈ 0.92.
- Forest animal names: fox "fox"/"con cáo", deer "deer"/"con hươu" (accept "nai", "hươu con"), hedgehog "hedgehog"/"con nhím",
  squirrel "squirrel"/"con sóc", bunny "bunny"/"con thỏ", frog "frog"/"con ếch", bear "bear"/"con gấu", owl "owl"/"con cú",
  mouse "mouse"/"con chuột".
- Prompts `p.<topic>`: "Find two cards that match!" + topic flavour ("Find the colour pairs!", "Match the number with the acorns!",
  "Find two of each animal!"); flip names: colour "Red!", shape "A heart!", dots "One, two, three acorns!" (count the dots), number
  "Three!", animal "A fox!"; match lines `sayMatch(lang, ev)` ("Two foxes! A pair!"); mismatch `sayMismatch(lang, ev)` ("A fox and
  an owl. Let's look again!") — kind, never negative; `peek[]` ("Look carefully!"), `hide[]` ("Now they hide!"), `hint[]`, `idle[]`,
  `praise[]`, `great[]` with `{child}`, `talk.*`, `weather.0..3` ("Spring is here!", "Hello, summer!", "Autumn leaves!", "Snowy winter!"),
  `ui.*` incl. `ui.volume`, logo lines "Dee's" / "Forest Memory", VI "Vịt Dee" / "Lật Thẻ Rừng Xanh".

## 7. Integration (lead) — as Kitten §7: title (Dee waving next to three cards that flip on their own), settings with volume,
HUD, bubble, pause with −/+, chapter banner, Talk time, session done (winter party with all rewards from the session).
Audio: loud chain (Kitten), SFX: deal flick, card flip "fwip" (rising when face shows), name chime, match two-note chime +
sparkle, mismatch soft "hmm-hmm" + paper shuffle, reward flutter/hop/tumble, star dings, fanfare; music per season.

## 8. Performance — ≤ 12 cards, cached faces, ≤ 30 rewards per chapter, ≤ 160 particles; adaptive quality as Kitten.
