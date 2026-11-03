# Pip's Camp Hide & Seek — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.FC`**. Classic `<script>` files, no build step. The code base started
as a copy of `../elephant-rainbow-rocket/` (state machine, voice, input, storage, loud audio with volume, ui, main, tests)
with the namespace renamed `RR → FC` and the storage prefix `fc:`. **The rocket world is replaced by a hide-and-seek
world.** When a detail is missing here, do what `../elephant-rainbow-rocket/docs/DESIGN.md` does (layout rules, i18n/voice
API, hooks, Talk time, topic rotation between sessions, surprise round, idle auto-pause, tap lock). Target: iPhone + iPad
Safari first, portrait and landscape.

## 1. What changes versus Bim's Rainbow Rocket
| Bim's Rainbow Rocket | Pip's Camp Hide & Seek |
|---|---|
| tap the right cloud island, the rocket flies there | **tap a hiding place to peek**; the friend pops up; the right one jumps out and hops to the campfire |
| Bim in a rocket cockpit, moving | **Pip the baby fox** (`pip`) standing at the bottom-left on the grass (bottom-centre-left in portrait) |
| rainbow cloud land, time of day = altitude | **mountain campsite**, one **season** per chapter: spring → summer → autumn → winter |
| vertical camera climb | **static side view**: meadow with hiding places in 1–2 depth rows, a campfire with a log bench at the bottom-right |
| answers visible on islands | **answers hidden**: only a clue peeks above each hiding place (a coloured hat, a flag, a star sign, ears) |
| boost between rounds | **count-and-hide** at round start (Pip covers eyes, counts 1-2-3 aloud, friends scurry into the hiding places), **campfire dance** at round end |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera). y down.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */, scale /* 1, or 1.15 when tall */,
    bubble: { x, y, w, h },     // landscape: x = ins.left + 24, y = ins.top + 20, h = 122, w = min(640, W - x - ins.right - 440)
                                // portrait: x = ins.left + 24, y = ins.top + 96 + 24, h = 124, w = W - x - ins.right - 24
    groundY,                    // screen y of the front grass line: H - ins.bottom - (portrait ? 40 : 28)
    pip: { x, y, h },           // Pip's FEET point and height: landscape x = ins.left + 120, y = groundY - 6, h = 230;
                                // portrait x = ins.left + 120, y = groundY - 6, h = 250 (× scale)
    camp: { x, y, w },          // campfire centre on the ground: landscape x = W - ins.right - 150; portrait x = W - ins.right - 150; y = groundY - 10
    bench: [ {x, y} ×6 ],       // seats for found friends around the fire (3 left of it, 3 right/behind it), friend size 0.55·spotW
    rows: [ { y, scale } ],     // ground lines (screen y of a hiding place's BOTTOM) for the back and front row:
                                //   landscape back y = 0.58·H scale 0.86, front y = groundY - 150 scale 1;
                                //   portrait back y = 0.47·H scale 0.88, middle 0.62·H (only when > 4 places), front = groundY - 300 scale 1
    field: { x0, x1 },          // x range for place centres: landscape ins.left + 250 … W - ins.right - 260 (front row keeps clear of Pip and the fire)
                                //   back row may use ins.left + spotW·0.6 … W - ins.right - spotW·0.6; portrait: ins.left + spotW·0.6 … W - ins.right - spotW·0.6
    spotW                       // hiding place width: 220 (age ≤ 4), 200 (5+), × scale; height = 0.8·spotW
  }
  ```
- `world.hudKeep = [hudBox, bubbleBox]` (screen, set by main from the real DOM) — no clue may sit under them.
- Hiding places of one round: 2 → front row; 3 → front row; 4 → 2 back + 2 front (staggered); 5 → 2 back + 3 front;
  6 → 3 back + 3 front (portrait: 2+2+2 in three rows). Within a row spread evenly with jitter ±18 px, min centre distance
  `spotW·row.scale + 24`; back row places sit between the front row's places (staggered) so clues are never covered.
- **Hit test**: a place = its box (x ± w/2, from top of the clue to its bottom) + 22 px. Pip = his box + 20 px. Places never overlap.
- HUD buttons (DOM, top-right) occupy `x > W - ins.right - 160, y < ins.top + 96`.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no famous cartoon fox: no blue
  bandana hero, no lollipop-tail, no Japanese mascot foxes). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark)**: red `#E84A4A`/`#A8282E`, blue `#3C8DE8`/`#1F5BA8`, yellow `#FFD23F`/`#C99A12`,
  green `#4CC26B`/`#2A8343`, orange `#FF9A2E`/`#C4650C`, purple `#9B6BE0`/`#6840A8`, pink `#FF8FC0`/`#C9558A` (answer from age 5).
- **Pip**: a baby fox, fur warm **cinnamon `#D27B4E`**, shade `#B5603A`, outline `#7E3F25` (browner and less saturated than the
  `orange` answer), cream muzzle/chest/tail tip `#FFF1DE`, dark-chocolate paws and ear backs `#5B3A2E`, eyes `#2F2A3A` with
  catch-light, pink cheeks `#F6B1A0`, a **teal camping bandana `#2FA7A0`/`#1E7A74`** and a tiny mustard-free brown backpack strap
  `#8A6E4E`. Big fluffy tail. Pip never wears an answer colour.
- **Hiding places**: natural, calm, lower saturation than every answer colour (sage/olive greens, browns, greys, snow white):
  spring `bush` (round sage bush with a few tiny white blossoms) and `stump` (big tree stump, moss); summer `tent` (canvas tent
  `#E9DCC0` with a pole and a flap — NOT red/blue/yellow) and `rock` (grey boulder with moss); autumn `leaves` (pile of
  ochre-brown/muted rust leaves, desaturated so a red/orange hat still pops) and `log` (hollow log lying down); winter
  `snowman` (round snowman, twig arms, coal-grey buttons, a teal-free knitted scarf `#8C7B6B`) and `drift` (snow drift with a
  small fir). Each must hide a 0.75·spotW friend completely below its `peekY` line.
- **Sky / ground**: spring `#CDEBFB → #F6F0D8`, summer `#8FD0F5 → #E3F4FF`, autumn `#F3D9B5 → #CFE3F0`, winter `#C9D9EA → #F2F6FA`;
  mountains blue-grey, hills sage. Answer colours keep ≥ 3:1 against the meadow or carry their dark outline (they always do).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Pip & UI — character artist A
| File | viewBox | Notes |
|---|---|---|
| `characters/pip_{idle,blink,talk,happy,cheer,think,oops,cover,peek}.svg` | 0 0 256 300 | Pip standing, facing the viewer turned slightly right, **feet anchor (128, 292)**, identical body in every frame; happy = big smile, cheer = both paws up, think = paw to chin, oops = head tilt "hmm?" (never sad), **cover = both paws over the eyes (counting)**, **peek = one paw lowered, one eye peeking** (end of the count) |
| `characters/pip_full_wave.svg` | 0 0 256 300 | title pose, waving |
| `characters/critter.svg`, `characters/critter_pop.svg` | 0 0 128 128 | a little squirrel (grey-brown `#9C8574`, not orange) for the surprise; pop = arms up |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Pip peeking out from behind a bush with a camp tent and mountains, full-bleed background |
Artist A also owns **`game/js/camp_art.js`** (§5.6): clues (hats, flags, signs, badges), campfire flames, glow, butterflies, sparks — drawn by code.

### 4.2 Hiding places — character artist B
`spots/<kind>.svg` and `spots/<kind>_open.svg` for kind ∈ `bush, stump, tent, rock, leaves, log, snowman, drift`
(viewBox **0 0 240 200**, bottom-centre anchor **(120, 196)**, transparent around). `_open` is the same object "opened" for
a peek (bush branches parted to the sides, tent flap thrown open, leaves blown up and apart, log tipped, snowman's head
lifted / drift puffed apart) in the same frame so they can be swapped. Plus `spots/spots.json`:
`{ "<kind>": { "peekY": <viewBox y of the object's top over its central 50 %>, "season": 0..3 } }`.
Every friend is drawn BEHIND the hiding place and clipped at `peekY`, so the object's top must be a fairly level line across
its central 50 % (a bush is a rounded mound, a tent is wide with a flat-ish ridge… choose shapes so the head/ears/hat peek nicely).
Artist B also checks that the 8 animal friends (`items/animal_<x>.svg`, 0 0 128 128, existing) read as themselves from their
**top 40 % only** (ears + eyes); adjust the generator `tools/art_animals.py` minimally if one doesn't (e.g. the duck needs a hair tuft).

### 4.3 Environment — environment artist
- `env/mountains_<s>.svg` (0 0 1200 420, bottom-anchored, horizontally tileable, transparent above): distant mountain range
  per season `s ∈ spring|summer|autumn|winter` (snow caps; winter all white-blue). Drawn at 0.62·H tall-ish, parallax 0.
- `env/forest_<s>.svg` (0 0 1200 360, tileable, bottom-anchored): mid hills with pine/fir and broadleaf trees in season colours (muted).
- `env/meadow_<s>.svg` (0 0 1200 300, tileable, bottom-anchored): the foreground meadow / ground strip (grass, flowers, autumn leaves, snow).
- `env/campfire.svg` (0 0 200 140, anchor bottom-centre (100, 132)): ring of stones + crossed logs (flames drawn by code above (100, 92)).
- `env/bench.svg` (0 0 360 90, anchor bottom-centre (180, 84)): a log bench.
- `env/tent_bg.svg` (0 0 260 200): a decorative camp tent (muted canvas) placed behind the campfire; `env/lantern.svg` (0 0 48 80): a hanging camp lantern.
- `env/sun.svg` (0 0 200 200), `env/cloud_{a,b,c}.svg` (0 0 320 170).
- Particles (0 0 32 32): `petal` (pale pink), `leaf_a`, `leaf_b` (muted ochre/rust), `snow`, `seed` (dandelion), `sparkle`,
  `star`, `puff`, `dust`, `confetti_a`, `confetti_b` (tinted by code).

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `camp_art.js` | character artist A |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, camp_art, render, ui, main.

### 5.1 Content (`content.js` → `FC.Content`)
```
FC.PALETTE, FC.ANIMALS = ['cat','dog','cow','pig','sheep','duck','lion','frog'], FC.SHAPES = ['circle','square','triangle','star','heart','rect','diamond','oval']
FC.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
                  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
FC.SEASON_SPOTS = [['bush','stump'], ['tent','rock'], ['leaves','log'], ['snowman','drift']]
FC.Content.makeRound(topic, { age, lang, rng, roundIndex, season, surprise }) → round   // pure, deterministic, self-checks solvable
FC.Content.makeTalk(topic, { age, lang, rng }) → talk
```
```
round = { topic, places: [ { kind /*spot kind*/, friend /*animal*/, clue } ], asks: [ ask ], surprise: null|'swap'|'critter' }
clue  = { kind:'hat'|'flag'|'sign'|'ears'|'size'|'badge', value, color?, shape?, n?, scale?, text?, nameKind, nameValue }
ask   = { promptKey, params, answer /*index into places*/ }
```
- Places per round (= friends): age 3: 2,2,3,3; age 4: 2,3,4,4; age 5: 3,4,5,5; 6–7: 4,5,6,6. Asks = places − 1 (warm-up
  round 0: 2 places, 1 ask). Each ask's answer is a place not yet found; no two consecutive asks share a value; the
  remaining hidden places always contain exactly one match. Friends in a round are distinct animals; the hiding place kinds
  alternate between the season's two kinds.
- `colors`: clue `hat` (a woolly hat with a pompom in the answer colour); prompt `p.colors {color}` "Where is the friend in the
  RED hat?"; below age 5 never blue+purple, red+green, yellow+orange or green+orange in one round.
- `shapes`: clue `flag` (a pennant on a stick with a shape on it; age ≤ 4 the shapes have different colours).
- `count`: rounds 0–1 **count up**: clue `sign` with a numeral **and** that many stars; asks go 1, 2, 3 (… N) in order;
  prompt `p.countUp {n}`. Rounds 2–3: clue `sign` with stars only (dice layout), prompt `p.count {n}`; at age 4 n ∈ 1–5,
  distinct, ≥ 2 apart when possible.
- `animals`: clue `ears` (just the friend's head top shows); prompt `p.animals {animal}`; from round 2 at age ≥ 4 half the asks
  are by sound `p.sound {animal}`.
- `size` (age 3): two or three friends of the SAME animal, big and small (`scale` 1 / 0.62; the small one peeks lower) — "Find the
  BIG cow!" `p.size {size, animal}`.
- `letters`, `lower`, `initial`, `add`, `sub`, `oddeven`: clue `badge` (a round wooden sign with a letter or number) — same logic
  as the rocket game but one answer among the remaining places.

### 5.2 `FC.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` interpolation with `alpha`)
Public API/fields as the rocket game (`setViewport, setAge, setLang, newSession({lastTopics}), levels, startLevel, update,
drainEvents, pointerDown/Move/Up, cancelDrag, hint, talkAnswer, prompt(), layout, hudKeep, state, level, topic, round,
roundsPerLevel, stars, levelStars, talk, alpha, stateTime, wind, resetNudges`), states `intro | round | roundDone | talk |
levelDone | sessionDone`, plus:
- `w.phase` inside a round: `'gather' | 'count' | 'ask' | 'peek' | 'found' | 'party'`.
- `w.places[]`: `{ id, kind, x, y /*bottom centre*/, w, h, scale, row, peekY /*screen y of the clip line*/, open /*0..1*/,
  shake /*rotation, rad*/, _pshake, sx, sy, glow 0..1, found /*bool*/, friendId, appear 0..1 }`.
- `w.friends[]`: `{ id, animal, clue, x, y /*feet, screen*/, _px, _py, rot, _prot, sx, sy, scale, place /*id or null*/,
  state:'enter'|'wave'|'run'|'hidden'|'pop'|'boo'|'duck'|'jump'|'hop'|'seated'|'dance'|'leave'|'gone', rise /*0..1: how far it
  stands up out of its place*/, t, wave /*bool: use the _wave sprite*/, look /*-1..1*/ }`.
  A hidden friend sits behind its place with its head top `peekRise` px above `peekY` (render clips at `peekY` while
  state ∈ hidden|pop|boo|duck — i.e. only what is above the line shows). Clues are attached to the friend's head.
- `w.pip = { x, y, mood /*idle|talk|happy|cheer|think|oops|cover|peek*/, moodT, blinkT, lookX }`; `w.fire = { power 0..1 }`
  (flares on each find and at the party); `w.critter = null | { x, y, t, state:'in'|'up'|'tapped'|'out' }`.
- **gather** (≈ 1.0 s): the round's friends hop in from the right edge (staggered 0.12 s, small physical hops: ballistic arcs,
  landing squash) to a line in the open meadow and wave (event `gather`). **count** (≈ 2.6 s, `CONFIG.countTime`): Pip `cover`;
  events `countNum {n}` at 0.3, 1.1, 1.9 s (n = 1, 2, 3); the friends run (quick hop arcs, 2–3 hops each, staggered) to their
  places and duck in behind (place shakes + leaf puff, event `hideIn {placeId}`); at the end Pip `peek` → event `ready` → phase `ask`.
  In the warm-up round the child sees which friend goes where (helps); never speed this up with taps (taps ignored, return null).
- **ask**: event `ask {ask, asks, promptKey, params}`. A tap on a not-found place → that place opens: phase `peek`, `open`
  0 → 1 over 0.18 s with a rustle (shake ±0.1 rad damped), the friend `pop`s up (rise 0 → 1 with overshoot, 0.25 s) — event
  `peek {placeId, friendId, right}`.
  - right → event `found {placeId, friendId, nameKind, nameValue, n /*finds so far this round*/}`; the friend `jump`s out
    (ballistic arc forwards) then `hop`s (2–4 hops, apex 40–70 px) to the next free bench seat and sits (`seated`, event `seat`);
    the fire flares (`fire.power` 1). The place stays open (empty). Phase `found` lasts until the friend leaves the place
    (≈ 0.6 s), then the next ask (`ask`), or after the last ask → phase `party`.
  - wrong → event `wrong {placeId, friendId, nameKind, nameValue, want:{kind,value}, streak}`; friend `boo` (rises, wiggles,
    0.9 s, `look` at Pip) then `duck`s back (rise → 0) and the place closes; tap lock `CONFIG.wrongLock` 0.8 s (1.6 s after the
    2nd miss; taps during the lock → event `locked`). After the 2nd miss on the same ask → `hint {placeId}` (the right place
    glows and its clue bobs) — always on the 2nd miss; idle hints respect a 6 s cooldown. Idle nudges after 12 s without a
    real tap (taps on grass don't count), backoff ×1.5 up to 30 s (`idle {n}`; the 2nd idle also hints).
  - a tap on an already-found (empty) place → event `empty {placeId}` (a butterfly flutters out, no miss).
  - a tap on Pip (< 24 px move, < 0.35 s) → event `pokePip` (main repeats the prompt). Taps during gather/count/peek/found/party → null.
- **party** (≈ 2.2 s): event `roundDone {round, stars, misses}` (3 / 2 / 1 stars for 0 / 1 / ≥ 2 misses); the seated friends do a
  little dance (hop in place, staggered), Pip `cheer`, the fire flares. Then the friends `leave` (hop off to the right) and the
  next round starts (`gather`).
- Chapter: 4 rounds (time limit 80 s after ≥ 3 rounds → Talk), Talk time, `levelDone`, next chapter = next season (places
  of the new season's kinds).
- Surprise (one round per chapter, rotating): `swap` — after the first find, two still-hidden friends pop up, hop across to each
  other's place (crossing arcs, 0.9 s, event `swap {a, b}`) and hide again, then the next ask; `critter` — once during the round
  (between asks) a squirrel pops up from behind the forest edge / a tree for 3 s; a tap on it → `critterTap {x, y}` (sparkles, no
  score effect).
- Events: `level {level, topic}`, `round {round, topic, places, surprise}`, `gather`, `countNum {n}`, `hideIn {placeId}`, `ready`,
  `ask`, `peek`, `found`, `seat`, `wrong`, `locked`, `hint {placeId, idle?}`, `idle {n}`, `empty`, `pokePip`, `swap`, `critter`,
  `critterTap`, `roundDone`, `talk`, `talkAsk {n}`, `talkResult`, `levelDone`, `sessionDone`.
- Rotation / resize mid-round: re-layout places, snap friends to their places or seats, finish any running animation instantly.

### 5.3 `FC.Weather` — as the rocket game's API (`setWeather(i)` 0 spring, 1 summer, 2 autumn, 3 winter; crossfade 2.5 s),
`resize(W,H)`, `update(dt)`, `ambient` (`skyTop, skyBottom, tint, sun, sunX, sunY, darkness /*0; 0.25 in the winter party*/,
wind, mountains:'spring'|...`), particles: spring drifting blossom petals + butterflies (drawn by camp_art), summer dandelion seeds
+ sun glints, autumn falling leaves on gusty wind (sway + spin), winter snowflakes. Cap 120.

### 5.4 `FC.Bot` — answers through `world.pointerDown/Up` with p = skill (a wrong answer = a random other hidden place), human-ish
delays (1.0–2.4 s) after `ask`, answers Talk right with p = skill, taps the critter sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.FC.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), goTitle(), setBot(on, skill),
setAutoRestart(on), gotoLevel(i), voiceLog, placeScreen(id) → {x, y, w, h} CSS px (centre of the hit area), pipScreen(),
answerId() → id of the right place in the current ask, toScreen(x,y), audio() }`. World supplies `placeHit(id)` / `pipHit()`
→ `{x, y, w, h}` (centre + size, logical px) and `answerId()`.

### 5.6 `FC.CampArt` (artist A, `camp_art.js`) — classic script, node-safe at load (touch DOM lazily); every function draws centred
at the current transform origin unless noted.
```
FC.CampArt.drawClue(ctx, clue, size, opt)   // origin = the friend's HEAD TOP centre; size = friend sprite size (px).
                                            //  hat: woolly beanie + pompom in clue.color (base/dark/light), drawn ON the head (covers y 0…0.18·size, pompom above)
                                            //  flag: a stick from the head up (0.55·size) with a pennant/rounded flag showing clue.shape in clue.color
                                            //  sign: a wooden sign on a stick (0.6·size above the head): numeral (if clue.text/number) + clue.n gold stars, dice layout
                                            //  badge: round wooden badge on a stick with clue.text (letter/number), bold rounded font, ≥ 4.5:1 contrast
                                            //  ears/size: nothing (the friend's own head is the clue)
FC.CampArt.clueHeight(clue, size)           // px the clue sticks up above the head top (for hit boxes / keep-out)
FC.CampArt.drawFlames(ctx, power /*0..1*/, t, size)   // campfire flames, origin = base of the flames, pointing up
FC.CampArt.drawGlow(ctx, w, h, t, strength)          // soft golden glow ellipse for hints (origin = centre)
FC.CampArt.drawButterfly(ctx, size, t, color)        // flapping butterfly
FC.CampArt.drawSpark(ctx, size, color), FC.CampArt.drawStar(ctx, size, color)
FC.CampArt.COLORS = { key: {base, dark, light} }
```
Cache static parts (signs/badges per value/dpr) in offscreen canvases. The `shape` names are FC.SHAPES; the numeral font is
`ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui` bold.

## 6. Voice, language — as the rocket game §6 with helper **Pip** (written and spoken "Pip" in both languages), a cheerful baby
fox: pitch ≈ 1.2, rate ≈ 0.9. Animal names/sounds as before (cat "con mèo" meo meo, dog "con chó" gâu gâu, cow "con bò" ùm bò,
pig "con heo"/"lợn" ụt ịt, sheep "con cừu" be be, duck "con vịt" cạp cạp, lion "con sư tử" gừm gừm, frog "con ếch" ộp ộp).
- `count[]` lines for the counting while friends hide: `countNum.1..3` ("One…", "Two…", "Three! Ready or not, here I come!" /
  "Một…", "Hai…", "Ba! Pip đi tìm đây!"), `gather[]` ("Let's play hide-and-seek!" / "Mình chơi trốn tìm nhé!").
- Prompts (3 wordings each): `p.colors` "Where is the friend in the {color} hat?", `p.shapes` "Who has the {shape} flag?",
  `p.countUp` "Let's count! Find {n}!" / "Now find {n}!", `p.count` "Who has {n} stars?", `p.animals` "Where is the {animal}
  hiding?", `p.sound` "Who says {sound}? Find them!", `p.size` "Find the {size} {animal}!", letters etc. as the rocket game
  ("Find the letter {letter}!", "Who has {a} + {b}?", …).
- `sayFound(lang, ev)` ("Found you, cow! Moo!" / count chapters "Three stars! Found you!"), `sayWrong(lang, ev)` ("Boo! I'm the
  pig with the blue hat. Find red!" — names what popped out, repeats the goal, never negative, in the friend's cheerful voice
  via Pip: "Hee hee! That's the blue hat. Let's find red!"), `sayEmpty` ("Nobody there now — just a butterfly!"), `hint[]`,
  `idle[]`, `praise[]`, `great[]` with `{child}`, `party[]` ("Everybody found! Campfire dance!"), `talk.*`, `weather.0..3`
  ("Hello, spring!", "Summer camp time!", "Look at the autumn leaves!", "Brr, it's snowing!"), `surprise.swap`, `surprise.critter`,
  `critter.tap`, `topic.*`, `session.done`, `ui.*` incl. `ui.volume`, logo lines "Pip's" / "Camp Hide & Seek", VI "Cáo Pip" /
  "Chơi Trốn Tìm".

## 7. Integration (lead) — title (Pip waving beside a tent with a bush and a peeking friend), settings with volume, HUD, bubble,
pause with −/+, chapter banner, Talk time, session done (winter-night campfire party: lanterns, fireworks, every friend met).
Audio: loud chain; SFX: hop boing, rustle, pop/"boo" pop, giggle (wrong), found chime (rising per find), seat thud, fire
whoosh, count ticks, star dings, critter squeak, fanfare; campfire crackle ambience; music per season.

## 8. Performance — ≤ 6 places, ≤ 12 friends drawn, cached sprites, ≤ 160 particles; adaptive quality as the rocket game.
