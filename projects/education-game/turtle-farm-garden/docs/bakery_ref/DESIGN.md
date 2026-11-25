# Mochi's Icing Bakery — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.FT`**, storage prefix **`ib:`**. Classic `<script>` files, no build
step, node-safe at load (touch the DOM lazily). The code base is a copy of `../turtle-sea-paint/` (state machine, voice,
input, storage, loud audio with volume, ui, main, tests) with `SP → FT` already replaced. **The paint world is replaced by
a TRACE world** (choose an icing bag / a cookie by tap, then follow a dotted path with the finger). When a detail is missing
here, do what `../turtle-sea-paint/docs/DESIGN.md` / `MECHANICS.md` / `VOICE.md` do (layout maths, i18n / voice API,
Talk time, chapter-topic rotation, idle auto-pause, CONFIG style, hint cooldown / idle backoff, test hooks). Those copies
are also in this folder's `docs/` until their owner rewrites them. Target: iPhone + iPad Safari first, portrait + landscape.

## 1. What changes versus Nini's Sea Painting
| Nini's Sea Painting | Mochi's Icing Bakery |
|---|---|
| tap a paint shell, tap a part of a picture | tap an **icing bag** or a **choice cookie**, then **trace** the glowing dotted path; icing flows under the finger |
| Nini the turtle beside a shell-framed canvas | **Mochi** (`mochi`), a round baby panda baker in a cream chef's hat + apron, beside a **baking tray** |
| seabed, seasons through the water | **bakery kitchen**, seasons seen through the kitchen window: spring → summer → autumn → winter |
| picture comes alive and swims away | the finished cookie sparkles, sprinkles rain, it **hops** off the tray onto the **cooling rack** (row of done cookies) |
| fishy / pearl surprise | **bird** flutters across the top (tap → chirp + sprinkle shower) / **mouse** peeks from a **flour sack** (tap → flour puff) |

## 2. Screen and layout (same maths as sea paint §2; renamed fields)
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(...)`.
  Screen = world space, y down. `ins` = safe-area insets (logical px).
- `World.setViewport(W, H, ins)` → `layout = { W, H, ins, portrait, tall, groundY, frame, bubble, hud, keep[],`
  - `tray: {x, y, w, h, s}` — the INNER tray box (authoring box **600 × 400**, s = scale; `w = 600 s`). Same placement
    rules as sea paint's `canvas` (landscape right of Mochi; portrait full width below the bubble; tall portrait larger).
  - `choices: {y, slots[{x, y, r}], hitR, n, column}` — icing bags / choice cookies row under the tray (or a column right
    of it on wide landscape phones), r = 58 (≥ 116 px wide), gap ≥ 24, up to 5 slots, hitR = r + 18. Same as `palette`.
  - `mochi: {x, y (FEET), h, w}` (landscape h 250 bottom-left; portrait h 210 beside the choices),
  - `bag: {x, y}` resting nozzle tip in Mochi's paw (fallback when the hand json is missing),
  - `rack: {x, y, w, h, slots[{x,y}]}` — the cooling rack strip where finished cookies land (4 slots, cookie size ≈ 74 px):
    landscape: above Mochi's head, left column, below the bubble (or under the HUD if the bubble is wide); portrait: a strip
    under the bubble, left of the tray top / or between choices and ground. Never under the bubble/HUD. render draws the rack
    (`CookieArt.drawRack`) and the cookies in `w.rackCookies`.
  - `sack: {x, y (bottom), w, h}` flour sack beside the choices (mouse surprise), `birdY` lane at the top. `}`
- Nothing the child must touch under the HUD or the bubble.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for references only (real piping bags, sugar cookies with royal icing, bakery kitchens,
  baby pandas). Never copy a known character/brand (no Kung Fu Panda / Po, no Pusheen, no "We Bare Bears" Panda, no Pororo,
  no Peppa, no Duolingo look, no Great British Bake Off branding). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact, base/dark/light)** — `FT.PALETTE` in `content.js` (unchanged from sea paint): red
  `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`, yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`,
  orange `#FF9A2E/#C4650C/#FFCB8E`, purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5).
  Below age 5 never blue+purple, red+green, yellow+orange, green+orange in one round.
- **Cookie dough** (never an answer colour): dough `#E9B872`, light `#F6D59D`, shade `#C98E4A`, outline `#9A6330`, baked
  rim `#D79B55`; chocolate chips `#5A3A28` / highlight `#8A5E44`. Embossed glyphs on choice cookies: `#8A5A2E` with a light
  bevel `#F8E2B8` (readable at 116 px: glyph height ≥ 56 px).
- **Icing** (royal icing look): a stroke of width `22 picture px` (× s on screen), round caps/joins: dark-tone under-edge
  (offset +2 px down), base colour body, a thin light-tone gloss line (offset −3 px, width 30 %), tiny white specular dots.
- **Guide dots**: cream `#FFF8EC` dots r = 7 px every 22 px of arc, with a soft brown shadow `rgba(110,70,30,.35)`; the
  **start** = a pulsing white ring (r 24) with a soft gold glow `#FFE7A8` and a little arrow showing the direction; a stroke
  number badge when a glyph has several strokes. Traced part of the path: dots hidden under the icing.
- **Mochi**: round baby panda, white fur `#FAF7F2` (shade `#E3DDD3`, outline `#6F6A72`), black patches (ears, eye patches,
  arms, legs) **soft charcoal `#34323D`** (outline `#22212A`, light `#55525F`), cheeks `#F6B1A0`, nose `#2B2A33`, a tall
  puffy **cream chef's hat `#FFF6E8`** (shade `#EADFCC`), a **light oatmeal apron `#E9DFD2`** with a flour smudge and a tiny
  wooden-spoon pocket `#B98A5A`. No answer colour on Mochi.
- **Bakery kitchen** (calm, warm, slightly desaturated so the icing pops): cream-butter wall `#F6E9D2` with soft tiles
  `#EEDDC2`, wood `#C99A6B / #A87A4E`, copper pots `#C98A5C`, sage-grey cabinets `#B9C3B2`. The **window** shows the season:
  spring: pale blue sky, pink blossom branch, petals; summer: bright sky, sun, green leaves, warm light bars on the wall;
  autumn: amber sky, orange/brown tree, falling leaves; winter: grey-blue sky, snowy branch, frost corners, cosy warm light.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Mochi & surprises & icon — character artist A (`tools/art_mochi.py` or `.js` generator)
| File | viewBox | Notes |
|---|---|---|
| `characters/mochi_{idle,blink,talk,happy,cheer,think,oops,wave,pipe,point}.svg` | 0 0 300 300 | Mochi 3/4 view facing RIGHT (towards the tray), eyes on the child, **feet anchor (150, 292)**, identical body in every frame; happy = big smile; cheer = paws up, eyes ^^; think = head tilt, paw on chin; oops = "hmm?" (never sad); talk = mouth open; wave = one paw high; pipe = right paw forward at chest height (squeezing); point = right paw pointing up-right. The icing bag is NOT in the SVG: write the right-paw grip point per frame to `docs/art/mochi_hand.json` (`{"idle":[x,y], …}` in viewBox px). |
| `characters/mochi_title.svg` | 0 0 300 300 | title pose: waving, holding a cookie with a heart of icing in the other paw |
| `characters/bird.svg`, `characters/bird_flap.svg` | 0 0 160 120 | a little round sparrow-like bird, soft lilac-grey `#B8AFC9` with cream belly (NOT an answer colour), facing RIGHT, centre anchor; flap = wings up |
| `characters/sack.svg` | 0 0 160 140 | an open burlap flour sack `#D9C7A3` with a little flour on top, bottom anchor (80, 136) |
| `characters/mouse.svg`, `characters/mouse_happy.svg` | 0 0 120 100 | a tiny grey mouse `#BDB7B3` peeking (head + paws on a rim), bottom anchor (60, 98); happy = eyes ^^, floury nose |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | full-bleed: Mochi piping a heart onto a big cookie, warm kitchen background |

### 4.2 Cookie art — character artist B: `game/js/cookie_art.js` → `FT.CookieArt` (canvas 2D + Path2D, node-safe at load)
```
FT.CookieArt.drawTray(ctx, box, opt)            // box = layout.tray (inner); a rounded baking tray (warm steel rim
    //   #C9C2B8/#9E968C, ≤ layout.frame px OUTSIDE box) with parchment `#FFF8EC` inside; opt {glow 0..1 (gold rim pulse)}
FT.CookieArt.drawRack(ctx, rack, opt)           // a wire cooling rack strip (rack = layout.rack)
FT.CookieArt.drawCookie(ctx, ck, size, opt)     // origin = centre, size = diameter (or bounding size for shapes)
    //   ck = { kind:'round'|'shape'|'glyph'|'animal'|'home', shape?, text?, animal?, home?, icing?: [{pts, hex}] }
    //   'round' plain round cookie; 'shape' a cookie CUT in FT.SHAPES[...] (circle square triangle star heart rect diamond
    //   oval, rounded corners); 'glyph' round cookie with an embossed numeral / letter (canvas text, bold rounded font,
    //   fonts: ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui); 'animal' an animal-shaped /
    //   animal-face cookie (FT.ANIMALS = dog cat bee bird frog cow rabbit fish duck pig) with simple icing details (eyes,
    //   nose) in dark/white icing — readable at 116 px; 'home' a home cookie (FT.HOMES = kennel hive nest pond barn burrow
    //   bowl basket) drawn like a gingerbread piece.
    //   opt { lift 0..1, wob px, glow 0..1 (gold outline pulse), dim 0..1, selected, sparkle 0..1, squash (sx/sy factor) }
FT.CookieArt.drawIcingBag(ctx, hex, size, angle, opt)  // origin = NOZZLE TIP, bag points down at angle 0 (+ clockwise);
    //   translucent bag filled with icing of that colour, a silver star nozzle, a twist at the top; size = length (≈120)
    //   opt { squeeze 0..1 (bag squashes, bulge), lift, wob, glow, selected, dim, empty (hex null → cream) }
FT.CookieArt.drawGuide(ctx, path, done, opt)    // path = FT.Trace path (picture px, ctx already in tray picture space)
    //   draws the remaining dots (arc length > done), the start marker at `done`, stroke-number badges; opt {pulse 0..1,
    //   glow 0..1 (hint), alpha}
FT.CookieArt.drawIcing(ctx, pts, hex, width, opt) // glossy icing polyline (picture px); opt {wet 0..1 (fresh = glossier)}
FT.CookieArt.drawChip(ctx, r, opt)              // chocolate chip origin centre; opt {squash}
FT.CookieArt.drawSprinkle(ctx, hex, len, rot)   // a little rod sprinkle
FT.CookieArt.drawIcon(ctx, thing, size)         // Talk time: 'blob'{color} | 'shape'{shape,color} | 'animal'{animal}
    //   | 'home'{home} | 'number'{n} | 'letter'{text} | 'dots'{n} | 'size'{size} | 'cookie'{…ck}
FT.CookieArt.drawGhostHand(ctx, size, press)    // friendly pointing hand (hint), origin = fingertip
FT.CookieArt.drawFlourPuff(ctx, r, t)           // soft white puff burst (t 0..1)
```
Contact sheets via `tools/cookie_sheet.js` → `docs/art/cookies_*.png` (every cookie kind/shape/animal/home/glyph at
116 px and 360 px on the tray, bags in all colours, icing samples, guide dots on a cookie), ≥ 2 improvement rounds.

### 4.3 Environment — environment artist (`tools/art_env.js` generator, `tools/env_scenes.js` composer)
For `m ∈ spring|summer|autumn|winter` (bottom-anchored, horizontally tileable, seam test at 0/W):
- `env/far_<m>.svg` (0 0 800 720): the back wall (tiles, a little shelf), **one window per tile**, centred, inner glass rect
  **x 250–550, y 90–400** (documented in a comment `<!-- window 250 90 300 310 -->`) with the season view inside (sky, branch,
  sun / leaves / snow), curtains, a sill with a pot. Wall colour stops at the top edge (opaque — no sky gradient needed).
- `env/mid_<m>.svg` (0 0 1200 300): cabinets / shelves with jars, mixing bowls, rolling pin, an oven with a warm glow,
  copper pots; one seasonal touch per mood (spring flower vase, summer lemonade jug, autumn pumpkin, winter gingerbread house
  + warm string lights). Bottom-anchored on the counter line.
- `env/ground_<m>.svg` (0 0 1200 260): the wooden counter top (front edge at y ≈ 40) + counter front with drawers and a
  seasonal tea towel; render fills below with `ambient.floor`.
- `env/light.svg` (0 0 600 720): warm window light bars (white, transparent) for summer/morning glow.
- Particles (0 0 32 32): `petal`, `leaf_a`, `leaf_b`, `snow`, `sparkle`, `star`, `flour` (soft dot), `steam`, `sprinkle_a`,
  `sprinkle_b` (white, tinted by code), `confetti_a`, `confetti_b`, `crumb`.
- Composed scenes at 1556×720, 960×720, 720×1556 per mood + seam test into `docs/art/`.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `trace.js`, `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `cookie_art.js` (+ `tools/cookie_sheet.js`, `tests/unit/cookie_art.test.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_mochi.*`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, trace, content, world, weather, bot, storage, assets, audio, voice, input, cookie_art, render, ui,
main. (`pictures.js` / `paint_art.js` are deleted by their replacements' owners.)

### 5.1 Trace paths (`trace.js` → `FT.Trace`, pure, node-safe)
```
FT.Trace.path(spec) → path      // spec: {kind:'stroke', id:'line'|'wave'|'zigzag'|'arc'|'loop'|'swirl'}
                                //       {kind:'shape', shape, cx, cy, size}     (outline, one closed stroke)
                                //       {kind:'glyph', text:'0'..'20'|'A'..'Z'|'a'..'z', cx, cy, h}  (school stroke order)
                                //       {kind:'road', from:{x,y}, to:{x,y}, bumps}  (animal → home)
path = { strokes: [ { pts:[[x,y]…] /* resampled every 4 px */, len, closed } ], len /* total */, box }
FT.Trace.track(path, state, x, y, tol, look) → state'  // forward-only progress along the strokes: project the finger
                                //   onto the current stroke within [done, done + look] arc length; advance when the
                                //   distance ≤ tol; a stroke completes at ≥ len − tol·0.6 → the next stroke starts (its
                                //   start must be touched within tol·1.2); state = {stroke, done (arc len in stroke),
                                //   total (0..1 overall), off (finger currently off path), complete}
FT.Trace.pointAt(path, stroke, s) → {x, y, ang}; FT.Trace.drawn(path, state) → [[pts…] per stroke, done part only]
```
Glyph strokes: digits 0–9 (two-digit numbers = two glyphs side by side, each ≤ 0.48 of the width), capital A–Z and small
a–z as taught in kindergartens (few strokes, start top-left, down strokes first); every stroke ≥ 60 px; numerals/letters
fill ≈ 260 px height on the 400 px tray. Shape outlines size ≈ 300 px (start at the top, clockwise). Unit-test: every
glyph / shape exists, strokes are inside 600 × 400 with 30 px margin, and a bot following the points completes it.

### 5.2 Content (`content.js` → `FT.Content`)
```
FT.PALETTE, FT.SHAPES, FT.ANIMALS, FT.HOMES, FT.HOME_OF = {dog:'kennel', bee:'hive', bird:'nest', frog:'pond', duck:'pond',
  cow:'barn', pig:'barn', rabbit:'burrow', fish:'bowl', cat:'basket'}
FT.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
FT.Content.makeRound(topic, {age, lang, rng, roundIndex, level, surprise}) → round   // pure, deterministic, self-checked
FT.Content.makeTalk(topic, {age, lang, rng}) → talk   // {promptKey, params, show: thing|null, choices:[{id, thing, value}], answer}
FT.Content.topicsFor(age, rng, lastTopics); FT.Content.validate(round) → null | reason
round = { topic, age, lang, roundIndex, surprise: null|'bird'|'mouse',
  board: { cookie: ck|null /* the big cookie on the tray at the start (colors/count) */, home?: home },
  steps: [ { mode: 'pickBag' | 'pickCookie' | 'trace' | 'chips',
     choices?: [{id, kind:'bag', color} | {id, kind:'cookie', ck, nameKind, nameValue}], answer?: id,   // pick* steps
     path?: spec, color?,                                    // trace: the path spec (picture px) + icing colour
     need?,                                                  // chips: N
     promptKey, params, nameKind, nameValue } ] }
```
- **colors** (age 3/4/5: 2/3/4 bags): big round cookie; 1 pair `[pickBag, trace]` in round 0–1, 2 pairs in rounds 2–3
  (second pair a different colour + stroke). Strokes: line, wave, zigzag, arc, loop (age ≥ 4), swirl (age ≥ 5).
  "Let's pipe a RED wave!" → bag tap (wrong bag = mistake) → `p.trace` "Follow the dots!".
- **shapes** (2/3/4 cookies): `[pickCookie(shape cookies), trace(outline of that shape, colour from palette)]`; age 5
  icing colours vary per round. The picked cookie flies onto the tray centre and grows to ≈ 330 px.
- **size** (age 3): two round cookies big/small: pick "the BIG cookie", trace a circle around its edge.
- **count**: `[pickCookie(glyph numerals, 3 choices; round 0: skipped), trace(glyph N), chips(N)]`; N: round 0 1–2,
  round 1 2–3, rounds 2–3 age 3–4: 3–5, age 5: 4–10, age 6+: 5–12. Chips: each tap on the cookie drops a chip there
  (bounce, counted aloud); taps beyond N ignored (`already`); the step ends at N.
- **animals** (2/3/4 animal cookies): `[pickCookie(animals), trace(road from the animal (tray left ≈ (110, 260)) to its
  home (tray right ≈ (490, 250)), bumps 1–2)]`; prompt "Find the DOG cookie! Woof!" then "Pipe a road to the kennel!".
- **letters / lower / initial / add / sub / oddeven**: `[pickCookie(glyph cookies, 3–4), trace(that glyph)]`; initial shows
  an animal cookie on the tray first ("Dog starts with…") and uses words with distinct first letters in that language;
  lower: prompt shows the capital, choices are small letters (no `l`/`I`); oddeven: "Find an ODD number!" (one right).
- Warm-up round 0 of every chapter: the fewest choices (2), the easiest stroke (line / circle / numeral 1). Content varies
  every round; no repeated stroke/shape/animal back to back. Every round validated (paths complete with the bot).
- Prompt keys: `p.colors {color, stroke}`, `p.shapes {shape}`, `p.size {size}`, `p.count {n}`, `p.chips {n}`,
  `p.animals {animal}`, `p.road {home}`, `p.letters {letter}`, `p.lower {letter}`, `p.initial {word}`, `p.add {a,b}`,
  `p.sub {a,b}`, `p.oddeven {parity}`, `p.trace {what}` (after a right pick: "Now follow the dots!").

### 5.3 `FT.World` (headless, deterministic; sub-steps ≤ 1/120 s; `_p*` + `alpha` interpolation)
API as sea paint: `setViewport, setAge, setLang, newSession({lastTopics}), levels, startLevel(i), update(dt),
drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), resetNudges(), skipTalk(), layout,
hudKeep, state, phase, level, topic, round, roundsPerLevel, step, stepInfo, stars, levelStars, roundStars, misses, talk,
alpha, stateTime, phaseTime, interactive`. States `intro | round | roundDone | talk | levelDone | sessionDone`.
- Phases in a round: **enter** (≈ 1.0 s: tray content slides in, choices pop staggered, event `ask`), **play** (steps),
  **finish** (≈ 1.3 s: icing gleam sweep, sprinkles rain, `finish`), **hop** (≈ 1.4 s: the cookie hops in 2–3 ballistic
  arcs with squash to its rack slot; animals: first the animal walks along the road into its home, `home {animal}`),
  **clear** (0.4 s) → next round / Talk time (after round 4 or once the chapter passed 75 s with ≥ 3 rounds).
- **Pick steps**: a TAP (press + release < 1.0 s, < 64 px) on a choice: right → `pick {id, kind, color?}` (bag: it lifts,
  flies to Mochi's paw / tray; cookie: flies in an arc onto the tray, lands with a squash, grows), then `ask {promptKey:
  'p.trace', follow:true}`; wrong → `wrong {kind:'bag'|'cookie', got:{nameKind,nameValue}, want:{…}, streak}` (wobble).
  A tap on the cookie/tray before the pick → `needPick {}` (not a mistake).
- **Trace step**: pointerDown on the tray within `tol·1.4` of the current start → `traceStart`; any press elsewhere on the
  tray → the bag still follows (icing only on the path) — `w.bag` follows the finger with a spring (tip offset 0, so the
  icing comes out exactly under the finger), angle tilts with velocity (pendulum). `FT.Trace.track` each move; drawn icing
  grows; event `traceProgress {total}` at 25/50/75 %, `strokeDone {i, n}`, `traceDone`. Off the path > 0.6 s while
  pressing → `offPath {n}` (rate-limited, not a mistake); a lift before completion keeps the progress (`tracePause`).
  Taps on the tray in a trace step → `traceTap` ("Press and slide along the dots!"). Tol per age `CONFIG.tol =
  {3:66,4:58,5:50,6:46,7:42}` picture px, look-ahead 90 px.
  Help: after 2 `offPath`/`traceTap` or 8 s idle in the step → `hint {target:'path'}` (ghost hand slides along the next
  30 % of the path, dots glow); after 4 (ages ≤ 4) / 6 → `assist` = "magic icing": any finger movement on the tray advances
  the path by the moved distance. Never a mistake, never counts against stars.
- **Chips step**: tap on the cookie → a chip drops from Mochi's paw height in an arc to the tap point (clamped inside the
  cookie, ≥ 34 px from other chips), lands with a squash; `chip {i, n}`; at N → `chipsDone`; extra → `already`.
- After 2 wrong picks in a step, or `hint()`: `hint {target:'choice', id}` (glow + ghost hand). Cooldown 6 s; idle nudges
  after 12 s, backoff ×1.5 up to 30 s (`idle {n}`; the 2nd also hints). Tap on Mochi → `pokeMochi`.
- Render fields: `w.choices[] {id, kind, color, hex, ck, x, y, r, pop, lift, wob, glow, dim, selected, gone, _p*}`;
  `w.cookie {ck, x, y, size, rot, sx, sy, alpha, _p*}` (screen px, the big cookie on the tray, or null); `w.home {home, x,
  y, size, wob}`; `w.path` (current FT.Trace path, picture px) + `w.traceState`; `w.icing[] {pts (picture px), hex, wet}`
  (all finished + in-progress icing strokes of the round, drawn on the cookie); `w.chips[] {x, y, r, squash}` (picture px);
  `w.bag {hex|null, x, y, angle, squeeze, state 'rest'|'fly'|'trace', _p*}` (screen px, nozzle tip); `w.walker {animal, x,
  y, rot}` (animal walking the road, picture px) or null; `w.rackCookies[] {ck, icing, x, y, sx, sy}` (screen px);
  `w.hintHand {x, y, press, alpha, target}`; `w.mochi {x, y, h, mood, moodT, blink, look}` (moods idle talk happy cheer
  think oops wave pipe point); `w.bird {x, y, dir, state, t, flap}`; `w.sack {x, y, w, h, mouse 0..1 (peek), taps}`;
  `w.trayGlow`; `w.sprinkles[] {x, y, hex, rot, len, alpha}` (screen px). Picture px → screen:
  `X = tray.x + px·s`, `Y = tray.y + py·s`.
- Surprises (one round per chapter, rotating, never round 0): **bird** (`birdTap` → sprinkle shower), **mouse**
  (`mouseTap` → flour puff). Taps on choices / tray in an interactive step win over the bird.
- Rotation / resize mid-round: re-layout; cancel the press (the trace keeps its progress), everything snaps to the new
  layout.

### 5.4 `FT.Weather` — as sea paint (`setWeather(i,{instant})`, crossfade 2.5 s, `resize`, `update`, `particles[]`,
`addSplash(x,y,hex,n)` → sprinkle bits, `addPuff(x,y,n)` flour), `ambient {wall, floor, tint, light 0..1, mood}`.
Particles: always a few flour motes floating in the window light + steam from the oven side; spring petals drifting in
through the window; summer sparkles in the light bars; autumn a few leaves drifting in; winter snowflakes **outside only**
(`p.outside = true`: render clips them to the window rects). Cap 120.

### 5.5 `FT.Bot` — taps the right choice with p = skill (wrong = another choice), then TRACES: pointerDown at the start,
pointerMove along the path points with human speed (≈ 260–420 logical px/s, jitter ≤ 0.5 tol, occasional lift at ages 3–4),
pointerUp; chips: taps N spots. Delays 0.9–2.2 s after `ask`. Talk right with p = skill; taps bird / mouse sometimes.

### 5.6 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.FT.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), goTitle(),
setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog, choiceScreen(id), tracePoints() → [[x,y]…] CSS px of the
current stroke(s) remaining, cookieScreen() → {x,y}, mochiScreen(), answer() → {choice:id} | {trace:true} | {chip:{x,y}},
toScreen(x,y), audio() }`. World supplies `choiceHit(id)`, `mochiHit()`, `birdHit()`, `mouseHit()`, `answer()`,
`pathScreen()` (logical px points), `chipSpot()`.

## 6. Voice, language — as sea paint §6, helper **Mochi** (EN "Mochi", VI "Gấu Trúc Mochi" in titles, "Mochi" in lines,
TTS VI "Mô Chi"), a cheerful little panda baker: pitch ≈ 1.2, rate ≈ 0.9. Name kinds: `color`, `shape`, `stroke` (line
"line / đường thẳng", wave "wave / sóng", zigzag "zigzag / đường zíc zắc", arc "smile / nụ cười"? use "rainbow arch /
cầu vồng", loop "loop / vòng xoắn", swirl "swirl / xoáy ốc"), `animal` (VI with classifiers: con chó, con mèo, con ong,
con chim, con ếch, con bò, con thỏ, con cá, con vịt, con heo), `home` (kennel "nhà của cún / chuồng chó", hive "tổ ong",
nest "tổ chim", pond "cái ao", barn "chuồng", burrow "hang", bowl "bể cá", basket "giỏ"), `number`, `letter`, `size`,
`parity`, `word`. Lines: prompts above (3 wordings each), `say.pick`, `trace.start[]` ("Press on the shining dot and
slide!"), `trace.progress[]` ("Yummy!", "Keep going!"), `trace.stroke[]` ("Now the next line!"), `trace.done[]` per what
("A red wave! Beautiful!"), `offPath[]` ("Follow the dots!"), `traceTap[]` ("Keep your finger down and slide!"),
`assist[]` ("Magic icing! Slide anywhere!"), `chip` counting `count.<n>`, `chipsDone[]` ("3 chocolate chips!"),
`wrong.bag[]` / `wrong.cookie[]` with `{got} {want}`, `needPick[]`, `already[]`, `finish[]` ("Sprinkles!"), `hop[]`
("Onto the cooling rack!"), `home.<animal>` (the animal sound + "home!"), `hint[]`, `idle[]`, `praise[]`, `great[]`
`{child}`, `talk.*`, `weather.0..3` ("Spring blossoms outside!", "Sunny summer kitchen!", "Autumn leaves!", "Snow outside —
cosy inside!"), `surprise.bird`, `bird.tap`, `surprise.mouse`, `mouse.tap`, `enter[]`, `topic.*`, `session.done`, `ui.*`
incl. `ui.volume`, logo "Mochi's" / "Icing Bakery", VI "Gấu Trúc Mochi" / "Tiệm Bánh Quy".

## 7. Integration (lead) — title (Mochi waving with a heart cookie, ▶ Play, star total, language toggle, hold-⚙), settings
with volume, HUD, bubble, pause with −/+, chapter banner, Talk time, session done (all cookies of the session on the rack
around Mochi, confetti). Audio: bag pick "squish-plip", icing flow = soft filtered-noise squeeze whose pitch rises with
progress (stops when off path), stroke done chime, trace done sparkle arpeggio, chip "tock" + count chimes, wrong "boing",
cookie land "pat", hop boings, oven "ding" at chapter end, bird chirp, mouse squeak + puff, ambience: kitchen hum + kettle
in winter, music per season (soft music box / marimba, ducked under speech).

## 8. Performance — Path2D cached per cookie kind, icing drawn as ≤ 3 strokes per polyline, ≤ 120 particles, adaptive
quality as before.
