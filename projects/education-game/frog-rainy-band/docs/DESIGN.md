# Bop's Rainy Band — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.RB`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../giraffe-jungle-tower/` (state machine, voice, input, storage, loud
audio with volume, ui, main, tests) with `JT → RB` and storage prefix `rb:` already replaced. **The tower world is replaced
by a band world.** When a detail is missing here, do what `../giraffe-jungle-tower/docs/DESIGN.md` does (i18n/voice API,
hooks, Talk time, chapter-topic rotation between sessions, idle auto-pause, tap lock, CONFIG style, event names that still
make sense). Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Lulu's Jungle Tower
| Lulu's Jungle Tower | Bop's Rainy Band |
|---|---|
| drag a block up and drop it on the tower | **tap an instrument / band member** (a tap, no drag); counting: **tap Bop's big drum N times** |
| Lulu the giraffe | **Bop the frog** (`bop`), bottom-left, with his **big drum** beside him |
| jungle, times of day | **rainy-day garden**, one **season** per chapter: spring → summer → autumn → winter |
| tray of 3 blocks + tower | **a wooden stage on flower pots** with 2–4 **band members** (drums or animals) on stools, and a **song sheet** (N empty note circles on a vine-line staff) above the stage |
| monkey grabs bananas | **song done**: the band **plays the child's song back** note by note (each member bounces and plays its pitch, Bop drums, notes float up), then stars |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */,
    groundY,                       // front grass line: H - ins.bottom - (portrait ? 36 : 24)
    S,                             // member size (bounding square of a drum/animal): 150 for 2–3 members, 132 for 4
                                   //   (portrait tall ×1.15); never below 112
    stage: { x0, x1, y },          // the stage plank's TOP surface y, and its left/right ends.
                                   //   landscape: x0 = ins.left + 380 (W < 1100: 350), x1 = W - ins.right - 24, y = groundY - 74
                                   //   portrait: x0 = ins.left + 24, x1 = W - ins.right - 24, y = groundY - 330 (tall: groundY - 380)
    slots: [ {x, y} ],             // member CENTRES on the stage, spread evenly over x0+S/2+20 … x1-S/2-20 (n = members of the round),
                                   //   y = stage.y - 38 /*stool*/ - S/2. Spacing ≥ S + 24.
    bigDrum: { x, y, r },          // Bop's big drum: centre and radius of its drum head ellipse width; drawn as a side-view drum
                                   //   2r wide, 1.5r tall. landscape: x = ins.left + 250, y = groundY - 92, r = 92;
                                   //   portrait: x = ins.left + 470, y = groundY - 100, r = 100
    bop: { x, y, h },              // FEET point and height. landscape: x = ins.left + 100, y = groundY - 4, h = 300;
                                   //   portrait: x = ins.left + 150, y = groundY - 4, h = 320
    sheet: { x0, x1, y, slots:[{x,y}] }, // the song sheet: a horizontal vine-line with note circles (size `noteR` = 34);
                                   //   landscape: y = max(ins.top + 200, stage.y - S - 38 - 170), over the stage x range;
                                   //   portrait: y = bubble.y + bubble.h + 60. Slots spaced evenly, ≤ 110 apart, centred.
    countCard: { x, y, w, h },     // the number card for counting asks (numeral + dots) — shown above the big drum
                                   //   (landscape: centred on bigDrum.x, y = bigDrum.y - 1.5r - 190, 180×150; portrait: right of the
                                   //   sheet's centre over the stage — anything readable that doesn't overlap the bubble/HUD)
    bubble: { x, y, w, h },        // landscape: x = ins.left + 24, y = ins.top + 18, w = min(560, W - ins.right - 200 - x), h = 122
                                   // portrait: x = ins.left + 24, y = ins.top + 110, w = W - x - ins.right - 24, h = 124
  }
  ```
- Hit test of a member: centre ± (0.6·S + 14). Big drum: its box + 20 px. Bop: his box + 20 px (a tap repeats the prompt).
  Nothing the child must tap sits under the HUD (`x > W - ins.right - 160, y < ins.top + 96`) or the bubble (`world.hudKeep`).

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no famous cartoon frog: no
  Muppet-like frog, no "Pepe", no Froggy the Gremlin, no Frog-and-Toad book look, no Keroppi). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). Defined in `content.js` as `RB.PALETTE`.
- **Bop**: a small round frog, body **aqua `#62C7CF`**, shade `#3E9EA8`, outline `#2A6E78`, belly cream `#FFF4DA`, big eyes on
  top of the head (white with `#2F2A3A` pupils + catch-light), pink cheeks `#F6B1A0`, wide smile, a **straw hat `#E9C98E`** with
  a brown band `#9C6B43`, holding two **drumsticks** (wood `#C99A6B`, cream tips). Bop never wears an answer colour.
- **Instruments** (drawn by code in `band_art.js`): a side-view **drum** (cylinder shell, cream skin `#FFF6E4` ellipse on top,
  tension zig-zag cord, two rims). *Colour* drums: the shell in the answer colour (base / dark rims / light highlight). Other
  drums: a **natural wood shell `#E7C590`** (rims `#A8743F`) with a painted face on the shell: shape (in its colour, dark
  outline), dice dots (`#5A3A22`), numeral (dark, bold rounded), letter, or text. Ages ≤ 4: shapes in different colours; below
  age 5 never blue+purple, red+green, yellow+orange, green+orange in one set. The **big drum** is a larger wooden bass drum
  `#C98B55` with a cream head, seen from the front at a slight tilt so the head reads as an ellipse.
- **Garden**: soft, calm colours so answer colours pop: lawn `#8CC47A`/`#6FAE66`, hedges `#5E9E6A`, a fence and flower beds in
  muted tones, a wooden shed far away. Seasons: spring `#CFE6F0 → #F3F1E2` (light rain, blossoms), summer `#8FD0F2 → #E3F4FB`
  (sun shower, rainbow), autumn `#E9C9A0 → #F6E6CB` (drizzle, orange/brown leaves desaturated), winter `#C9D6E6 → #EEF2F7`
  (snow on everything, snowflakes). The stage: warm wood `#B9834F` plank, top `#D9A86C`, on two terracotta flower pots.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & UI — character artist A
| File | viewBox | Notes |
|---|---|---|
| `characters/bop_{idle,blink,talk,happy,cheer,think,oops,drum,drum_up,umbrella}.svg` | 0 0 300 300 | Bop 3/4 view facing RIGHT (towards his drum and the band), **feet anchor (150, 292)**, identical body in every frame; happy = big smile; cheer = arms up, eyes closed smile; think = head tilt; oops = "hmm?" (never sad); talk = mouth open; **drum** = both sticks down hitting at about (285, 210); **drum_up** = sticks raised; **umbrella** = holding a big leaf umbrella over his head |
| `characters/bop_full_wave.svg` | 0 0 300 300 | title pose (waving a drumstick) |
| `characters/snail.svg`, `characters/snail_ring.svg` | 0 0 140 110 | a cute snail (shell soft lilac-cream `#E7D6C6`/`#B98E7A`, body `#C7E0A8`) carrying a tiny silver bell; ring = bell tilted, a little shine |
| `characters/umbrella_leaf.svg` | 0 0 220 160 | a big rounded leaf umbrella (spare: render may draw it above the band in a shower) |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Bop with drumsticks beside a red, yellow and blue drum under raindrops, full-bleed background |

### 4.2 Band members & band art — character artist B
- `items/animal_<x>.svg` + `items/animal_<x>_sing.svg` (0 0 160 160, white sticker border, sitting pose, **bottom anchor (80, 156)**,
  identical body; sing = mouth open, eyes happy) for **garden animals** `RB.ANIMALS = ['duck','cat','dog','cow','sheep','hen','bird','pig']`.
  Friendly, round, readable at 110 px.
- **`game/js/band_art.js`** → `RB.BandArt`:
  ```
  RB.BandArt.drawMember(ctx, item, S, opt)  // origin = item CENTRE (S = bounding square). opt: { glow 0..1, hit 0..1 (just tapped:
                                            //   skin ripple), dpr, img(name) → loaded Image|null, sing (bool, animals) }
                                            //   drums: kind color|shape|dots|number|letter|text|size; animals: kind animal (sticker)
  RB.BandArt.drawStool(ctx, w, h)           // a small flower-pot stool under a member (origin = top-centre of its seat)
  RB.BandArt.drawBigDrum(ctx, r, opt)       // Bop's bass drum, origin = drum centre; opt { hit 0..1, glow 0..1 }
  RB.BandArt.drawNote(ctx, size, color, opt)// a music note (eighth note) in a colour (origin = note head centre); opt { empty: true }
                                            //   draws the empty note circle of the song sheet (dashed cream ring)
  RB.BandArt.drawSheet(ctx, x0, x1, y, n, season) // the song-sheet vine-line (with little leaves) between x0 and x1
  RB.BandArt.drawNumberCard(ctx, w, h, n, lit) // the counting card: numeral n + n dots below, `lit` of them glowing (0..n)
  RB.BandArt.drawGhostHand(ctx, size, t)    // a friendly pointing hand (hint), origin = fingertip, t = tap animation 0..1
  RB.BandArt.drawGlow(ctx, w, h, t, strength)
  ```
  `item = { kind, value, color?, shape?, n?, text?, animal?, size? }` — kind ∈ `color`, `shape`, `dots`, `number` (numeral +
  optional dots if `showDots`), `animal`, `letter`, `text`, `size` (`size: 'big'|'small'` — a colour drum drawn at 1 / 0.68 × S).
  Cache static drum faces per (key, S, dpr). Shapes: `RB.SHAPES = ['circle','square','triangle','star','heart','rect','diamond','oval']`.

### 4.3 Environment — environment artist
- `env/far_<s>.svg` (0 0 1200 420), `env/mid_<s>.svg` (0 0 1200 380), `env/ground_<s>.svg` (0 0 1200 260) for
  `s ∈ spring|summer|autumn|winter`: horizontally tileable, bottom-anchored, transparent above. far = soft hills, a far shed,
  trees; mid = hedges, a picket fence, flower beds, garden trees; ground = lawn with stepping stones, puddles, a few flowers
  (keep the middle band calm: the stage stands there). Winter: snow caps on everything.
- `env/stage.svg` (0 0 800 140): the wooden plank stage on two terracotta flower pots, **plank top surface at y = 20**, spans x 0–800
  (render stretches it horizontally between stage.x0 and x1, keep the ends ≤ 60 px so a 9-slice works: left cap 0–60, middle
  60–740 tileable, right cap 740–800).
- `env/sun.svg`, `env/cloud_{a,b,c}.svg` (0 0 320 170, soft rain clouds — grey-blue bellies), `env/rainbow.svg` (0 0 800 400, soft arc).
- Particles (0 0 32 32): `drop` (raindrop, blue-white), `splash` (ring), `petal` (cherry blossom pink-cream), `leaf_a`, `leaf_b`
  (autumn, muted orange/brown), `snow`, `sparkle`, `star`, `puff`, `note_a`, `note_b` (white music notes, tinted by code),
  `confetti_a`, `confetti_b` (white, tinted by code).

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `band_art.js` + `items/*` (+ `tools/art_animals.py`) | character artist B |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, band_art, render, ui, main.

### 5.1 Content (`content.js` → `RB.Content`)
```
RB.PALETTE, RB.ANIMALS, RB.SHAPES, RB.NOTE = { red:60, orange:62, yellow:64, green:65, blue:67, purple:69, pink:71 } // MIDI pitch per colour
RB.ANIMAL_SOUND = { duck:'quack', cat:'meow', dog:'woof', cow:'moo', sheep:'baa', hen:'cluck', bird:'tweet', pig:'oink' }
RB.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
                  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
RB.Content.makeRound(topic, { age, lang, rng, roundIndex, surprise }) → round   // pure, deterministic, self-checks solvable
RB.Content.makeTalk(topic, { age, lang, rng }) → talk                          // as the tower game (picture choices ≤ 5)
RB.Content.topicsFor(age, rng, lastTopics)
```
```
round = { topic, n /* notes in the song */, members: [ item ], asks: [ ask ×n ], surprise: null|'snail'|'shower' }
ask   = { mode: 'pick'|'drum'|'listen', promptKey, params, answer /* index into members, -1 for mode drum */, n? /* drum/listen count */,
          nameKind, nameValue }
item  = { kind, value, color?, shape?, n?, text?, animal?, size?, showDots?, nameKind, nameValue, pitch /* MIDI */ }
```
- The **members stay on the stage for the whole round** (the band); each ask names one of them. Notes per round: age 3: 2,2,3,3;
  age 4: 2,3,4,4; age 5: 3,4,4,5; 6–7: 4,4,5,5. Members per round: age 3: 2; 4–5: 3; 6–7: 3 (4 from round 2); warm-up round 0: 2.
  Exactly one member matches each ask; no two consecutive asks share an answer; every member is asked at least once when
  n ≥ members (it's their song too). New members every round (no identical rounds).
- `colors`: kind `color`, prompt `p.colors {color}` "Play the RED drum!". pitch = RB.NOTE[color].
  `shapes`: kind `shape` (age ≤ 4 different colours; age 5 a same-colour distractor), prompt `p.shapes {shape}`.
  `size` (age 3): two drums of the SAME colour, big and small, `p.size {size}`; big = low pitch, small = high.
  `animals`: kind `animal`, prompt `p.animals {animal}`; from round 2 at age ≥ 4 half the asks by sound `p.sound {animal}`.
  Pitches of non-colour members: a pentatonic set C D E G A by slot.
- `count` (mode `drum` and `listen`): rounds 0–1 asks are **mode `drum`**: `p.drum {n}` "Drum 3 times!" — the child taps the big
  drum n times (n ∈ 1–5 at age 4, increasing in round 0: 1→2, round 1: 2..4), members = [] (the stage shows the band of
  2–3 **plain drums** that just accompany; they're not asked). Rounds 2–3: **mode `listen`**: `p.listen {n}` "Listen! How many
  booms?" — Bop plays n beats on the big drum (event `beat {i}` each 0.6 s, with the count card hidden), then members = 3
  `number` drums with `showDots` (age ≤ 4) and the child picks the one with n. (age 5: n ∈ 1–10, 6+: up to 12, no dots ≥ 6.)
- `letters`, `lower`, `initial`, `add`, `sub`, `oddeven`: kinds `letter` / `text` / `number`, mode `pick`, as the tower game.

### 5.2 `RB.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API/fields as the tower game: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i),
update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), layout, hudKeep, state,
level, topic, round, roundsPerLevel, stars, levelStars, talk, alpha, stateTime, wind, resetNudges()`; states
`intro | round | roundDone | talk | levelDone | sessionDone`; plus:
- `w.phase` in a round: `'deal' | 'ask' | 'beats' | 'play' | 'song' | 'clear'`.
- `w.members[]`: `{ id, item, slot, x, y /*centre*/, _px, _py, sx, sy /*squash*/, rot, _prot, glow 0..1, hit 0..1, sing 0..1,
  state: 'in'|'rest'|'out'|'gone', t }`.
  - **in**: hop in from off-stage right in a staggered arc (0.12 s apart, apex 120 px, landing squash sy 0.8 → spring back) →
    `rest` (idle sway ±2°, breathe ±2 % scale; hinted → wiggle). **out** (clear): hop off to the right one by one.
  - **Tap** (pointerDown + pointerUp within 0.6 s and < 40 px; a held/slid finger does nothing; on pointerDown already show a
    tiny press squash): right member → it **plays**: squash (sx 1.15, sy 0.82) then spring (ω ≈ 22, ζ ≈ 0.35, visible
    overshoot), `hit` 1 → 0 in 0.4 s (skin ripple), `sing` 1 for animals 0.7 s; a **note flies** from the member to the next
    empty sheet slot on a ballistic arc (0.55 s, apex 90 px, spin) — `w.flyNotes[] = {x,y,_px,_py,rot,color,t,toSlot}` — and
    fills it (`w.sheet.notes[i] = {color, item, pop 0..1}`), events `play {memberId, x, y, item, pitch, nameKind, nameValue,
    i /*note index*/}` then (when the note lands) `note {i}`; phase `play` (0.6 s) then the next `ask` (or `song`).
    Wrong member → **wobble**: rot shake ±0.25 rad damped (0.5 s), event `wrong {memberId, x, y, item, pitch, nameKind,
    nameValue, want:{kind,value}, streak}`; tap lock `CONFIG.wrongLock` 0.6 s (taps during the lock → `locked`); after the 2nd
    miss on an ask → `hint {memberId, x, y}` (glow + ghost hand tapping it: `w.hintHand = {x, y, t}`); idle hints respect a
    6 s cooldown; idle nudges after 12 s without a tap, backoff ×1.5 up to 30 s (`idle {n}`; the 2nd idle also hints).
  - Taps on the big drum during a `pick`/`listen` ask: a fun boom only (`boom {x, y}` — no score, no mistake).
- **Big drum** `w.bigDrum = { x, y, r, hit 0..1, sx, sy, count /*taps in a drum ask*/, glow }`. Mode **drum**: each tap → `hit`,
  squash, event `drumTap {i, n, x, y}` (i = 1…n, Bop `drum` pose); the count card lights dot i; at i = n → a note flies into
  the sheet, event `note`, and the ask is done (extra taps after n during `play` → `boom` only). The sheet in a count round has
  one slot per drum ask. Mode **listen**: phase `beats`: Bop drums n beats (`beat {i, n}` every `CONFIG.beatGap` 0.6 s,
  big drum hits on its own), then phase `ask`; a tap on Bop or the bubble during the ask replays the beats (`replayBeats`).
- `w.sheet = { n, notes: [ null | {color, item, pop} ] }`; `w.countCard = null | { n, lit, show 0..1 }` (shown in mode drum,
  and in listen mode after the right answer).
- **song** (after the n-th note): `songStart {n}`, then every `CONFIG.songGap` 0.45 s `songNote {i, memberId|null, pitch, x, y}`
  — sheet note i pops (scale 1.4 → 1), its member plays (squash + sing; null → the big drum), Bop alternates `drum`/`drum_up`;
  after the last: `songEnd`, Bop `cheer`, then `roundDone {round, stars, misses}` (3 / 2 / 1 stars for 0 / 1 / ≥ 2 misses).
  **clear** (≈ 0.9 s): members hop off, the sheet empties with a sparkle per note (`clearNote {i, x, y}`), then the next round
  (or Talk time after round 4 / 80 s chapter limit with ≥ 3 rounds).
- `w.bop = { x, y, mood /*idle|talk|happy|cheer|think|oops|drum|drum_up|umbrella*/, moodT, blinkT, look }`. Taps on Bop
  (< 40 px, < 0.6 s) → `pokeBop` (main repeats the prompt / replays the beats).
- Surprise (one round per chapter, rotating): `snail` — after the 1st note, a snail crawls onto the stage's left end (5 s,
  `w.snail = {x, y, t, state:'in'|'rest'|'ring'|'out'}`); tap → `snailTap {x, y}` (bell ding, sparkles, no score effect), it
  stays for the song (rings on every 2nd song note), then leaves. `shower` — after the 2nd note, `shower` event: heavy rain
  for 4 s (`w.shower` 0..1), Bop `umbrella` 2.5 s, 6 raindrops hit the members (`raindrop {memberId, x, y}` → tiny pitched
  "plink"). Events `snail`, `snailTap`, `shower`, `raindrop`.
- Events also: `level {level, topic}`, `round {round, surprise}`, `deal`, `ask {ask, asks, promptKey, params, mode, first}`,
  `talk`, `talkAsk {n}`, `talkResult`, `levelDone`, `sessionDone {stars}`, `stillDrag` not used.
- Rotation / resize mid-round: re-layout, snap members to their new slots, flying notes land instantly.

### 5.3 `RB.Weather` — API as the tower game (`setWeather(i)` 0 spring, 1 summer, 2 autumn, 3 winter; crossfade 2.5 s),
`resize(W,H)`, `update(dt)`, `setShower(k 0..1)`, `ambient` (`skyTop, skyBottom, tint, sun, sunX, sunY, rainbow 0..1, darkness
/*0*/, rain 0..1, snow 0..1, wind, season:'spring'|'summer'|'autumn'|'winter'`), particles: spring light rain + falling petals,
summer sun shower (sparse bright drops) + rainbow, autumn drizzle + tumbling leaves, winter snowflakes (no rain). Raindrops
end in a `splash` on the ground band (`splashY` given by `resize(W, H, groundY)`). Cap 160.

### 5.4 `RB.Bot` — taps through `world.pointerDown/Up(x,y)` on the right member with p = skill (a wrong answer = a random other
member); in mode drum taps the big drum n times (0.35–0.6 s apart); human-ish delays (1.0–2.4 s) after `ask`; answers Talk
right with p = skill; taps the snail sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.RB.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), goTitle(), setBot(on, skill),
setAutoRestart(on), gotoLevel(i), voiceLog, memberScreen(id) → {x, y, w, h} CSS px (centre), bigDrumScreen(), bopScreen(),
answerId() → id of the right member in the current ask (null in mode drum), toScreen(x,y), audio() }`. World supplies
`memberHit(id)`, `bigDrumHit()`, `bopHit()` (logical centre boxes) and `answerId()`.

## 6. Voice, language — as the tower game §6 with helper **Bop** (EN "Bop", VI "Bốp"; title "Ếch Bốp"), a cheerful little frog:
pitch ≈ 1.2, rate ≈ 0.9. Garden animals: duck "con vịt" (quack / "cạp cạp"), cat "con mèo" (meow / "meo meo"), dog "con chó"
(woof / "gâu gâu"), cow "con bò" (moo / "ò ò"), sheep "con cừu" (baa / "be be"), hen "con gà" (cluck / "cục tác"), bird "con
chim" (tweet / "chíp chíp"), pig "con heo" (oink / "ụt ịt").
- `p.colors` "Play the {color} drum!" / "Bé ơi, gõ trống màu {color} nhé!", `p.shapes` "Play the drum with the {shape}!",
  `p.size` "Play the {size} drum!", `p.animals` "Let's hear the {animal}! Tap it!", `p.sound` "Who says {sound}? Tap them!",
  `p.drum` "Drum {n} times on my big drum!", `p.listen` "Listen to my drum! How many booms? Tap that number!",
  letters etc. as the tower game. 3 wordings each.
- `sayPlay(lang, ev)` names the member + a tiny praise ("Red! Boom!" / "Màu đỏ! Bùm!"; animals: the sound word "Moo! The cow!"),
  `sayWrong(lang, ev)` ("Boing! That's the blue drum. Let's find red!" — names what was tapped, repeats the goal, never negative),
  `count.<n>` ("One!", "Two!" …, spoken on each drum tap / beat), `songStart[]` ("Here's your song!"), `songEnd[]` with `{child}`,
  `hint[]`, `idle[]`, `praise[]`, `great[]`, `talk.*`, `weather.0..3` ("Hello, spring rain!", "Sunny summer shower!", "Autumn
  leaves are falling!", "Look, snow!"), `surprise.snail`, `snail.tap`, `surprise.shower` ("Whoosh, a big shower! Umbrella up!"),
  `deal[]` ("The band is here! Let's make a song!"), `topic.*`, `session.done`, `ui.*` incl. `ui.volume`, logo lines "Bop's" /
  "Rainy Band", VI "Ếch Bốp" / "Ban Nhạc Mưa".

## 7. Integration (lead) — title (Bop waving beside his drum and three drums), settings with volume, HUD, bubble, pause with −/+,
chapter banner, Talk time, session done (winter party: snow, notes confetti, the whole band).
Audio: drum note per member pitch (membrane: sine drop + noise tick, + a soft mallet tone at the pitch), boing wobble, big-drum
boom, count chimes, animal voices (synth), song playback, snail bell, shower patter, rain ambience by season (snow: soft wind),
music per season (quiet, ducked under speech and during the song playback).

## 8. Performance — ≤ 4 members, cached drum faces, ≤ 160 particles; adaptive quality as the tower game.
