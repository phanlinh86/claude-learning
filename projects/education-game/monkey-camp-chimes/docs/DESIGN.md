# Kiki's Camp Chimes — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.CC`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../elephant-city-jigsaw/` (state machine, voice, input, storage, loud audio
with volume, ui, main, tests) with `PZ → CC` and storage prefix `cc:` already replaced. **The jigsaw world is replaced by a
wind-chime world.** When a detail is missing here, do what `../elephant-city-jigsaw/docs/DESIGN.md` / `MECHANICS.md` /
`VOICE.md` do (i18n / voice API, hooks, Talk time, chapter-topic rotation between sessions, idle auto-pause, CONFIG style,
hint cooldown / idle backoff, prompt protection, phone layout tweaks, short rounds when a chapter runs long).
`../frog-rainy-band/` is the previous *music* game (tap members, drum counting) — reuse its note / count timing ideas, but this
game must NOT look or play like it (no stools, no song sheet, no big drum).
Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Pom's Puzzle Town
| Pom's Puzzle Town | Kiki's Camp Chimes |
|---|---|
| drag a piece into its shadow | **tap or swipe a hanging chime**: it swings like a pendulum and rings its note |
| board + tray | **a log beam** across the upper screen between two pine posts; 2–5 chimes hang from it on cords; a **lantern garland** above the beam |
| Pom the elephant, bottom-left | **Kiki** (`kiki`), a little monkey with a cream camp bandana, bottom-left beside a **campfire** |
| town street, spring → winter | **mountain campsite** (tents, pines, mountains, a lake), **morning → noon → sunset → starry night** |
| picture comes alive, page turn | each right note **lights a lantern**; then **song time**: one swipe rings all the chimes in a cascade; chimes are pulled up |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px. `hudKeep` boxes as in the jigsaw game.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */, phone /* long/short > 1.9 */,
    groundY,          // ground line: H - ins.bottom - (portrait ? 26 : 14)
    bubble: {x,y,w,h}, hud: {x,y,w,h},          // as the jigsaw game
    kiki: { x, y, h, w },   // FEET point and height: landscape x = ins.left + 118, y = groundY − 4, h = 230; portrait x = ins.left + 104, h = 200
    fire: { x, y, s },      // the campfire (logs + flames) base centre on the ground; landscape: x = kiki.x + 150, y = groundY − 6, s = 1;
                            // portrait: x = W − ins.right − 120, y = groundY − 6, s = 0.9. Decoration only (never a touch target).
    beam: { x0, x1, y, r }, // the log beam (centre line y, radius r = 15) from post to post. Landscape: x0 = ins.left + 250,
                            // x1 = W − ins.right − 36, y = max(ins.top + 210, bubble bottom + 92). Portrait: x0 = ins.left + 36,
                            // x1 = W − ins.right − 36; y chosen so the lowest chime bottom sits ≥ 60 px above Kiki's head
                            // (kiki.y − kiki.h) AND ≥ 40 px above the fire top, but never above bubble bottom + 92.
    posts: [{x, top, bottom}, {x, top, bottom}],   // the two pine-log posts at x0 and x1, from beam.y − 70 down to groundY
    garland: { x0, x1, y, sag },                   // lantern string between the post tops: y = beam.y − 62, sag 26
    lanterns: [{x, y}],     // up to 5 lantern centres along the garland (n = steps of the round), evenly spaced, on the sag curve
    hooks: [{x}],           // the chime hook points on the beam (n = chimes of the round), centred, spacing = clamp((x1 − x0) / n, 1.3 × item, 1.7 × item)
    item: 112,              // chime body size (longest side): ages ≤ 4: 112, 5: 112, 6+: 104; × 1.15 when tall/phone if it fits
    cord: [min, max],       // cord lengths: landscape [90, 150], portrait [110, 190]; each chime gets its own length (staggered
                            // heights, deterministic per round, neighbours differ ≥ 30 px) so the row looks hand-hung
  }
  ```
- If 5 chimes do not fit at 1.3 × item spacing, the item shrinks to `itemMin` (104 at age 4) and finally the spacing to 1.18 ×.
- **Chime hit test**: circle at the chime body centre (current, swung position), r = 0.6 × size + 14; nearest centre wins. The
  cord above the body also counts (a capsule 26 px wide from the hook to the body). Kiki box → `pokeKiki`. Nothing else is a target
  except surprises.
- Tap areas never overlap: neighbouring hit circles may touch; the nearest centre wins.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Curious George, no Abu, no Boots,
  no Sesame / Bluey / Paw Patrol look, no Animal Crossing items). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). `CC.PALETTE` in `content.js`.
  Below age 5 never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- **Brass** (neutral metal, never an answer colour): `#D8B26A` / dark `#9C7838` / light `#F3DFAE` — hooks, clappers, the little
  bells of the counting strings, rims. **Wood**: log beam / posts `#A87245` / dark `#6E4526` / light `#D29A66`, bark lines.
- **Kiki**: a small round monkey, fur **warm chestnut `#8A5A3B`** (shade `#6F4630`, outline `#4E2F1F`), a heart-shaped **cream face
  `#F2D9B8`** (shade `#DDBF98`), cream ear insides and belly, big round eyes (`#2F2A3A` pupils, catch-light), rosy cheeks
  `#F2A99A`, a long curly tail, a **cream camp bandana `#F1E6CF` with brown polka dots `#A27B55`** round the neck. Never wears an
  answer colour (no red / blue / yellow / green / orange / purple / pink clothing).
- **Campsite** (calm, so answer colours pop; the scene is desaturated and slightly cooler than the chimes):
  far = layered mountains with snowy peaks + a misty lake; mid = pine forest edge, two small A-frame tents (muted canvas
  `#D9C9A8` and sage `#A9B89A` — never saturated), a log bench, a wooden signpost; ground = grass meadow with a dirt path,
  pebbles and little ferns. Moods (`morning | noon | sunset | night`):
  morning: sky `#F7D9C4 → #FDF3E1`, low sun upper-left, lake mist bands, soft;
  noon: sky `#7CC4EE → #D6F0FB`, bright, sun high, puffy clouds;
  sunset: sky `#F29B6B → #FBD7A5` (top `#B9729A` violet band acceptable), sun low right, long warm light, silhouetted pines;
  night: sky `#1E2A4A → #3B4C78`, a crescent moon, star field, deep blue pines, tents glowing warm from inside.
  **Night readability:** chimes are always drawn un-tinted with a warm campfire/lantern rim light; the ground and far layers carry
  the darkness.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Kiki, surprise animals & icon — character artist A (`tools/art_kiki.py`)
| File | viewBox | Notes |
|---|---|---|
| `characters/kiki_{idle,blink,talk,happy,cheer,think,oops,wave,point,dance}.svg` | 0 0 300 300 | Kiki 3/4 view facing RIGHT (towards the chimes) but eyes on the child, sitting/standing on the ground, **feet anchor (150, 292)**, identical body in every frame; happy = big smile; cheer = both arms up, eyes ^^; think = finger on chin, head tilt; oops = "hmm?" (never sad); talk = mouth open; wave = one arm waving high; point = arm pointing up-right (at the chimes); dance = one leg up, arms out, tail swirl (alternated with cheer for dancing) |
| `characters/kiki_full_wave.svg` | 0 0 300 300 | title pose: waving and holding a little brass bell on a string (brass, NOT an answer colour) |
| `characters/hedgehog.svg`, `characters/hedgehog_ball.svg` | 0 0 160 120 | cute round hedgehog (spines warm grey-brown `#9C8B7A`, face cream `#EBD9C0`, pale pink nose `#E7B6B0`), facing RIGHT, bottom anchor (80, 116); ball = curled up (round spiky ball, a tiny nose peeking) |
| `characters/bird.svg`, `characters/bird_sing.svg` | 0 0 120 100 | a small round songbird (soft grey-blue-ish `#A9B4C2` back, cream belly `#F3E7D3`, tiny brass beak) — NOT answer colours; facing LEFT, feet anchor (60, 96); sing = beak open, head up, 2 tiny curved song lines (no notes) |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Kiki ringing a hanging bell under a log beam with 2 more chimes, warm sunset camp background full bleed |

### 4.2 Chime art (canvas code) — character artist B: `game/js/chime_art.js` → `CC.ChimeArt`
Pure canvas drawing (Path2D cached per thing+size), node-safe at load. Origins and sizes in logical px; the caller sets the
transform. **All chimes share the anchor: origin = the TOP of the body (the point where the cord attaches), the body hangs
DOWN (+y), `size` = the longest side of the body.** The cord itself is drawn by the caller with `drawCord`.
```
CC.ChimeArt.drawChime(ctx, thing, size, opt)
  // thing = { kind, color?, shape?, n?, animal?, text?, big? }
  // opt = { glow 0..1 (soft gold halo), ring 0..1 (just struck: a bright rim flash + 2–3 expanding ring arcs around the body,
  //         ring decays 1 → 0 over ≈0.8 s: draw rings at radius size*(0.6 + (1-ring)*0.7), alpha = ring), dim 0..1,
  //         count -1|0..n (counting strings: the first `count` little bells get a white ring + a tiny shine),
  //         clap -1..1 (clapper swing offset inside a bell), night 0..1 (adds a warm rim light, never darkens the body),
  //         pop 0..1 (1 = normal; shrinks to 0 when leaving) }
  //  kind 'bell'   : a classic round camp bell (dome + flared lip) in thing.color base/dark/light with a brass crown loop on top
  //                  and a brass clapper peeking under the lip (moves with opt.clap); bell height = size, width ≈ 0.86 × size
  //  kind 'plate'  : a flat chime plate cut in thing.shape (CC.SHAPES = circle, square, triangle, star, heart, rect, diamond,
  //                  oval), filled thing.color with a bevel and a shine, a small brass ring at the top; the silhouette IS the shape;
  //                  rect 1.5:1 wide, oval 1:1.35 tall
  //  kind 'string' : thing.n (1–5) little brass bells hanging from a short wooden bar (the bar is the top; bells hang below it
  //                  at slightly different heights, clearly separated, countable at a glance); bar width grows with n
  //  kind 'dots'   : a round cream wooden plate `#FFF6E6` (outline `#B89B72`) with thing.n (1–12) red dots in a ten-frame-ish grid
  //  kind 'animal' : a wooden cut-out chime of thing.animal (CC.ANIMALS = bear, fox, owl, deer, rabbit, squirrel, frog, duck): a
  //                  cute flat animal face/body in its own natural colours (not answer-saturated), white sticker border 6 px,
  //                  a small brass bell under it; distinct silhouettes; `opt.ring` also opens the animal's mouth ("sings")
  //  kind 'glyph'  : a wooden tag with a chunky letter / number thing.text (1–2 chars) carved on it, cream face `#FFF8EC`,
  //                  coloured edge (thing.color or `#8FA6C9`); font '900 …px ui-rounded, "Arial Rounded MT Bold", Nunito, "Arial Black", system-ui'
  //  thing.big true/false (age 3 "big & small"): the caller already passes the size
CC.ChimeArt.bodyBox(thing, size) → { w, h, cy }   // visible box (≤ size × size) and the body centre offset below the anchor (cy)
CC.ChimeArt.drawCord(ctx, x0, y0, x1, y1, opt)    // a twisted jute cord from the hook (x0,y0) to the chime top (x1,y1); opt {night}
CC.ChimeArt.drawBeam(ctx, layout, opt)            // the log beam + the two pine-log posts + little brass hooks; opt {t, wob (px beam
                                                  //   wobble), night 0..1, hooks:[x]}
CC.ChimeArt.drawGarland(ctx, garland, lanterns, opt)   // the string between the post tops + round paper lanterns (warm cream
                                                  //   `#F6E7C8`, unlit) at lanterns[i] = {x, y, lit 0..1, color (answer key of
                                                  //   the note that lit it, or null), swing rad, flash 0..1}; lit = warm glow +
                                                  //   tinted paper (light tone of the colour; brass-gold when color null)
CC.ChimeArt.drawFire(ctx, fire, opt)              // the campfire: stone ring, crossed logs, 3-layer animated flames (opt.t),
                                                  //   glow on the ground (opt.glow 0..1), sparks are particles (weather)
CC.ChimeArt.drawNote(ctx, x, y, size, opt)        // a glowing music note (♪ drawn with paths, no font) for the note that floats
                                                  //   up to a lantern; opt { color (answer key or null → gold), alpha, rot }
CC.ChimeArt.drawIcon(ctx, thing, size)            // Talk time / previews, origin = CENTRE: any chime thing (drawChime centred),
                                                  //   plus 'number' {n} (a big rounded numeral with n dots under it), 'color'
                                                  //   {color} (a paint blob), 'size' {big}
CC.ChimeArt.drawGhostHand(ctx, size, press)       // friendly pointing hand (hint), origin = fingertip, press 0..1
CC.ChimeArt.drawFirefly(ctx, x, y, r, glow)       // a firefly (tiny body + warm yellow-green glow `#E9F59A`, not answer green)
```
Contact sheets (`tools/chime_sheet.js` → `docs/art/chime_*.png`): every kind × colour / shape / animal / n / glyph at in-game
size (112) and 3×, with ring 0 / 0.7, glow, count, on morning / noon / sunset / night backgrounds; the beam + garland (0, 2, 3
lanterns lit) + fire. Plus `tests/unit/chime_art.test.js` (node, a mock 2D context: every kind draws without throwing,
bodyBox ≤ size, all public functions exist).

### 4.3 Environment — environment artist (`tools/art_env.js`, `tools/env_scenes.js`)
For `m ∈ morning|noon|sunset|night`:
- `env/far_<m>.svg` (0 0 1200 720): layered mountains (snowy peaks), a lake strip with reflections / mist (morning); bottom-anchored,
  horizontally tileable (seam at 0/1200), transparent top. Sky colours in a comment `<!-- sky #top #bottom -->`.
- `env/mid_<m>.svg` (0 0 1200 300): pine forest edge, two small tents (night: warm glowing doorway), a log bench, a signpost,
  ferns; bottom-anchored, tileable.
- `env/ground_<m>.svg` (0 0 1200 260): meadow grass with a dirt path, pebbles, little flowers (muted, not answer-saturated);
  tileable; the top 40 px is the edge where the mid layer stands.
- `env/sun.svg` (0 0 200 200), `env/moon.svg` (0 0 200 200, a friendly crescent, no face), `env/cloud_a.svg`, `env/cloud_b.svg`
  (0 0 300 140).
- Particles (0 0 32 32): `mist` (soft long puff, 64×32 viewBox allowed), `mote`, `sparkle`, `star` (twinkle), `ember` (orange
  spark, small), `firefly` (glow dot), `leaf` (a pine needle tuft / small leaf for the noon breeze), `butterfly` (tiny pale
  butterfly), `confetti_a`, `confetti_b`, `dot` (white, tinted by code), `dust` (soft round puff), `note` (a tiny music
  note for ambient sparkles — paths only).
- `tools/env_scenes.js` exports `RECIPE` (layer heights for H=720 landscape and portrait scaling, sky colours, sun / moon
  positions per mood, the tall-portrait background ×1.36 rule, star-field density) + composed scenes at 1556×720, 960×720,
  720×1556 per mood and a seam test into `docs/art/`.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `chime_art.js` (+ `tools/chime_sheet.js`, `tests/unit/chime_art.test.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_kiki.py`, `tools/kiki_sheet.js`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, chime_art, render, ui, main.

### 5.1 Content (`content.js` → `CC.Content`)
```
CC.PALETTE, CC.COLORS ['red','blue','yellow','green','orange','purple','pink'], CC.SHAPES, CC.ANIMALS,
CC.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
CC.NOTES = ['C5','D5','E5','G5','A5','C6','D6']   // pentatonic; note index per chime
CC.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short }) → round   // pure, deterministic, self-checks
CC.Content.makeTalk(topic, { age, lang, rng }) → talk   // { promptKey, params, show: thing | null, choices:[{id, thing}], answer }
CC.Content.topicsFor(age, rng, lastTopics)
CC.Content.validate(round) → null | reason
round = { topic, age, lang, roundIndex, surprise: null|'hedgehog'|'bird'|'fireflies',
  chimes: [ { id, thing: { kind, color?, shape?, n?, animal?, text?, big?, nameKind, nameValue }, note /* index into NOTES */,
              target: bool } ],
  steps:  [ { mode: 'find' | 'findAll', targets: [chimeId] /* find: exactly one */, need, promptKey, params, nameKind, nameValue } ],
  song:   [chimeId…] /* the targets in step order = the tune */ }
```
- Every step asks for one chime not yet rung right; at each step exactly ONE chime matches the ask (distractors never match).
  A chime that was already rung right may still be rung again (it just rings, `brush`), never asked again.
- Chimes per round (targets + distractors): warm-up (round 0) = 2 targets, no distractor. Age 3: 2 targets (+1 distractor from
  round 2); age 4: later 3 targets + 1 distractor (level 0 = the first chapter: 3 targets, no distractor); age 5: 3–4 + 1;
  age 6+: 4 + 1. `short` rounds use 2 targets. Max 5 chimes. Content varies every round; never the same set twice.
- Notes: targets get ascending pentatonic notes in step order (so the song climbs), distractors a random free note.
- `colors`: `bell` chimes in different colours (age 3: 2, 4: 3, 5+: 4); prompt `p.colors {color}` ("Ring the RED bell!").
- `shapes` age 3–4: `plate` chimes, all one random colour (age 3: circle/square/triangle/star/heart; 4: + oval, rect, diamond but
  never square+rect, circle+oval, square+diamond in one round). Age 5 (`p.shapes5 {shape, color}`): mixed shapes and colours.
- `size` (age 3): two bells of the same colour, big (size × 1.25) and small (× 0.75). `p.size {size}`.
- `count`: age ≤ 4 `string` chimes n ∈ 1–5, all different n; warm-up 1 vs 2, then up to 3–5; `p.count {n}`; the right chime's
  bells are counted aloud. Age 5+ `dots` plates n 1–10 (6: up to 12), distinct n, no neighbours (n, n±1) at age 5.
- `animals`: `animal` chimes, 2 / 3 / 4 different animals (age 3 / 4 / 5+). `p.animals {animal}` ("Ring the BEAR!").
- `letters` (age 5: capital glyphs), `lower` (prompt shows the capital; drop `l`/`I`, no b/d/p/q together), `initial` (animal
  chimes with distinct initials in that language), `add` / `sub` (number glyphs), `oddeven` (`findAll`: "Ring all the ODD
  numbers!", need 2–3; a wrong-parity ring = a mistake).

### 5.2 `CC.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API as the jigsaw game: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i),
update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag() (= cancel the gesture), hint(), talkAnswer(id), prompt(),
resetNudges(), skipTalk(), layout, hudKeep, state, phase, level, topic, round, cur, step, stepInfo, roundsPerLevel, stars,
levelStars, roundStars, misses, talk, alpha, stateTime, phaseTime, interactive, weather (= level % 4), chimes, lanterns, beam,
kiki, hedgehog, bird, fireflies, notes, hintHand, songs, chimeById(id)`.
States `intro | round | roundDone | talk | levelDone | sessionDone`. Phases in a round: `'enter' | 'play' | 'song' | 'out'`.
- **Chime physics**: each chime is a damped pendulum hanging from its hook: `theta'' = −(g/L)·sin(theta) − c·theta'` with
  L = cord + body cy (logical px), g ≈ 2200 px/s², damping so a full swing dies down in ≈ 3–4 s; the body adds a small
  secondary spin (`spin`, spring ω ≈ 10, ζ ≈ 0.25) lagging the cord, so it looks hung, not rigid. Idle: a faint breeze
  (tiny random impulses, ± 0.02 rad). Body centre = hook + L·(sin θ, cos θ).
- **enter** (≈ 1.2 s): the beam wobbles in, chimes drop from above the top edge on their cords one by one 0.14 s apart: the cord
  length springs from 0 to L with overshoot (vertical spring ω ≈ 14, ζ ≈ 0.45 → a visible bounce), event `chimeIn {id, i, x, y}`
  each, then `ask {promptKey, params, mode, step, first}` → `play`. Lanterns of the round appear unlit.
- **play** — one active pointer; a gesture = down … up:
  - `pointerDown(x, y)` on a chime (hit test) → that chime is **struck**: impulse `theta' += ±kTap` pushing AWAY from the
    finger's side (finger left of the body centre → swings right), `ring` = 1, `clap` kick; event `ring {id, thing, note, x, y,
    strength, judged: true}`; then judged (below). This is the gesture's first contact.
  - `pointerMove`: the finger path (segment from the previous point) crossing a chime's hit circle strikes it with an impulse from
    the finger's horizontal velocity (clamped; at least kTap × 0.6), rate-limited per chime (0.18 s). If the gesture has not yet
    touched a chime, this is its first contact and is **judged**; otherwise it is a **brush**: event `ring {…, judged:false,
    brush:true}` (soft note), never a mistake, never progress.
  - Judging the first contact:
    - the asked chime → **right**: event `right {id, thing, x, y, count?: {n}}`, `chime.glow` flash, a note sprite flies from the
      chime to the next lantern (`w.notes[] = {x, y, x0, y0, x1, y1, t, color, lantern}` ballistic-ish curve 0.7 s), on arrival
      event `lantern {i, x, y}` and the lantern lights (`lit` 0 → 1, `flash`, it swings). Counting strings: the bells light one by
      one (`chime.count` 0..n, `countStep` 0.5 s), event `count {id, i, x, y}` each. Then `stepDone {step, last}`; the next step's
      `ask` after `askGap` (with `next` wording), or **song** after the last.
    - another chime → **wrong** `{id, got:{nameKind,nameValue}, want:{nameKind,nameValue}, streak, x, y}`: it swings with a dull
      note (`ring` 0.5, no rim flash), Kiki `oops`; counts as a miss.
    - a chime already rung right this round → a brush (rings, no line).
  - Press on nothing / the beam / the sky → `soft {x, y}`: the beam wobbles 2 px, every chime gets a tiny nudge; counts as a
    tap without progress (2 → hint, 6 → assist (ages ≤ 4: 3): the asked chime glows big and the next press ANYWHERE within the
    beam band strikes the asked chime). Press on Kiki → `pokeKiki`.
  - A quick tap is the normal input here (no drag), so there is no tap-vs-drop rule; the hit test is generous instead.
  - After 2 misses in a step, or `hint()`: `hint {id}` — the asked chime glows, the ghost hand moves to it and taps twice
    (`w.hintHand = {x, y, t, press, alpha, id, mode:'tap'|'swipe'}`); cooldown 6 s; idle nudges after 12 s, backoff ×1.5 up to
    30 s (`idle {n}`; the 2nd idle also hints).
- **song** (≤ 4.5 s + the cascade): event `roundDone {round, stars, misses}` at its start (3/2/1 stars for 0/1/≥2 misses), then
  `songAsk {}` (main: "Now play our song — swipe across the chimes!"), the ghost hand shows a left → right swipe across the beam
  band (`mode:'swipe'`). The first press or swipe touching ANY chime (or after `songWait` 4 s without one → auto) starts the
  **cascade**: every chime in left → right order (from the touched one outwards if a tap) is struck 0.16 s apart with a strong
  impulse, event `songNote {id, i, note, x, y}` each; each lantern flashes in turn; Kiki `dance`/`cheer` alternate; event
  `songDone {auto}` 0.6 s after the last note. Other touches during the cascade just strike (brush).
- **out** (≈ 0.9 s): the chimes are pulled up (cord length → 0, ease-in, they swing up), distractors first; lanterns stay lit
  until the next round resets them; event `chimesOut {}`; the round's tune is pushed to `w.songs` (`{level, notes:[note], colors}`).
  Next round (enter) or Talk time after round 4 / once the chapter passed 75 s with ≥ 3 rounds done.
- `w.chimes[] = { id, thing, note, target, hookX, cord (current length), L, theta, omega, spin, x, y (BODY TOP = cord end), cx, cy
  (body centre), size, state 'enter'|'hang'|'out'|'gone', done (rung right this round), ring 0..1, glow 0..1, clap, count -1..n,
  dim, pop, + _px _py _ptheta _pspin _pcord }`.
- `w.lanterns[] = { x, y, lit 0..1, color|null, swing, flash }`, `w.beam = { wob, _pwob }`.
- `w.kiki = { mood idle|talk|happy|cheer|think|oops|wave|point|dance, moodT, blink, look (−1..1), hop 0..1 }`.
- Surprises (one round per chapter, rotating, never in the warm-up): chapters 0–2 rotate **hedgehog** / **bird**, chapter 3
  (night) is **fireflies**:
  - hedgehog: 3–8 s after the ask it trundles along the ground line from the right, behind the fire, stops near the middle, sniffs,
    leaves after ≈ 7 s (`w.hedgehog = {x, y, dir, step 0..1 (waddle), ball 0..1, roll, state 'walk'|'sniff'|'ball'|'leave', t}`,
    event `hedgehog`); tap → `hedgehogTap`: it curls into a ball (ball → 1), rolls 40 px, uncurls.
  - bird: flies in and lands on the beam at a free spot between hooks (never on a chime cord), hops, leaves after ≈ 7 s
    (`w.bird = {x, y, dir, hop, sing 0..1, state 'fly'|'perch'|'leave', t}`, event `bird`); tap → `birdTap {note}`: it sings the
    last note rung.
  - fireflies: 5 fireflies drift down near the beam band but between chimes (`w.fireflies[] = {x, y, r, glow, phase, state}`,
    event `fireflies`); tap one → `fireflyTap {x, y}` (it flares and zips off).
  A chime under the finger always wins over a surprise.
- Events also: `level {level, topic, weather}`, `round {round, surprise}`, `talk`, `talkAsk {n}`, `talkResult`, `levelDone`,
  `sessionDone {stars, songs}`. Every positional event carries `x, y`.
- Rotation / resize mid-round: re-layout; cancel the gesture; hooks re-placed; chimes keep theta/omega; notes in flight retarget.

### 5.3 `CC.Weather` — `setWeather(i, {instant})` (0 morning, 1 noon, 2 sunset, 3 night; crossfade 2.5 s), `resize(W,H,groundY)`,
`update(dt)`, `ambient` (`skyTop, skyBottom, tint (overlay rgba for far/mid/ground only), light 0..1, sunX, sunY, sunA 0..1, moonA,
starsA, fire 0..1 (campfire glow strength: morning 0.4, noon 0.25, sunset 0.7, night 1), mood`), `stars[]` (`{x, y, r, tw}` sky star
field for night), `clouds[]` (`{type, x, y, s, alpha}`), `particles[]` (`{type, x, y, r, rot, alpha, size}`): morning mist bands +
motes, noon a few butterflies + leaf flutter, sunset embers from the fire + golden motes, night fireflies + embers. `fireAt(x, y)`
(embers rise from there), `addDust(x, y, n)`, `burst(x, y, {kind: 'stars'|'sparkle'|'notes'|'embers', n})`, `setParty(on)`
(confetti + star bursts). Cap 120.

### 5.4 `CC.Bot` — taps through `world.pointerDown/Up` (and a swipe via `pointerMove` for the song): taps the asked chime with
p = skill (else a random other chime), aim error ±0.3 × r, human-ish delays (0.8–2.2 s) after `ask`; sometimes swipes instead of
tapping (first contact = the one it aims at); song: swipes left → right across the beam band (or waits for auto); answers Talk
right with p = skill; taps surprises sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.CC.debug = { world, weather, mode, stats, events, getState(), setSpeed(n), startGame(), goTitle(),
setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog, chimeScreen(id) → {x,y,r} CSS px (body centre + hit radius),
beamScreen() → {x0,x1,y} CSS px, kikiScreen(), hedgehogScreen(), birdScreen(), fireflyScreen(), answer() → {chime} (what to
tap next, or {song:true}), toScreen(x,y), audio() }`. World supplies `chimeHit(id)` {x,y,r}, `kikiHit()` (box), `hedgehogHit()`,
`birdHit()`, `fireflyHit()` (circles or null), `answer()`.

## 6. Voice, language — as the jigsaw game §6 with helper **Kiki** (EN "Kiki", VI "Khỉ Kiki" in titles, "Kiki" in lines), a
cheerful little monkey: pitch ≈ 1.2, rate ≈ 0.9. Chime = "chime" / "chuông". Things (VI): bell "chuông", plate "tấm chuông
hình …", string of bells "chùm chuông" (n "cái chuông"), animals "con gấu / con cáo / con cú / con hươu / con thỏ / con sóc /
con ếch / con vịt"; shapes "hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật, hình thoi, hình bầu dục".
`I18N` API used by main (all `(lang, e)` → string, e = the event + `{topic, params, thing}`):
- `ask(lang, promptKey, params, {next})` — prompts (3 wordings each): `p.colors` "Ring the {color} bell!" / "Bé ơi, rung chuông
  màu {color} nhé!", `p.shapes` "Ring the {shape}!", `p.shapes5` "Ring the {color} {shape}!", `p.size` "Ring the BIG bell!",
  `p.count` "Ring the one with {n} bells!" (dots: "with {n} dots"), `p.animals` "Ring the {animal}!", `p.letters`, `p.lower`,
  `p.initial`, `p.add`, `p.sub`, `p.oddeven`; `next` → "Now…" / "Giờ thì…".
- `sayRight(lang, e)` — the chime's name + a short ding ("Ding! The red bell!", "Đinh! Chuông màu đỏ!"); `sayCount(lang, i)`,
  `sayCountRun(lang, n, kind)` ("One, two, three bells!" / "Một, hai, ba cái chuông!").
- `sayWrong(lang, e)` — names what was rung, then the goal ("That's the blue bell. Let's ring the red one!"), never negative.
- `sayName(lang, thing)` — a chime's plain name (for brushes in Talk / tests).
- `talkWrong(lang, answer)` as before.
- Keys: `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`, `song[]` ("Now play our song — swipe across the chimes!"),
  `songDone[]` ("Beautiful music!"), `talk.*`, `weather.0..3` ("Good morning, mountains!", "Sunny noon!", "Sunset time!",
  "Starry night!"), `surprise.hedgehog`, `hedgehog.tap`, `surprise.bird`, `bird.tap`, `surprise.fireflies`, `firefly.tap`,
  `enter[]` ("New chimes!"), `topic.*`, `session.done`, `party`, `ui.*` incl. `ui.volume`, logo lines "Kiki's" / "Camp Chimes",
  VI "Khỉ Kiki" / "Chuông Gió Lửa Trại".

## 7. Integration (lead) — title (Kiki waving with a little bell beside a small beam with 3 chimes, ▶ Play, star total, language
toggle, hold-⚙), settings with volume, HUD, bubble, pause with −/+, chapter banner, Talk time, session done (Kiki dances by the
fire, all lanterns glow, the chapter songs replay softly, confetti). Audio: chime notes (bell: additive partials 1, 2.76, 5.4 with
fast decay; plate: brighter; string: several small jingles; animal: wood-block + a tiny "voice" chirp), brush = same note softer,
wrong "bonk" (low muted wood), count jingles, lantern "pop-glow", note fly whoosh, cascade (strum), soft beam knock, hedgehog
sniff + roll, bird tweet, firefly twinkle, ambience per mood (morning birds, noon breeze, sunset crickets start, night crickets +
fire crackle), music bed per mood (soft guitar/kalimba plucks, ducked under speech and during the cascade).

## 8. Performance — ≤ 5 chimes, Path2D cached per thing+size, ≤ 120 particles; adaptive quality as before.
